import { eq, and, sql, desc, inArray, gte, lte } from 'drizzle-orm';
import {
  labourContracts, contractMembers, contractDayLog, contractAdvances,
  labourSettlements, contractPauses,
} from '@runq/db';
import type { Db } from '@runq/db';
import type {
  CreateContractInput, UpdateContractInput, CreateMemberInput,
  UpdateMemberInput, MarkDaysInput,
} from '@runq/validators';
import { NotFoundError, ConflictError, ValidationError } from '../../../utils/errors';
import {
  contractEarnings, contractBalance,
  type MemberTerms, type DayException, type ContractTerms, type PauseWindow,
} from './earnings';
import { pauseState } from './pause.service';

const today = () => new Date().toISOString().slice(0, 10);

export class ContractService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  // ── Contracts ───────────────────────────────────────────────────────────

  async list(filter: { status?: string; type?: string }) {
    const conds = [eq(labourContracts.tenantId, this.tenantId)];
    if (filter.status) conds.push(sql`${labourContracts.status}::text = ${filter.status}`);
    if (filter.type) conds.push(sql`${labourContracts.contractType}::text = ${filter.type}`);

    const rows = await this.db
      .select()
      .from(labourContracts)
      .where(and(...conds))
      .orderBy(desc(labourContracts.startDate));
    if (rows.length === 0) return [];

    // One extra round trip each for members, exceptions and advances rather
    // than N per contract — a list of fifty contracts should not be 150
    // queries.
    const ids = rows.map((r) => r.id);
    const [members, exceptions, advances, pauses] = await Promise.all([
      this.db.select().from(contractMembers).where(inArray(contractMembers.contractId, ids)),
      this.db.select().from(contractDayLog).where(inArray(contractDayLog.contractId, ids)),
      this.db.select().from(contractAdvances).where(and(
        inArray(contractAdvances.contractId, ids),
        sql`${contractAdvances.status}::text = 'paid'`,
      )),
      this.db.select().from(contractPauses).where(inArray(contractPauses.contractId, ids)),
    ]);

    const now = today();
    return rows.map((c) => {
      const mine = members.filter((m) => m.contractId === c.id);
      const myPauses = pauses.filter((p) => p.contractId === c.id);
      const balance = this.balanceFor(c, mine, exceptions.filter((e) => e.contractId === c.id),
        advances.filter((a) => a.contractId === c.id), myPauses, now);
      return {
        ...c,
        memberCount: mine.length,
        earnedToDate: balance.earned,
        advancesPaid: balance.advancesPaid,
        outstanding: balance.netPayable,
        throughDate: balance.throughDate,
        pauseState: pauseState(myPauses, now),
      };
    });
  }

  async get(id: string) {
    const [c] = await this.db
      .select()
      .from(labourContracts)
      .where(and(eq(labourContracts.id, id), eq(labourContracts.tenantId, this.tenantId)))
      .limit(1);
    if (!c) throw new NotFoundError('Contract not found');
    return c;
  }

  /** Contract plus everything the detail screen renders in one payload. */
  async detail(id: string, asOf?: string) {
    const c = await this.get(id);
    const [members, exceptions, advances, settlements, pauses] = await Promise.all([
      this.db.select().from(contractMembers)
        .where(eq(contractMembers.contractId, id))
        .orderBy(desc(contractMembers.dailyRate)),
      this.db.select().from(contractDayLog).where(eq(contractDayLog.contractId, id)),
      this.db.select().from(contractAdvances)
        .where(and(
          eq(contractAdvances.contractId, id),
          sql`${contractAdvances.status}::text <> 'cancelled'`,
        ))
        .orderBy(desc(contractAdvances.paidOn)),
      this.db.select().from(labourSettlements)
        .where(eq(labourSettlements.contractId, id))
        .orderBy(desc(labourSettlements.createdAt)),
      this.db.select().from(contractPauses)
        .where(eq(contractPauses.contractId, id))
        .orderBy(desc(contractPauses.fromDate)),
    ]);

    const live = advances.filter((a) => a.status === 'paid');
    const now = today();
    const balance = this.balanceFor(c, members, exceptions, live, pauses, now, asOf);

    return {
      ...c,
      members,
      advances,
      settlements,
      dayLog: exceptions,
      pauses,
      pauseState: pauseState(pauses, now),
      balance,
    };
  }

  /** Shared shape-conversion so list and detail can never diverge. */
  private balanceFor(
    c: typeof labourContracts.$inferSelect,
    members: (typeof contractMembers.$inferSelect)[],
    exceptions: (typeof contractDayLog.$inferSelect)[],
    advances: (typeof contractAdvances.$inferSelect)[],
    pauses: (typeof contractPauses.$inferSelect)[],
    now: string,
    asOf?: string,
  ) {
    const terms: ContractTerms = {
      contractType: c.contractType,
      fixedAmount: c.fixedAmount == null ? null : Number(c.fixedAmount),
      startDate: c.startDate,
      endDate: c.endDate,
    };
    const roster: MemberTerms[] = members.map((m) => ({
      id: m.id,
      name: m.name,
      role: m.role,
      dailyRate: Number(m.dailyRate),
      joinedOn: m.joinedOn,
      leftOn: m.leftOn,
    }));
    const exc: DayException[] = exceptions.map((e) => ({
      memberId: e.memberId,
      logDate: e.logDate,
      status: e.status,
    }));
    const windows: PauseWindow[] = pauses.map((p) => ({
      fromDate: p.fromDate,
      toDate: p.toDate,
    }));
    const earnings = contractEarnings(terms, roster, exc, now, asOf, windows);
    return contractBalance(
      terms,
      earnings,
      advances.map((a) => ({ memberId: a.memberId, amount: Number(a.amount) })),
      c.leadPersonName,
    );
  }

  async create(input: CreateContractInput, userId: string) {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(labourContracts)
        .values({
          tenantId: this.tenantId,
          contractNumber: await this.nextNumber(tx as unknown as Db),
          name: input.name,
          leadPersonName: input.leadPersonName,
          leadPersonPhone: input.leadPersonPhone ?? null,
          contractType: input.contractType,
          fixedAmount: input.fixedAmount == null ? null : String(input.fixedAmount),
          startDate: input.startDate,
          endDate: input.endDate ?? null,
          notes: input.notes ?? null,
          createdBy: userId,
        })
        .returning();

      // A solo contract is a crew of one: the lead person is the worker.
      // Creating the member here keeps every downstream path (calendar,
      // earnings, settlement) free of a solo special case.
      if (input.contractType === 'solo_daily') {
        await tx.insert(contractMembers).values({
          tenantId: this.tenantId,
          contractId: row.id,
          name: input.leadPersonName,
          role: null,
          dailyRate: String(input.dailyRate),
        });
      } else if (input.contractType === 'crew_daily' && input.members?.length) {
        await tx.insert(contractMembers).values(
          input.members.map((m) => ({
            tenantId: this.tenantId,
            contractId: row.id,
            name: m.name,
            role: m.role ?? null,
            dailyRate: String(m.dailyRate),
            joinedOn: m.joinedOn ?? null,
          })),
        );
      }
      return row;
    });
  }

  async update(id: string, input: UpdateContractInput) {
    const c = await this.get(id);
    this.assertEditable(c);
    if (await this.liveSettlement(id)) {
      throw new ConflictError(
        'This contract has a settlement — cancel it before changing the terms',
      );
    }
    const [row] = await this.db
      .update(labourContracts)
      .set({
        name: input.name,
        leadPersonName: input.leadPersonName,
        leadPersonPhone: input.leadPersonPhone ?? null,
        startDate: input.startDate,
        endDate: input.endDate ?? null,
        fixedAmount: input.fixedAmount == null ? null : String(input.fixedAmount),
        notes: input.notes ?? null,
        updatedAt: new Date(),
      })
      .where(eq(labourContracts.id, id))
      .returning();
    return row;
  }

  async cancel(id: string) {
    const c = await this.get(id);
    if (c.status !== 'active') throw new ConflictError(`Contract is already ${c.status}`);
    const s = await this.liveSettlement(id);
    if (s && s.status !== 'draft') {
      throw new ConflictError('This contract is settled — cancel the settlement first');
    }
    const [row] = await this.db
      .update(labourContracts)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(labourContracts.id, id))
      .returning();
    return row;
  }

  // ── Members ─────────────────────────────────────────────────────────────

  async addMember(contractId: string, input: CreateMemberInput) {
    const c = await this.get(contractId);
    this.assertEditable(c);
    if (c.contractType === 'task_lumpsum') {
      throw new ValidationError(
        'A task contract is priced as a whole — it has no per-person rates',
      );
    }
    if (c.contractType === 'solo_daily') {
      const existing = await this.members(contractId);
      if (existing.length > 0) {
        throw new ValidationError(
          'A solo contract has one worker. Change it to a crew contract to add more.',
        );
      }
    }
    const [row] = await this.db
      .insert(contractMembers)
      .values({
        tenantId: this.tenantId,
        contractId,
        name: input.name,
        role: input.role ?? null,
        dailyRate: String(input.dailyRate),
        joinedOn: input.joinedOn ?? null,
        leftOn: input.leftOn ?? null,
      })
      .returning();
    return row;
  }

  async updateMember(memberId: string, input: UpdateMemberInput) {
    const member = await this.member(memberId);
    const c = await this.get(member.contractId);
    this.assertEditable(c);
    const [row] = await this.db
      .update(contractMembers)
      .set({
        name: input.name,
        role: input.role ?? null,
        dailyRate: String(input.dailyRate),
        joinedOn: input.joinedOn ?? null,
        leftOn: input.leftOn ?? null,
        updatedAt: new Date(),
      })
      .where(eq(contractMembers.id, memberId))
      .returning();
    return row;
  }

  /**
   * Remove a member. Refused once they hold advances — deleting would
   * cascade their day log away and orphan money already handed over. Set a
   * leaving date instead, which stops their accrual without losing history.
   */
  async removeMember(memberId: string) {
    const member = await this.member(memberId);
    const c = await this.get(member.contractId);
    this.assertEditable(c);
    const [adv] = await this.db
      .select({ id: contractAdvances.id })
      .from(contractAdvances)
      .where(and(
        eq(contractAdvances.memberId, memberId),
        sql`${contractAdvances.status}::text <> 'cancelled'`,
      ))
      .limit(1);
    if (adv) {
      throw new ConflictError(
        'This person has advances against them. Set a leaving date instead of removing them.',
      );
    }
    await this.db.delete(contractMembers).where(eq(contractMembers.id, memberId));
    return { id: memberId };
  }

  async members(contractId: string) {
    return this.db
      .select()
      .from(contractMembers)
      .where(eq(contractMembers.contractId, contractId))
      .orderBy(desc(contractMembers.dailyRate));
  }

  private async member(memberId: string) {
    const [row] = await this.db
      .select()
      .from(contractMembers)
      .where(and(
        eq(contractMembers.id, memberId),
        eq(contractMembers.tenantId, this.tenantId),
      ))
      .limit(1);
    if (!row) throw new NotFoundError('Crew member not found');
    return row;
  }

  // ── Day log ─────────────────────────────────────────────────────────────

  /**
   * Mark a span of days for one or more members.
   *
   * `worked` deletes the exception rather than writing one — the absence of
   * a row IS "worked", and storing it would defeat the whole point of an
   * exceptions-only log.
   */
  async markDays(contractId: string, input: MarkDaysInput, userId: string) {
    const c = await this.get(contractId);
    this.assertEditable(c);
    if (input.toDate < input.fromDate) {
      throw new ValidationError('End of the range is before its start');
    }
    if (input.fromDate < c.startDate) {
      throw new ValidationError('That date is before the contract starts');
    }
    if (c.endDate && input.toDate > c.endDate) {
      throw new ValidationError('That date is after the contract ends');
    }

    const roster = await this.members(contractId);
    if (roster.length === 0) {
      throw new ValidationError('This contract has nobody on it to mark');
    }
    const targets = input.memberIds?.length
      ? roster.filter((m) => input.memberIds!.includes(m.id))
      : roster;
    if (targets.length === 0) throw new ValidationError('No matching crew members');

    const dates: string[] = [];
    for (let d = new Date(`${input.fromDate}T00:00:00Z`);
         d.toISOString().slice(0, 10) <= input.toDate;
         d.setUTCDate(d.getUTCDate() + 1)) {
      dates.push(d.toISOString().slice(0, 10));
    }

    return this.db.transaction(async (tx) => {
      const memberIds = targets.map((m) => m.id);
      // Clear whatever was there so re-marking a span is idempotent.
      await tx.delete(contractDayLog).where(and(
        eq(contractDayLog.contractId, contractId),
        inArray(contractDayLog.memberId, memberIds),
        gte(contractDayLog.logDate, input.fromDate),
        lte(contractDayLog.logDate, input.toDate),
      ));
      if (input.status !== 'worked') {
        await tx.insert(contractDayLog).values(
          memberIds.flatMap((memberId) =>
            dates.map((logDate) => ({
              tenantId: this.tenantId,
              contractId,
              memberId,
              logDate,
              status: input.status,
              note: input.note ?? null,
              createdBy: userId,
            })),
          ),
        );
      }
      return { days: dates.length, members: memberIds.length };
    });
  }

  // ── Shared ──────────────────────────────────────────────────────────────

  async liveSettlement(contractId: string) {
    const [row] = await this.db
      .select()
      .from(labourSettlements)
      .where(and(
        eq(labourSettlements.contractId, contractId),
        sql`${labourSettlements.status}::text <> 'cancelled'`,
      ))
      .limit(1);
    return row ?? null;
  }

  private assertEditable(c: typeof labourContracts.$inferSelect) {
    if (c.status !== 'active') {
      throw new ConflictError(`Contract is ${c.status} — it can no longer be changed`);
    }
  }

  private async nextNumber(tx: Db): Promise<string> {
    const [row] = await tx
      .select({ n: sql<string>`COUNT(*)` })
      .from(labourContracts)
      .where(eq(labourContracts.tenantId, this.tenantId));
    return `CTR-${String(Number(row?.n ?? 0) + 1).padStart(5, '0')}`;
  }
}
