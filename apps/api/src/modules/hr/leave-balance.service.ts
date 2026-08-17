import { eq, and, sql, isNull, desc, asc } from 'drizzle-orm';
import { leaveBalances, leaveTypes, employees } from '@runq/db';
import type { Db } from '@runq/db';
import type { AdjustLeaveBalanceInput } from '@runq/validators';
import { NotFoundError } from '../../utils/errors';
import { applyHrScope, type HrAccessScope } from './access-scope';
import { LeaveAccrualService } from './leave-accrual.service';

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

/**
 * Opening accrual for a fresh balance row. Upfront types are credited
 * their prorated annual quota; monthly types start empty and let the
 * accrual scheduler credit them month by month (12 parks a non-monthly
 * row so the scheduler skips it).
 */
export function seedAccrual(type: typeof leaveTypes.$inferSelect, joiningDate: Date, year: number) {
  const monthly = type.accrualMode === 'monthly';
  return {
    accrued: monthly ? '0' : String(proratedAccrued(Number(type.daysPerYear), joiningDate, year)),
    lastAccruedMonth: monthly ? monthlyAccrualStart(joiningDate, year) : 12,
  };
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
   * Ensures a balance row exists for (employee, leaveType, year), seeding
   * it exactly the way provisioning would — prorated for upfront types,
   * zero for monthly-accrual ones. Seeding a monthly type with its full
   * annual quota here would hand an employee a whole year up front the
   * first time they apply for that leave.
   */
  async ensure(employeeId: string, leaveTypeId: string, year: number) {
    const existing = await this.findBalance(employeeId, leaveTypeId, year);
    if (existing) return existing;

    const emp = await this.loadEmployee(employeeId);
    if (!emp) throw new NotFoundError('Employee');
    const [type] = await this.db
      .select()
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
      used: '0',
      ...seedAccrual(type, new Date(emp.joiningDate), year),
    }).returning();
    return row;
  }

  private async findBalance(employeeId: string, leaveTypeId: string, year: number) {
    const [row] = await this.db
      .select()
      .from(leaveBalances)
      .where(and(
        eq(leaveBalances.tenantId, this.tenantId),
        eq(leaveBalances.employeeId, employeeId),
        eq(leaveBalances.leaveTypeId, leaveTypeId),
        eq(leaveBalances.year, year),
      ))
      .limit(1);
    return row;
  }

  /**
   * Create leave_balances rows for one employee across every active
   * leave type for `year`. Idempotent — existing rows are left as-is.
   * Called on employee creation so a new hire's Leave screen is
   * populated from day one.
   */
  async provisionForEmployee(employeeId: string, year: number) {
    const emp = await this.loadEmployee(employeeId);
    if (!emp) throw new NotFoundError('Employee');
    return this.provisionRows(emp, await this.activeLeaveTypes(), year);
  }

  /**
   * Bulk variant — provisions `year` balances for every active
   * employee. Backs the HR "Initialize balances" action: onboard an
   * existing workforce, or open a new leave year.
   */
  async provisionAll(year: number) {
    const emps = await this.activeEmployees();
    const types = await this.activeLeaveTypes();
    let created = 0;
    for (const emp of emps) created += (await this.provisionRows(emp, types, year)).created;
    return { employees: emps.length, created };
  }

  /**
   * Provision one newly-created leave type across the existing workforce.
   * Without this, a type added tenant-wide only reaches employees hired
   * afterwards — everyone already on the books keeps an empty Leave
   * screen for it until someone remembers to run "Initialize balances".
   */
  async provisionForType(type: typeof leaveTypes.$inferSelect, year: number) {
    const emps = await this.activeEmployees();
    let created = 0;
    for (const emp of emps) created += (await this.provisionRows(emp, [type], year)).created;
    return { employees: emps.length, created };
  }

  private async loadEmployee(employeeId: string) {
    const [emp] = await this.db
      .select({ id: employees.id, joiningDate: employees.joiningDate, gender: employees.gender })
      .from(employees)
      .where(and(eq(employees.id, employeeId), eq(employees.tenantId, this.tenantId)))
      .limit(1);
    return emp;
  }

  private activeEmployees() {
    return this.db
      .select({ id: employees.id, joiningDate: employees.joiningDate, gender: employees.gender })
      .from(employees)
      .where(and(
        eq(employees.tenantId, this.tenantId),
        eq(employees.status, 'active'),
        isNull(employees.deletedAt),
      ));
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
      const inserted = await this.db
        .insert(leaveBalances)
        .values({
          tenantId: this.tenantId,
          employeeId: emp.id,
          leaveTypeId: t.id,
          year,
          opening: '0',
          used: '0',
          ...seedAccrual(t, joiningDate, year),
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
    // Self-heal one employee's year before reading it. Balance rows are
    // materialised, not derived, so an employee who was never provisioned
    // — hired before the leave type existed, or a year that was never
    // opened — reads back empty and their Leave screen looks like they
    // have no entitlement at all. Provisioning is idempotent, so this is
    // a no-op on every subsequent read.
    if (filter.employeeId && filter.year && this.canRead(filter.employeeId)) {
      const emp = await this.loadEmployee(filter.employeeId);
      if (emp) await this.healEmployee(emp, filter.year);
    }
    return this.select(filter);
  }

  /// Never heal an employee the caller can't read anyway — the rows would
  /// be filtered straight back out, and a read has no business writing on
  /// behalf of someone outside the caller's scope.
  private canRead(employeeId: string) {
    const s = this.scope;
    if (s.kind === 'all') return true;
    if (s.kind === 'none') return false;
    return s.kind === 'self'
      ? s.selfEmployeeId === employeeId
      : s.ids.has(employeeId);
  }

  /// Provision any missing rows for one employee's year, then — for the
  /// current year only — catch their monthly-accrual types up to today.
  /// Without the catch-up a healed employee reads back at zero until the
  /// nightly scheduler runs, which looks identical to the bug.
  private async healEmployee(
    emp: { id: string; joiningDate: string; gender: string | null },
    year: number,
  ) {
    const { created } = await this.provisionRows(emp, await this.activeLeaveTypes(), year);
    if (!created) return;
    const now = new Date();
    if (year !== now.getUTCFullYear()) return;
    await new LeaveAccrualService(this.db)
      .accrueUpThrough(this.tenantId, year, now.getUTCMonth() + 1, emp.id);
  }

  private async select(filter: { employeeId?: string; year?: number }) {
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
      .where(applyHrScope(this.scope, leaveBalances.employeeId, and(...conditions)))
      // Deterministic order — without it Postgres returns heap order, so
      // the same employee's types shuffle between reads. Types the
      // employee can actually draw on lead; code breaks the tie.
      .orderBy(desc(sql`${leaveBalances.opening} + ${leaveBalances.accrued} - ${leaveBalances.used}`), asc(leaveTypes.code));

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
