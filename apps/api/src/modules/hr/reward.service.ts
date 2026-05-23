import { eq, and, desc, sql } from 'drizzle-orm';
import { employeeRewards, rewardTypes, employees, users } from '@runq/db';
import type { Db } from '@runq/db';
import type { CreateRewardInput, RedeemPointsInput } from '@runq/validators';
import { NotFoundError, ConflictError, ForbiddenError } from '../../utils/errors';
import { applyHrScope, type HrAccessScope } from './access-scope';
import { HrNotifier } from './hr-notifier';

type RewardRow = typeof employeeRewards.$inferSelect;

const EMPLOYEE_NAME = sql<string>`
  trim(coalesce(${employees.firstName}, '') || ' ' || coalesce(${employees.lastName}, ''))`;

/**
 * Rewards & spot bonuses. A manager initiates a reward for a report (draft →
 * submit), HR decides (approve / reject). The monetary path continues into
 * Finance via RewardPostingService (post) and EmployeePaymentService (pay).
 */
export class RewardService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
    /// HR scope. Gates a manager (subset) to their reporting subtree for
    /// list/create/submit/delete. Defaults org-wide for admin / HR callers.
    private readonly scope: HrAccessScope = { kind: 'all' },
  ) {}

  async list(filters?: { status?: string; employeeId?: string }) {
    const conds = [eq(employeeRewards.tenantId, this.tenantId)];
    if (filters?.status) conds.push(eq(employeeRewards.status, filters.status as any));
    if (filters?.employeeId) conds.push(eq(employeeRewards.employeeId, filters.employeeId));

    const rows = await this.db
      .select({
        reward: employeeRewards,
        employeeName: EMPLOYEE_NAME,
        typeName: rewardTypes.name,
        initiatorName: users.name,
      })
      .from(employeeRewards)
      .innerJoin(employees, eq(employeeRewards.employeeId, employees.id))
      .innerJoin(rewardTypes, eq(employeeRewards.rewardTypeId, rewardTypes.id))
      .innerJoin(users, eq(employeeRewards.initiatedBy, users.id))
      .where(applyHrScope(this.scope, employeeRewards.employeeId, and(...conds)))
      .orderBy(desc(employeeRewards.createdAt));

    return rows.map((r) => ({
      ...this.toReward(r.reward),
      employeeName: r.employeeName,
      typeName: r.typeName,
      initiatorName: r.initiatorName,
    }));
  }

  async getById(id: string) {
    const [row] = await this.db
      .select({
        reward: employeeRewards,
        employeeName: EMPLOYEE_NAME,
        typeName: rewardTypes.name,
        initiatorName: users.name,
      })
      .from(employeeRewards)
      .innerJoin(employees, eq(employeeRewards.employeeId, employees.id))
      .innerJoin(rewardTypes, eq(employeeRewards.rewardTypeId, rewardTypes.id))
      .innerJoin(users, eq(employeeRewards.initiatedBy, users.id))
      .where(and(eq(employeeRewards.id, id), eq(employeeRewards.tenantId, this.tenantId)))
      .limit(1);
    if (!row) throw new NotFoundError('Reward');
    return {
      ...this.toReward(row.reward),
      employeeName: row.employeeName,
      typeName: row.typeName,
      initiatorName: row.initiatorName,
    };
  }

  async create(input: CreateRewardInput, initiatedBy: string) {
    const type = await this.requireType(input.rewardTypeId);
    await this.requireEmployee(input.employeeId);
    this.assertCanInitiateFor(input.employeeId);
    await this.assertNotSelf(input.employeeId, initiatedBy);
    const amount = this.resolveAmount(type.kind, input.amount);

    const rewardNumber = await this.nextRewardNumber();
    const [row] = await this.db
      .insert(employeeRewards)
      .values({
        tenantId: this.tenantId,
        rewardNumber,
        employeeId: input.employeeId,
        rewardTypeId: type.id,
        kind: type.kind,
        amount: amount.toFixed(2),
        title: input.title,
        citation: input.citation ?? null,
        awardDate: input.awardDate,
        status: 'draft',
        initiatedBy,
        glAccountCode: type.kind === 'monetary' ? type.glAccountCode : null,
      })
      .returning();
    return this.getById(row.id);
  }

  /** Full replace of a draft reward — refused once submitted. */
  async update(id: string, input: CreateRewardInput) {
    const reward = await this.requireReward(id);
    if (reward.status !== 'draft') {
      throw new ConflictError('Only draft rewards can be edited');
    }
    this.assertCanInitiateFor(reward.employeeId);
    const type = await this.requireType(input.rewardTypeId);
    await this.requireEmployee(input.employeeId);
    this.assertCanInitiateFor(input.employeeId);
    const amount = this.resolveAmount(type.kind, input.amount);

    await this.db
      .update(employeeRewards)
      .set({
        employeeId: input.employeeId,
        rewardTypeId: type.id,
        kind: type.kind,
        amount: amount.toFixed(2),
        title: input.title,
        citation: input.citation ?? null,
        awardDate: input.awardDate,
        glAccountCode: type.kind === 'monetary' ? type.glAccountCode : null,
        updatedAt: new Date(),
      })
      .where(and(eq(employeeRewards.id, id), eq(employeeRewards.tenantId, this.tenantId)));
    return this.getById(id);
  }

  async submit(id: string) {
    const reward = await this.requireReward(id);
    if (reward.status !== 'draft') {
      throw new ConflictError('Only draft rewards can be submitted');
    }
    this.assertCanInitiateFor(reward.employeeId);
    await this.db
      .update(employeeRewards)
      .set({ status: 'submitted', updatedAt: new Date() })
      .where(and(eq(employeeRewards.id, id), eq(employeeRewards.tenantId, this.tenantId)));
    const result = await this.getById(id);
    this.fireSubmitted(reward).catch(() => undefined);
    return result;
  }

  async approve(id: string, userId: string, approved: boolean, rejectionReason?: string | null) {
    const reward = await this.requireReward(id);
    if (reward.status !== 'submitted') {
      throw new ConflictError('Only submitted rewards can be approved or rejected');
    }
    // The initiator can never decide on their own reward — audit trail.
    if (reward.initiatedBy === userId) {
      throw new ForbiddenError('You cannot approve a reward you initiated');
    }
    const updates = approved
      ? { status: 'approved' as const, approvedBy: userId, approvedAt: new Date(), updatedAt: new Date() }
      : { status: 'rejected' as const, rejectionReason: rejectionReason ?? null, updatedAt: new Date() };
    await this.db
      .update(employeeRewards)
      .set(updates)
      .where(and(eq(employeeRewards.id, id), eq(employeeRewards.tenantId, this.tenantId)));
    const result = await this.getById(id);
    if (approved) this.fireApproved(reward).catch(() => undefined);
    else this.fireRejected(reward, rejectionReason ?? null).catch(() => undefined);
    return result;
  }

  /** Hard-delete a reward. Refused once posted/paid — the GL has moved. */
  async hardDelete(id: string): Promise<void> {
    const reward = await this.requireReward(id);
    if (reward.status === 'posted' || reward.status === 'paid') {
      throw new ConflictError('Cannot delete a reward already posted to the ledger');
    }
    this.assertCanInitiateFor(reward.employeeId);
    await this.db
      .delete(employeeRewards)
      .where(and(eq(employeeRewards.id, id), eq(employeeRewards.tenantId, this.tenantId)));
  }

  // ---- points: balance + redemption --------------------------------------

  /**
   * Current points an employee can redeem.
   * `balance = lifetime granted (approved) − redeemed (non-rejected redemptions)`.
   * Redemptions held in `submitted`/`approved`/`posted` still count as
   * redeemed so the employee can't double-spend points awaiting approval.
   */
  async pointsBalance(employeeId: string): Promise<{
    balance: number; lifetime: number; redeemed: number;
  }> {
    const [granted] = await this.db
      .select({
        total: sql<string>`coalesce(sum(${employeeRewards.amount}), 0)::text`,
      })
      .from(employeeRewards)
      .where(and(
        eq(employeeRewards.tenantId, this.tenantId),
        eq(employeeRewards.employeeId, employeeId),
        eq(employeeRewards.kind, 'points'),
        eq(employeeRewards.status, 'approved'),
      ));
    const [consumed] = await this.db
      .select({
        total: sql<number>`coalesce(sum(${employeeRewards.pointsUsed}), 0)::int`,
      })
      .from(employeeRewards)
      .where(and(
        eq(employeeRewards.tenantId, this.tenantId),
        eq(employeeRewards.employeeId, employeeId),
        sql`${employeeRewards.pointsUsed} IS NOT NULL`,
        sql`${employeeRewards.status} <> 'rejected'`,
      ));
    const lifetime = Math.floor(Number(granted?.total ?? '0'));
    const redeemed = Number(consumed?.total ?? 0);
    return { balance: lifetime - redeemed, lifetime, redeemed };
  }

  /**
   * Same as `pointsBalance` but resolves the caller's employee record
   * first. Users with no linked employee row (e.g. external auditor logins)
   * get a zero balance instead of an error — they simply have no points.
   */
  async pointsBalanceForUser(userId: string): Promise<{
    balance: number; lifetime: number; redeemed: number;
  }> {
    try {
      const empId = await this.resolveSelfEmployeeId(userId);
      return this.pointsBalance(empId);
    } catch {
      return { balance: 0, lifetime: 0, redeemed: 0 };
    }
  }

  /**
   * Employee self-service: convert points to cash at 1 pt = ₹1. Creates a
   * `monetary` reward initiated by the employee themselves with `pointsUsed`
   * set, then submits it for HR approval. Bypasses the assertNotSelf guard
   * because self-initiation is the whole point of a redemption.
   */
  async createRedemption(input: RedeemPointsInput, userId: string) {
    const employeeId = await this.resolveSelfEmployeeId(userId);
    const balance = await this.pointsBalance(employeeId);
    if (input.pointsUsed > balance.balance) {
      throw new ConflictError(
        `You have ${balance.balance} points available — not enough to redeem ${input.pointsUsed}.`,
      );
    }
    const type = await this.getOrCreatePointsRedemptionType();
    const rewardNumber = await this.nextRewardNumber();
    const today = new Date().toISOString().slice(0, 10);

    const [row] = await this.db
      .insert(employeeRewards)
      .values({
        tenantId: this.tenantId,
        rewardNumber,
        employeeId,
        rewardTypeId: type.id,
        kind: 'monetary',
        amount: input.pointsUsed.toFixed(2),
        title: `Points redemption — ${input.pointsUsed} pts`,
        citation: null,
        awardDate: today,
        status: 'submitted',
        initiatedBy: userId,
        glAccountCode: type.glAccountCode,
        pointsUsed: input.pointsUsed,
      })
      .returning();
    this.fireSubmitted(row).catch(() => undefined);
    return this.getById(row.id);
  }

  /** Lazily create the system reward type used to tag redemption rows. */
  private async getOrCreatePointsRedemptionType() {
    const [existing] = await this.db
      .select()
      .from(rewardTypes)
      .where(and(
        eq(rewardTypes.tenantId, this.tenantId),
        eq(rewardTypes.code, 'PTS_REDEEM'),
      ))
      .limit(1);
    if (existing) return existing;
    const [created] = await this.db
      .insert(rewardTypes)
      .values({
        tenantId: this.tenantId,
        name: 'Points Redemption',
        code: 'PTS_REDEEM',
        kind: 'monetary',
        glAccountCode: '5205',
        displayOrder: 99,
        isActive: true,
      })
      .returning();
    return created;
  }

  /**
   * Resolve the logged-in user to their employee record using the same
   * email-or-phone matching as `applyHrScope` — admins/HR may also redeem
   * if they have an employee record. Throws if no match.
   */
  private async resolveSelfEmployeeId(userId: string): Promise<string> {
    const [u] = await this.db
      .select({ email: users.email, phone: users.phone })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!u) throw new ForbiddenError('User not found');
    const phoneDigits = (u.phone ?? '').replace(/\D/g, '');
    const [emp] = await this.db
      .select({ id: employees.id })
      .from(employees)
      .where(and(
        eq(employees.tenantId, this.tenantId),
        sql`(
          lower(${employees.email}) = lower(${u.email})
          OR (${phoneDigits} <> ''
              AND regexp_replace(coalesce(${employees.phone}, ''), '\\D', '', 'g')
                  IN (${phoneDigits}, ${'91' + phoneDigits}))
        )`,
      ))
      .limit(1);
    if (!emp) {
      throw new ForbiddenError(
        'No employee record is linked to your account — ask HR to update your profile.',
      );
    }
    return emp.id;
  }

  // ---- guards -------------------------------------------------------------

  private resolveAmount(
    kind: 'monetary' | 'recognition' | 'points',
    amount: number,
  ): number {
    if (kind === 'recognition') return 0;
    if (amount <= 0) {
      throw new ConflictError(
        kind === 'points'
          ? 'A points reward needs at least 1 point'
          : 'A monetary reward needs a positive amount',
      );
    }
    if (kind === 'points' && !Number.isInteger(amount)) {
      throw new ConflictError('Points must be whole numbers');
    }
    return amount;
  }

  /** A manager may only initiate within their reporting subtree. */
  private assertCanInitiateFor(employeeId: string) {
    if (this.scope.kind === 'all') return;
    if (this.scope.kind === 'subset' && this.scope.ids.has(employeeId)) return;
    throw new ForbiddenError('That employee is outside your team');
  }

  private async assertNotSelf(employeeId: string, userId: string) {
    const selfUserId = await new HrNotifier(this.db, this.tenantId).userIdForEmployee(employeeId);
    if (selfUserId && selfUserId === userId) {
      throw new ForbiddenError('You cannot initiate a reward for yourself');
    }
  }

  // ---- notifications (fire-and-forget, never throw) -----------------------

  private async context(reward: RewardRow) {
    const [row] = await this.db
      .select({ employeeName: EMPLOYEE_NAME, typeName: rewardTypes.name })
      .from(employeeRewards)
      .innerJoin(employees, eq(employeeRewards.employeeId, employees.id))
      .innerJoin(rewardTypes, eq(employeeRewards.rewardTypeId, rewardTypes.id))
      .where(eq(employeeRewards.id, reward.id))
      .limit(1);
    return { employeeName: row?.employeeName ?? 'an employee', typeName: row?.typeName ?? 'reward' };
  }

  private async fireSubmitted(reward: RewardRow) {
    const { employeeName, typeName } = await this.context(reward);
    await new HrNotifier(this.db, this.tenantId).notifyHrAdmins({
      source: 'hr_reward',
      title: 'Reward awaiting approval',
      body: `${typeName} for ${employeeName} (${reward.rewardNumber}) needs HR approval.`,
      targetUrl: `/hr/rewards/${reward.id}`,
    });
  }

  private async fireApproved(reward: RewardRow) {
    const notifier = new HrNotifier(this.db, this.tenantId);
    // Redemption: initiator == recipient — a single message to the employee.
    if (reward.pointsUsed != null) {
      await notifier.notifyEmployee(reward.employeeId, {
        type: 'ok',
        source: 'hr_reward',
        title: 'Redemption approved',
        body: `Your redemption of ${reward.pointsUsed} points (₹${reward.pointsUsed}) has been approved.`,
        targetUrl: `/hr/rewards/${reward.id}`,
      });
      return;
    }
    const { employeeName, typeName } = await this.context(reward);
    await notifier.notifyEmployee(reward.employeeId, {
      type: 'ok',
      source: 'hr_reward',
      title: 'You received a reward 🎉',
      body: `Your ${typeName} "${reward.title}" was approved.`,
      targetUrl: `/hr/rewards/${reward.id}`,
    });
    await notifier.notifyUser(reward.initiatedBy, {
      type: 'ok',
      source: 'hr_reward',
      title: 'Reward approved',
      body: `The ${typeName} you proposed for ${employeeName} was approved.`,
      targetUrl: `/hr/rewards/${reward.id}`,
    });
  }

  private async fireRejected(reward: RewardRow, rejectionReason: string | null) {
    const notifier = new HrNotifier(this.db, this.tenantId);
    const reason = rejectionReason ? ` ${rejectionReason}` : '';
    // Redemption rejection: points return to the employee's balance.
    if (reward.pointsUsed != null) {
      await notifier.notifyEmployee(reward.employeeId, {
        type: 'warn',
        source: 'hr_reward',
        title: 'Redemption rejected',
        body: `Your redemption of ${reward.pointsUsed} points was rejected — your balance is unchanged.${reason}`,
        targetUrl: `/hr/rewards/${reward.id}`,
      });
      return;
    }
    const { employeeName, typeName } = await this.context(reward);
    await notifier.notifyUser(reward.initiatedBy, {
      type: 'warn',
      source: 'hr_reward',
      title: 'Reward rejected',
      body: `The ${typeName} you proposed for ${employeeName} was rejected.${reason}`,
      targetUrl: `/hr/rewards/${reward.id}`,
    });
  }

  // ---- helpers ------------------------------------------------------------

  private async requireReward(id: string): Promise<RewardRow> {
    const [row] = await this.db
      .select()
      .from(employeeRewards)
      .where(and(eq(employeeRewards.id, id), eq(employeeRewards.tenantId, this.tenantId)))
      .limit(1);
    if (!row) throw new NotFoundError('Reward');
    return row;
  }

  private async requireType(id: string) {
    const [row] = await this.db
      .select()
      .from(rewardTypes)
      .where(and(eq(rewardTypes.id, id), eq(rewardTypes.tenantId, this.tenantId)))
      .limit(1);
    if (!row) throw new NotFoundError('Reward type');
    if (!row.isActive) throw new ConflictError('Reward type is inactive');
    return row;
  }

  private async requireEmployee(id: string) {
    const [row] = await this.db
      .select({ id: employees.id })
      .from(employees)
      .where(and(eq(employees.id, id), eq(employees.tenantId, this.tenantId)))
      .limit(1);
    if (!row) throw new NotFoundError('Employee');
  }

  /**
   * Next reward number for the tenant. Derived from the highest existing
   * sequence — never `count(*)`, which collides the moment a reward is
   * deleted (delete one of RWD-0001/0002 and count+1 re-issues a live number).
   */
  private async nextRewardNumber(): Promise<string> {
    const [row] = await this.db
      .select({
        maxSeq: sql<number>`coalesce(max(cast(substring(${employeeRewards.rewardNumber} from '\\d+$') as integer)), 0)`,
      })
      .from(employeeRewards)
      .where(eq(employeeRewards.tenantId, this.tenantId));
    return `RWD-${String((row?.maxSeq ?? 0) + 1).padStart(4, '0')}`;
  }

  private toReward(row: RewardRow) {
    return {
      id: row.id,
      tenantId: row.tenantId,
      rewardNumber: row.rewardNumber,
      employeeId: row.employeeId,
      rewardTypeId: row.rewardTypeId,
      kind: row.kind,
      amount: row.amount,
      title: row.title,
      citation: row.citation,
      awardDate: row.awardDate,
      status: row.status,
      initiatedBy: row.initiatedBy,
      approvedBy: row.approvedBy,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      rejectionReason: row.rejectionReason,
      glAccountCode: row.glAccountCode,
      journalEntryId: row.journalEntryId,
      pointsUsed: row.pointsUsed,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
