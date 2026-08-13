import { eq, and, sql, isNull } from 'drizzle-orm';
import { leaveBalances, leaveTypes, employees } from '@runq/db';
import type { Db } from '@runq/db';
import type { AdjustLeaveBalanceInput } from '@runq/validators';
import { NotFoundError } from '../../utils/errors';
import { applyHrScope, type HrAccessScope } from './access-scope';

/// A leave type granting more days than this is treated as statutory
/// event leave (e.g. Maternity ≈182d), not a regular annual quota — it is
/// granted in full and never prorated. No real annual leave nears 60.
const EVENT_LEAVE_DAY_CAP = 60;

/**
 * Annual quota a joiner is entitled to for `year`, prorated by whole
 * months — full credit for the joining month, nothing for months before
 * it. Joined in a prior year → full quota. A 0-day type (comp-off, LOP)
 * or statutory event leave passes through unprorated.
 */
export function proratedAccrued(daysPerYear: number, joiningDate: Date, year: number): number {
  if (daysPerYear <= 0 || daysPerYear > EVENT_LEAVE_DAY_CAP) return daysPerYear;
  const joinYear = joiningDate.getUTCFullYear();
  if (joinYear < year) return daysPerYear;
  if (joinYear > year) return 0;
  const monthsActive = 12 - joiningDate.getUTCMonth(); // join month counts in full
  return Math.round((daysPerYear * monthsActive / 12) * 2) / 2; // nearest 0.5 day
}

/**
 * `last_accrued_month` seed for a fresh monthly-accrual row: the month
 * *before* accrual should begin, so the next scheduler pass credits from
 * the join month (or January for an employee who joined earlier). 12
 * parks a not-yet-active joiner so nothing accrues until next year.
 */
function monthlyAccrualStart(joiningDate: Date, year: number): number {
  const joinYear = joiningDate.getUTCFullYear();
  if (joinYear < year) return 0;
  if (joinYear > year) return 12;
  return joiningDate.getUTCMonth(); // 0-based index == 1-based month minus one
}

export class LeaveBalanceService {
  /// Optional scope. Defaults to org-wide so internal callers (carry-forward,
  /// adjust, incrementUsed) keep working; the `/leave-balances` GET passes the
  /// caller's resolved scope so a viewer sees only their own / their team.
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
    private readonly scope: HrAccessScope = { kind: 'all' },
  ) {}

  /**
   * Ensures a balance row exists for (employee, leaveType, year). Initializes
   * `accrued` to the leave type's daysPerYear if creating.
   */
  async ensure(employeeId: string, leaveTypeId: string, year: number) {
    const [existing] = await this.db
      .select()
      .from(leaveBalances)
      .where(and(
        eq(leaveBalances.tenantId, this.tenantId),
        eq(leaveBalances.employeeId, employeeId),
        eq(leaveBalances.leaveTypeId, leaveTypeId),
        eq(leaveBalances.year, year),
      ))
      .limit(1);
    if (existing) return existing;

    const [type] = await this.db
      .select({ daysPerYear: leaveTypes.daysPerYear })
      .from(leaveTypes)
      .where(and(eq(leaveTypes.id, leaveTypeId), eq(leaveTypes.tenantId, this.tenantId)))
      .limit(1);
    if (!type) throw new NotFoundError('Leave type');

    const [row] = await this.db.insert(leaveBalances).values({
      tenantId: this.tenantId,
      employeeId,
      leaveTypeId,
      year,
      opening: '0',
      accrued: type.daysPerYear,
      used: '0',
    }).returning();
    return row;
  }

  /**
   * Create leave_balances rows for one employee across every active
   * leave type for `year`. Idempotent — existing rows are left as-is.
   * Called on employee creation so a new hire's Leave screen is
   * populated from day one.
   */
  async provisionForEmployee(employeeId: string, year: number) {
    const [emp] = await this.db
      .select({ id: employees.id, joiningDate: employees.joiningDate, gender: employees.gender })
      .from(employees)
      .where(and(eq(employees.id, employeeId), eq(employees.tenantId, this.tenantId)))
      .limit(1);
    if (!emp) throw new NotFoundError('Employee');
    return this.provisionRows(emp, await this.activeLeaveTypes(), year);
  }

  /**
   * Bulk variant — provisions `year` balances for every active
   * employee. Backs the HR "Initialize balances" action: onboard an
   * existing workforce, or open a new leave year.
   */
  async provisionAll(year: number) {
    const emps = await this.db
      .select({ id: employees.id, joiningDate: employees.joiningDate, gender: employees.gender })
      .from(employees)
      .where(and(
        eq(employees.tenantId, this.tenantId),
        eq(employees.status, 'active'),
        isNull(employees.deletedAt),
      ));
    const types = await this.activeLeaveTypes();
    let created = 0;
    for (const emp of emps) created += (await this.provisionRows(emp, types, year)).created;
    return { employees: emps.length, created };
  }

  private activeLeaveTypes() {
    return this.db
      .select()
      .from(leaveTypes)
      .where(and(eq(leaveTypes.tenantId, this.tenantId), eq(leaveTypes.isActive, true)));
  }

  /// Insert one balance row per eligible leave type, skipping any that
  /// already exist. `accrued` is prorated for upfront types; monthly
  /// types start at 0 and let the accrual scheduler top them up.
  private async provisionRows(
    emp: { id: string; joiningDate: string; gender: string | null },
    types: Array<typeof leaveTypes.$inferSelect>,
    year: number,
  ) {
    const joiningDate = new Date(emp.joiningDate);
    let created = 0;
    for (const t of types) {
      // Mirror list()'s gender-eligibility filter — never seed a
      // maternity balance onto a male employee.
      if (t.applicableGender !== 'all' && t.applicableGender !== emp.gender) continue;
      const monthly = t.accrualMode === 'monthly';
      const inserted = await this.db
        .insert(leaveBalances)
        .values({
          tenantId: this.tenantId,
          employeeId: emp.id,
          leaveTypeId: t.id,
          year,
          opening: '0',
          accrued: monthly
            ? '0'
            : String(proratedAccrued(Number(t.daysPerYear), joiningDate, year)),
          used: '0',
          lastAccruedMonth: monthly ? monthlyAccrualStart(joiningDate, year) : 12,
        })
        .onConflictDoNothing({
          target: [leaveBalances.employeeId, leaveBalances.leaveTypeId, leaveBalances.year],
        })
        .returning({ id: leaveBalances.id });
      if (inserted.length) created++;
    }
    return { created };
  }

  /**
   * Re-point `year`'s balances at a leave type's current quota, after that
   * quota was edited. Balance rows are a snapshot taken at provision time, so
   * without this an edit only reaches employees provisioned *after* it —
   * everyone else keeps the old number, and re-running "Initialize balances"
   * can't help them (it skips rows that already exist).
   *
   * `used` is never touched: days already taken stay taken, so the remaining
   * balance re-derives from the new quota instead of rewriting history.
   * Monthly-accrual types are skipped — their `accrued` is what the scheduler
   * has credited so far, not the annual quota, and overwriting it would grant
   * a full year up front.
   */
  async resyncQuota(leaveTypeId: string, year: number) {
    const [type] = await this.db
      .select()
      .from(leaveTypes)
      .where(and(eq(leaveTypes.id, leaveTypeId), eq(leaveTypes.tenantId, this.tenantId)))
      .limit(1);
    if (!type) throw new NotFoundError('Leave type');
    if (type.accrualMode === 'monthly') return { updated: 0, skipped: 'monthly' as const };

    const rows = await this.db
      .select({ id: leaveBalances.id, joiningDate: employees.joiningDate })
      .from(leaveBalances)
      .innerJoin(employees, eq(employees.id, leaveBalances.employeeId))
      .where(and(
        eq(leaveBalances.tenantId, this.tenantId),
        eq(leaveBalances.leaveTypeId, leaveTypeId),
        eq(leaveBalances.year, year),
      ));

    let updated = 0;
    for (const r of rows) {
      const accrued = proratedAccrued(Number(type.daysPerYear), new Date(r.joiningDate), year);
      await this.db
        .update(leaveBalances)
        .set({ accrued: String(accrued), updatedAt: new Date() })
        .where(eq(leaveBalances.id, r.id));
      updated++;
    }
    return { updated, skipped: null };
  }

  async list(filter: { employeeId?: string; year?: number }) {
    const conditions = [eq(leaveBalances.tenantId, this.tenantId)];
    if (filter.employeeId) conditions.push(eq(leaveBalances.employeeId, filter.employeeId));
    if (filter.year) conditions.push(eq(leaveBalances.year, filter.year));
    // Gender-eligibility filter (mig 0090). Hide rows where the leave
    // type is gender-gated and the employee's gender doesn't match.
    // NULL-gender employees see only 'all'-applicable types — safer
    // default than guessing eligibility from a missing field.
    // Cast both sides to text — applicableGender is varchar, employees.gender
    // is the `gender` enum type, and Postgres won't compare them directly.
    conditions.push(sql`(
      ${leaveTypes.applicableGender} = 'all'
      OR ${leaveTypes.applicableGender} = ${employees.gender}::text
    )`);
    // Retired types drop off the Leave screen, but only once they're
    // spent — hiding a row while the employee still has earned days on
    // it would make those days silently disappear before settlement.
    conditions.push(sql`(
      ${leaveTypes.isActive}
      OR ${leaveBalances.opening} + ${leaveBalances.accrued} - ${leaveBalances.used} <> 0
    )`);

    const rows = await this.db
      .select({
        bal: leaveBalances,
        typeName: leaveTypes.name,
        typeCode: leaveTypes.code,
        firstName: employees.firstName,
        lastName: employees.lastName,
        employeeCode: employees.employeeCode,
      })
      .from(leaveBalances)
      .innerJoin(leaveTypes, eq(leaveTypes.id, leaveBalances.leaveTypeId))
      .innerJoin(employees, eq(employees.id, leaveBalances.employeeId))
      .where(applyHrScope(this.scope, leaveBalances.employeeId, and(...conditions)));

    return rows.map((r) => ({
      ...r.bal,
      typeName: r.typeName,
      typeCode: r.typeCode,
      employeeCode: r.employeeCode,
      employeeName: `${r.firstName}${r.lastName ? ' ' + r.lastName : ''}`,
      balance: Number(r.bal.opening) + Number(r.bal.accrued) - Number(r.bal.used),
    }));
  }

  async adjust(input: AdjustLeaveBalanceInput) {
    await this.ensure(input.employeeId, input.leaveTypeId, input.year);
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (input.opening != null) updates.opening = String(input.opening);
    if (input.accrued != null) updates.accrued = String(input.accrued);
    if (input.used != null) updates.used = String(input.used);

    const [row] = await this.db
      .update(leaveBalances)
      .set(updates)
      .where(and(
        eq(leaveBalances.tenantId, this.tenantId),
        eq(leaveBalances.employeeId, input.employeeId),
        eq(leaveBalances.leaveTypeId, input.leaveTypeId),
        eq(leaveBalances.year, input.year),
      ))
      .returning();
    return row;
  }

  async incrementUsed(employeeId: string, leaveTypeId: string, year: number, deltaDays: number) {
    await this.ensure(employeeId, leaveTypeId, year);
    await this.db
      .update(leaveBalances)
      .set({
        used: sql`${leaveBalances.used} + ${String(deltaDays)}`,
        updatedAt: new Date(),
      })
      .where(and(
        eq(leaveBalances.tenantId, this.tenantId),
        eq(leaveBalances.employeeId, employeeId),
        eq(leaveBalances.leaveTypeId, leaveTypeId),
        eq(leaveBalances.year, year),
      ));
  }

  async carryForward(fromYear: number, toYear: number) {
    // Move (used-adjusted) balance into next year's opening, capped by maxCarryForward
    const rows = await this.db
      .select({
        bal: leaveBalances,
        carryForward: leaveTypes.carryForward,
        maxCarryForward: leaveTypes.maxCarryForward,
      })
      .from(leaveBalances)
      .innerJoin(leaveTypes, eq(leaveTypes.id, leaveBalances.leaveTypeId))
      .where(and(
        eq(leaveBalances.tenantId, this.tenantId),
        eq(leaveBalances.year, fromYear),
      ));

    let moved = 0;
    for (const r of rows) {
      if (!r.carryForward) continue;
      const remaining = Math.max(
        0,
        Number(r.bal.opening) + Number(r.bal.accrued) - Number(r.bal.used),
      );
      const cap = r.maxCarryForward != null ? Number(r.maxCarryForward) : remaining;
      const opening = Math.min(remaining, cap);
      if (opening <= 0) continue;

      await this.db
        .insert(leaveBalances)
        .values({
          tenantId: this.tenantId,
          employeeId: r.bal.employeeId,
          leaveTypeId: r.bal.leaveTypeId,
          year: toYear,
          opening: String(opening),
          accrued: '0',
          used: '0',
        })
        .onConflictDoUpdate({
          target: [leaveBalances.employeeId, leaveBalances.leaveTypeId, leaveBalances.year],
          set: { opening: String(opening), updatedAt: new Date() },
        });
      moved++;
    }
    return { moved };
  }
}
