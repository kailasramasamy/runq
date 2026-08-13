import { eq, and, asc, sql } from 'drizzle-orm';
import { employees, leaveTypes, leaveRequests, leaveBalances } from '@runq/db';
import type { Db } from '@runq/db';
import type { CreateLeaveTypeInput, UpdateLeaveTypeInput } from '@runq/validators';
import { NotFoundError, ConflictError } from '../../utils/errors';
import { LeaveBalanceService } from './leave-balance.service';

const DEFAULT_TYPES = [
  { name: 'Casual Leave', code: 'CL', daysPerYear: 12, carryForward: false, isPaid: true },
  { name: 'Sick Leave', code: 'SL', daysPerYear: 12, carryForward: false, isPaid: true },
  { name: 'Earned Leave', code: 'EL', daysPerYear: 15, carryForward: true, maxCarryForward: 45, encashable: true, isPaid: true },
  { name: 'Maternity Leave', code: 'ML', daysPerYear: 182, carryForward: false, isPaid: true },
  { name: 'Compensatory Off', code: 'CO', daysPerYear: 0, carryForward: true, maxCarryForward: 12, isPaid: true },
  { name: 'Loss of Pay', code: 'LOP', daysPerYear: 0, carryForward: false, isPaid: false },
];

export class LeaveTypeService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  /// When `forEmployeeId` is set, hide gender-gated types that don't
  /// apply to that employee (e.g. Ramesh shouldn't see Maternity in the
  /// Apply Leave sheet). Admin screens omit the filter and see every
  /// configured type so they can manage them. NULL-gender employees see
  /// only 'all'-applicable types — same strict policy as the balances
  /// endpoint.
  ///
  /// Retired (`isActive: false`) types are hidden unless `includeInactive`
  /// is set. Hiding is the default so every picker that reaches for this
  /// list — Apply Leave, mark-attendance — stops offering them without
  /// needing to know the flag exists.
  async list(opts: { forEmployeeId?: string; includeInactive?: boolean } = {}) {
    const conditions = [eq(leaveTypes.tenantId, this.tenantId)];
    if (!opts.includeInactive) conditions.push(eq(leaveTypes.isActive, true));

    if (opts.forEmployeeId) {
      const [emp] = await this.db
        .select({ gender: employees.gender })
        .from(employees)
        .where(and(
          eq(employees.id, opts.forEmployeeId),
          eq(employees.tenantId, this.tenantId),
        ))
        .limit(1);
      // Out-of-tenant or non-existent employeeId is silently treated as
      // "no employee" → only the 'all' types come back. We don't 404
      // here because /hr/leave-types is a read endpoint many surfaces
      // rely on and a typo shouldn't crash them.
      if (emp?.gender) {
        conditions.push(sql`(
          ${leaveTypes.applicableGender} = 'all'
          OR ${leaveTypes.applicableGender} = ${emp.gender}::text
        )`);
      } else {
        conditions.push(sql`${leaveTypes.applicableGender} = 'all'`);
      }
    }

    return this.db
      .select()
      .from(leaveTypes)
      .where(and(...conditions))
      .orderBy(asc(leaveTypes.code));
  }

  async create(input: CreateLeaveTypeInput) {
    const dup = await this.db
      .select({ id: leaveTypes.id })
      .from(leaveTypes)
      .where(and(eq(leaveTypes.tenantId, this.tenantId), eq(leaveTypes.code, input.code)))
      .limit(1);
    if (dup[0]) throw new ConflictError('Leave type code already exists');

    const [row] = await this.db
      .insert(leaveTypes)
      .values({ tenantId: this.tenantId, ...this.serialize(input) } as any)
      .returning();
    return row;
  }

  async update(id: string, input: UpdateLeaveTypeInput) {
    const [before] = await this.db
      .select({ daysPerYear: leaveTypes.daysPerYear })
      .from(leaveTypes)
      .where(and(eq(leaveTypes.id, id), eq(leaveTypes.tenantId, this.tenantId)))
      .limit(1);

    const [row] = await this.db
      .update(leaveTypes)
      .set({ ...this.serialize(input), updatedAt: new Date() } as any)
      .where(and(eq(leaveTypes.id, id), eq(leaveTypes.tenantId, this.tenantId)))
      .returning();
    if (!row) throw new NotFoundError('Leave type');

    // Balance rows snapshot the quota when they're provisioned, so an edit
    // that doesn't push through leaves every already-provisioned employee on
    // the old number — and re-running "Initialize balances" won't correct them
    // either, since it only inserts missing rows.
    if (before && Number(before.daysPerYear) !== Number(row.daysPerYear)) {
      await new LeaveBalanceService(this.db, this.tenantId)
        .resyncQuota(id, new Date().getUTCFullYear());
    }
    return row;
  }

  async remove(id: string) {
    const [used] = await this.db
      .select({ id: leaveRequests.id })
      .from(leaveRequests)
      .where(and(eq(leaveRequests.tenantId, this.tenantId), eq(leaveRequests.leaveTypeId, id)))
      .limit(1);
    if (used) throw new ConflictError('Leave type is in use by requests');

    // Balances are derived bookkeeping — the accrual scheduler creates a
    // row per employee × type, so almost every type has them and they'd
    // otherwise trip the FK. With no requests behind it, `used` is 0, so
    // there's nothing to preserve.
    return this.db.transaction(async (tx) => {
      await tx
        .delete(leaveBalances)
        .where(and(
          eq(leaveBalances.tenantId, this.tenantId),
          eq(leaveBalances.leaveTypeId, id),
        ));

      const [row] = await tx
        .delete(leaveTypes)
        .where(and(eq(leaveTypes.id, id), eq(leaveTypes.tenantId, this.tenantId)))
        .returning();
      if (!row) throw new NotFoundError('Leave type');
      return row;
    });
  }

  async seedDefaults() {
    // Count retired types too — a tenant that disabled everything but CL
    // is still configured, and re-seeding would collide on uq_lt_tenant_code.
    const existing = await this.list({ includeInactive: true });
    if (existing.length > 0) return { skipped: true, count: existing.length };
    let created = 0;
    for (const t of DEFAULT_TYPES) {
      await this.db.insert(leaveTypes).values({
        tenantId: this.tenantId,
        name: t.name,
        code: t.code,
        daysPerYear: String(t.daysPerYear),
        carryForward: t.carryForward,
        maxCarryForward: t.maxCarryForward != null ? String(t.maxCarryForward) : null,
        encashable: t.encashable ?? false,
        isPaid: t.isPaid,
      });
      created++;
    }
    return { skipped: false, count: created };
  }

  private serialize(input: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = { ...input };
    if (out.daysPerYear != null) out.daysPerYear = String(out.daysPerYear);
    if (out.maxCarryForward != null) out.maxCarryForward = String(out.maxCarryForward);
    if (out.maxBalance != null) out.maxBalance = String(out.maxBalance);
    return out;
  }
}
