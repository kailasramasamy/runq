import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { shifts, employeeShifts, holidays, tenants } from '@runq/db';
import type { Db } from '@runq/db';

/**
 * Which days of the week an employee doesn't work (0=Sun..6=Sat).
 *
 * Resolution order, most specific first:
 *   1. the shift they were assigned on that date
 *   2. the tenant's single active shift — one shift *is* the org's working
 *      pattern, so an org that configured "no week-offs" shouldn't have to
 *      assign every employee individually before it takes effect
 *   3. Sunday, the conventional Indian default, for a tenant with several
 *      shifts (genuinely ambiguous) or none at all
 *
 * Leave-day counting and payroll's working-day count both resolve through
 * here. They used to hardcode [0] separately, which meant an org working
 * seven days had leave silently under-counted *and* LOP measured against a
 * short month — with no single place to fix either.
 */
export async function resolveWeeklyOffDays(
  db: Db, tenantId: string, employeeId: string, onDate: string,
): Promise<number[]> {
  const [assigned] = await db
    .select({ weeklyOffDays: shifts.weeklyOffDays })
    .from(employeeShifts)
    .innerJoin(shifts, eq(shifts.id, employeeShifts.shiftId))
    .where(and(
      eq(employeeShifts.tenantId, tenantId),
      eq(employeeShifts.employeeId, employeeId),
      lte(employeeShifts.effectiveFrom, onDate),
      sql`(${employeeShifts.effectiveTo} IS NULL OR ${employeeShifts.effectiveTo} >= ${onDate})`,
    ))
    .orderBy(desc(employeeShifts.effectiveFrom))
    .limit(1);
  if (assigned) return assigned.weeklyOffDays;

  const active = await db
    .select({ weeklyOffDays: shifts.weeklyOffDays })
    .from(shifts)
    .where(and(eq(shifts.tenantId, tenantId), eq(shifts.isActive, true)))
    .limit(2);
  if (active.length === 1) return active[0].weeklyOffDays;

  return [0];
}

/**
 * Working days in a month for one week-off pattern: calendar days minus
 * week-offs minus holidays. Holidays are passed in as a date set so callers
 * can fetch them once for a whole run.
 */
export function countWorkingDays(
  year: number, month: number, weeklyOffDays: number[], holidayDates: Set<string>,
): number {
  const last = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  return countWorkingDaysBetween(first, last, weeklyOffDays, holidayDates);
}

/**
 * Holidays falling in a date range — or an empty set for an org that works
 * through them (`payrollHolidaysAreWorkingDays`).
 *
 * Leave-day counting and payroll both have to agree here. When only payroll
 * honoured the setting, a five-day leave over a public holiday was counted as
 * four leave days but thirty-one payroll days: the employee's request quietly
 * shrank, and any paid-day cap was measured against the wrong total.
 */
export async function resolveHolidayDates(
  db: Db, tenantId: string, fromDate: string, toDate: string,
): Promise<Set<string>> {
  const [tenant] = await db
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  const settings = (tenant?.settings ?? {}) as { payrollHolidaysAreWorkingDays?: boolean };
  if (settings.payrollHolidaysAreWorkingDays === true) return new Set();

  const rows = await db
    .select({ date: holidays.date })
    .from(holidays)
    .where(and(
      eq(holidays.tenantId, tenantId),
      gte(holidays.date, fromDate),
      lte(holidays.date, toDate),
    ));
  return new Set(rows.map((r) => r.date));
}

/**
 * Working days in an arbitrary inclusive date range. Payroll uses this for the
 * employment window — the slice of the month an employee was actually on the
 * books — so a mid-month joiner or leaver is paid for their part of it rather
 * than the whole month. Returns 0 for an inverted range (employee not employed
 * during the month at all).
 */
export function countWorkingDaysBetween(
  fromDate: string, toDate: string, weeklyOffDays: number[], holidayDates: Set<string>,
): number {
  if (fromDate > toDate) return 0;
  let count = 0;
  const end = new Date(toDate + 'T00:00:00Z');
  for (const d = new Date(fromDate + 'T00:00:00Z'); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    if (weeklyOffDays.includes(d.getUTCDay())) continue;
    if (holidayDates.has(d.toISOString().slice(0, 10))) continue;
    count++;
  }
  return count;
}
