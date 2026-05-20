import { eq, and, isNull, gte, lte, sql, notExists } from 'drizzle-orm';
import { employees, employeeSalary, attendance, payrollRuns, hrTickets } from '@runq/db';
import type { Db } from '@runq/db';
import { applyHrScope, type HrAccessScope } from './access-scope';

const PROBATION_DAYS = 90;
const ATTENDANCE_TREND_MONTHS = 6;

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Last `n` calendar months, oldest → newest, including the current month. */
function lastNMonths(n: number): Array<{ year: number; month: number }> {
  const out: Array<{ year: number; month: number }> = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }
  return out;
}

/**
 * Cross-cutting "needs attention" + insight figures for the HR dashboard.
 * One round-trip instead of the frontend stitching together 5 queries.
 */
export class HrDashboardService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
    /// When a manager calls this endpoint, only their scoped employees
    /// should count toward "needs attention" tiles. Defaults to org-wide
    /// for callers that don't have a request handy (admin scripts, tests).
    private readonly scope: HrAccessScope = { kind: 'all' },
  ) {}

  async summary() {
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const probationCutoff = isoDaysAgo(PROBATION_DAYS);

    const trendMonths = lastNMonths(ATTENDANCE_TREND_MONTHS);
    const trendStart = `${trendMonths[0].year}-${String(trendMonths[0].month).padStart(2, '0')}-01`;

    // For managers we narrow every active-employee aggregate to the team
    // they can see. Org-wide scopes (`all`) pass through unchanged.
    const activeEmployee = applyHrScope(this.scope, employees.id, and(
      eq(employees.tenantId, this.tenantId),
      eq(employees.status, 'active'),
      isNull(employees.deletedAt),
    ));
    const scopedAttendance = applyHrScope(this.scope, attendance.employeeId, and(
      eq(attendance.tenantId, this.tenantId),
      gte(attendance.date, trendStart),
      lte(attendance.date, today),
    ));

    const [
      payrollRun,
      missingSalaryRow,
      notMarkedRow,
      confirmationsRow,
      attendanceRow,
      helpdeskWaitingRow,
    ] = await Promise.all([
      // Current month payroll run, if one exists
      this.db
        .select()
        .from(payrollRuns)
        .where(and(
          eq(payrollRuns.tenantId, this.tenantId),
          eq(payrollRuns.year, year),
          eq(payrollRuns.month, month),
        ))
        .limit(1),

      // Active employees with no salary assignment covering today
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(employees)
        .where(and(
          activeEmployee,
          notExists(
            this.db
              .select({ x: sql`1` })
              .from(employeeSalary)
              .where(and(
                eq(employeeSalary.tenantId, this.tenantId),
                eq(employeeSalary.employeeId, employees.id),
                lte(employeeSalary.effectiveFrom, today),
                sql`(${employeeSalary.effectiveTo} IS NULL OR ${employeeSalary.effectiveTo} >= ${today})`,
              )),
          ),
        )),

      // Active employees with no attendance row for today
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(employees)
        .where(and(
          activeEmployee,
          notExists(
            this.db
              .select({ x: sql`1` })
              .from(attendance)
              .where(and(
                eq(attendance.tenantId, this.tenantId),
                eq(attendance.employeeId, employees.id),
                eq(attendance.date, today),
              )),
          ),
        )),

      // Permanent employees past probation still unconfirmed
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(employees)
        .where(and(
          activeEmployee,
          eq(employees.employmentType, 'permanent'),
          isNull(employees.confirmationDate),
          lte(employees.joiningDate, probationCutoff),
        )),

      // Attendance over the last few months, bucketed by month
      this.db
        .select({
          year: sql<number>`extract(year from ${attendance.date})::int`,
          month: sql<number>`extract(month from ${attendance.date})::int`,
          present: sql<number>`count(*) filter (where ${attendance.status} in ('present','half_day'))::int`,
          total: sql<number>`count(*)::int`,
        })
        .from(attendance)
        .where(scopedAttendance)
        .groupBy(
          sql`extract(year from ${attendance.date})`,
          sql`extract(month from ${attendance.date})`,
        ),

      // Helpdesk tickets the AI agent has flagged for human attention.
      // Either explicitly waiting_human, or agent_escalated_at is set and
      // the ticket isn't yet closed.
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(hrTickets)
        .where(and(
          eq(hrTickets.tenantId, this.tenantId),
          sql`${hrTickets.status} IN ('open', 'in_progress', 'waiting_human')`,
          sql`${hrTickets.agentEscalatedAt} IS NOT NULL OR ${hrTickets.status} = 'waiting_human'`,
        )),
    ]);

    const run = payrollRun[0];

    const attByMonth = new Map(
      attendanceRow.map((r) => [`${r.year}-${r.month}`, r]),
    );
    const attendanceTrend = trendMonths.map((m) => {
      const row = attByMonth.get(`${m.year}-${m.month}`);
      const present = row?.present ?? 0;
      const totalMarked = row?.total ?? 0;
      return {
        year: m.year,
        month: m.month,
        present,
        totalMarked,
        ratePct: totalMarked > 0 ? Math.round((present / totalMarked) * 100) : 0,
      };
    });

    return {
      payroll: {
        runId: run?.id ?? null,
        month,
        year,
        status: run?.status ?? null,
        totalNet: run?.totalNet ?? '0',
      },
      employeesWithoutSalary: missingSalaryRow[0]?.count ?? 0,
      attendanceNotMarkedToday: notMarkedRow[0]?.count ?? 0,
      confirmationsDue: confirmationsRow[0]?.count ?? 0,
      helpdeskWaiting: helpdeskWaitingRow[0]?.count ?? 0,
      attendanceTrend,
    };
  }
}
