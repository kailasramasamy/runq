import { sql } from 'drizzle-orm';
import type { MetricRefresher } from '../refresh-registry';
import { upsertSnapshot } from '../snapshot-store';

export interface DsoPoint {
  month: string; // YYYY-MM
  dso: number | null;
  arBalance: number;
  sales: number;
  daysInMonth: number;
}
export interface DsoTrend6moPayload {
  months: DsoPoint[];
  latestDso: number | null;
  averageDso: number | null;
}

/**
 * DSO = (AR balance at month-end / sales that month) × days_in_month.
 *
 * Single-query implementation: generate the 6 month-ends, then for each
 * compute cumulative billings ≤ month-end MINUS cumulative receipts ≤
 * month-end (= AR balance at that point), plus sales within the month.
 *
 * Prior implementation did 12 sequential queries (2 per month × 6 months).
 */
export const dsoTrend6moRefresher: MetricRefresher = {
  metricKey: 'dso_trend_6mo',
  cadence: 'nightly',
  async refresh(ctx) {
    const istNow = new Date(ctx.now.getTime() + 5.5 * 3_600_000);
    // First day of the month, 5 months back
    const startY = istNow.getUTCFullYear();
    const startM = istNow.getUTCMonth() - 5;
    const startIso = new Date(Date.UTC(startY, startM, 1)).toISOString().slice(0, 10);

    const res = await ctx.db.execute(sql`
      WITH months AS (
        SELECT
          (date_trunc('month', d)::date)                AS month_start,
          ((date_trunc('month', d) + INTERVAL '1 month' - INTERVAL '1 day')::date) AS month_end
        FROM generate_series(${startIso}::date, ${startIso}::date + INTERVAL '5 months', INTERVAL '1 month') d
      )
      SELECT
        to_char(m.month_start, 'YYYY-MM') AS month,
        (m.month_end - m.month_start + 1) AS days_in_month,
        COALESCE((
          SELECT SUM(si.total_amount)
          FROM sales_invoices si
          WHERE si.tenant_id = ${ctx.tenantId}
            AND si.invoice_date <= m.month_end
            AND si.status NOT IN ('draft', 'cancelled')
        ), 0)
        - COALESCE((
          SELECT SUM(pr.amount)
          FROM payment_receipts pr
          WHERE pr.tenant_id = ${ctx.tenantId}
            AND pr.receipt_date <= m.month_end
        ), 0) AS ar_balance,
        COALESCE((
          SELECT SUM(si.total_amount)
          FROM sales_invoices si
          WHERE si.tenant_id = ${ctx.tenantId}
            AND si.invoice_date BETWEEN m.month_start AND m.month_end
            AND si.status NOT IN ('draft', 'cancelled')
        ), 0) AS sales
      FROM months m
      ORDER BY m.month_start
    `);

    const rows = ((res as unknown as { rows: Array<{ month: string; days_in_month: number; ar_balance: unknown; sales: unknown }> }).rows) ?? [];
    const months: DsoPoint[] = rows.map((r) => {
      const arBalance = Math.max(0, Number(r.ar_balance) || 0);
      const sales = Number(r.sales) || 0;
      const daysInMonth = Number(r.days_in_month);
      const dso = sales > 0 ? Math.round((arBalance / sales) * daysInMonth) : null;
      return { month: r.month, dso, arBalance, sales, daysInMonth };
    });

    const dsoVals = months.map((m) => m.dso).filter((v): v is number => v != null);
    const payload: DsoTrend6moPayload = {
      months,
      latestDso: months[months.length - 1]?.dso ?? null,
      averageDso: dsoVals.length > 0 ? Math.round(dsoVals.reduce((s, v) => s + v, 0) / dsoVals.length) : null,
    };
    const period = istNow.toISOString().slice(0, 7);
    await upsertSnapshot(ctx.db, ctx.tenantId, 'dso_trend_6mo', period, payload);
  },
};
