import { and, eq, lt, sql } from 'drizzle-orm';
import { employees, leaveBalances, leaveTypes, tenants } from '@runq/db';
import type { Db } from '@runq/db';

// Monthly leave accrual. For each leave_balance row where the underlying
// leave_type is in `monthly` mode, the row's `accrued` total is topped up
// to (daysPerYear / 12) * monthsElapsedThisYear. `last_accrued_month`
// tracks how far the row has been advanced so the job is idempotent —
// safe to re-run on the same day, safe to run after a long downtime
// (it catches up multiple months in one pass).
//
// A type carrying `max_balance` stops accruing once the employee's
// available balance reaches it, and resumes as they take leave. Months
// skipped at the cap are forfeited, not banked — `last_accrued_month`
// still advances — which is the point of the ceiling.
//
// Inactive employees are skipped: terminated / on_leave / inactive
// statuses don't accrue. Joiners get partial-month credit on whatever
// the join month is; we don't try to pro-rate within a month — Indian
// payroll convention is full credit for any employee active on the 1st.

export interface AccrualSummary {
  tenantId: string;
  year: number;
  asOfMonth: number;
  rowsUpdated: number;
  daysAdded: number;
}

export class LeaveAccrualService {
  constructor(private readonly db: Db) {}

  /// Advance all eligible balance rows in `tenantId` so their
  /// `last_accrued_month` is at least `asOfMonth`. Returns a summary
  /// suitable for the scheduler log.
  async accrueUpThrough(tenantId: string, year: number, asOfMonth: number): Promise<AccrualSummary> {
    if (asOfMonth < 1 || asOfMonth > 12) {
      throw new Error(`Invalid asOfMonth: ${asOfMonth}`);
    }

    // Single UPDATE … FROM so we don't round-trip per row. The delta is
    // (asOfMonth - last_accrued_month) months at (daysPerYear / 12) each.
    // Active employees only — terminated workers shouldn't keep accruing
    // EL after they leave the company.
    const result = await this.db.execute<{ rows_updated: number; days_added: string | null }>(sql`
      WITH eligible AS (
        SELECT lb.id,
               lb.last_accrued_month,
               lt.days_per_year::numeric AS dpy,
               lt.max_balance::numeric   AS cap,
               (lb.opening::numeric + lb.accrued::numeric - lb.used::numeric) AS available
          FROM leave_balances lb
          JOIN leave_types lt ON lt.id = lb.leave_type_id
          JOIN employees e   ON e.id  = lb.employee_id
         WHERE lb.tenant_id = ${tenantId}
           AND lb.year = ${year}
           AND lt.accrual_mode = 'monthly'
           AND lb.last_accrued_month < ${asOfMonth}
           AND e.status = 'active'
           AND e.deleted_at IS NULL
      ),
      capped AS (
        -- max_balance caps the *available* balance, not lifetime accrual: an
        -- employee at the ceiling stops accruing, and starts again as soon as
        -- they take leave. GREATEST(...,0) keeps an already-over-cap row
        -- (a manual adjustment, say) from accruing negative days.
        SELECT eligible.*,
               CASE
                 WHEN eligible.cap IS NULL THEN
                   (eligible.dpy / 12.0) * (${asOfMonth} - eligible.last_accrued_month)
                 ELSE LEAST(
                   (eligible.dpy / 12.0) * (${asOfMonth} - eligible.last_accrued_month),
                   GREATEST(eligible.cap - eligible.available, 0)
                 )
               END AS delta
          FROM eligible
      ),
      updated AS (
        UPDATE leave_balances lb
           SET accrued = ROUND(lb.accrued::numeric + capped.delta, 2),
               last_accrued_month = ${asOfMonth},
               updated_at = NOW()
          FROM capped
         WHERE lb.id = capped.id
         RETURNING capped.delta AS added
      )
      SELECT COUNT(*)::int            AS rows_updated,
             COALESCE(SUM(added), 0)  AS days_added
        FROM updated
    `);

    const row = (result as unknown as { rows: Array<{ rows_updated: number; days_added: string | null }> }).rows[0];
    return {
      tenantId, year, asOfMonth,
      rowsUpdated: row?.rows_updated ?? 0,
      daysAdded: row?.days_added ? Number(row.days_added) : 0,
    };
  }

  /// Run accrual for every tenant in the platform. Returns an array of
  /// per-tenant summaries — the scheduler logs them at info level.
  async runForAllTenants(year: number, asOfMonth: number): Promise<AccrualSummary[]> {
    const ts = await this.db.select({ id: tenants.id }).from(tenants);
    const out: AccrualSummary[] = [];
    for (const t of ts) {
      out.push(await this.accrueUpThrough(t.id, year, asOfMonth));
    }
    return out;
  }

  /// Read-only sanity-check used by the admin debug endpoint: how many
  /// rows would the next accrual touch, without mutating anything?
  async previewPending(tenantId: string, year: number, asOfMonth: number): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(leaveBalances)
      .innerJoin(leaveTypes, eq(leaveTypes.id, leaveBalances.leaveTypeId))
      .innerJoin(employees, eq(employees.id, leaveBalances.employeeId))
      .where(and(
        eq(leaveBalances.tenantId, tenantId),
        eq(leaveBalances.year, year),
        eq(leaveTypes.accrualMode, 'monthly'),
        lt(leaveBalances.lastAccruedMonth, asOfMonth),
        eq(employees.status, 'active'),
      ));
    return row?.count ?? 0;
  }
}
