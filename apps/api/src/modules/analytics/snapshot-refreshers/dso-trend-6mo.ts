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
 * Null when there were no sales that month (formula undefined).
 */
export const dsoTrend6moRefresher: MetricRefresher = {
  metricKey: 'dso_trend_6mo',
  cadence: 'nightly',
  async refresh(ctx) {
    const istNow = new Date(ctx.now.getTime() + 5.5 * 3_600_000);
    const months: DsoPoint[] = [];

    for (let i = 5; i >= 0; i--) {
      const monthDate = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth() - i, 1));
      const monthStart = monthDate.toISOString().slice(0, 10);
      const nextMonth = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 1));
      const monthEnd = new Date(nextMonth.getTime() - 86400_000).toISOString().slice(0, 10);
      const daysInMonth = Math.round((nextMonth.getTime() - monthDate.getTime()) / 86400_000);
      const monthTag = monthStart.slice(0, 7);

      // AR balance at month-end = posted sales - receipts as of monthEnd
      const balRes = await ctx.db.execute(sql`
        SELECT
          COALESCE(SUM(total_amount), 0) AS billed,
          COALESCE((
            SELECT SUM(amount) FROM payment_receipts pr
            WHERE pr.tenant_id = ${ctx.tenantId}
              AND pr.receipt_date <= ${monthEnd}
          ), 0) AS received
        FROM sales_invoices
        WHERE tenant_id = ${ctx.tenantId}
          AND invoice_date <= ${monthEnd}
          AND status NOT IN ('draft', 'cancelled')
      `);
      const balRow = ((balRes as unknown as { rows: Array<{ billed: unknown; received: unknown }> }).rows)?.[0];
      const arBalance = Math.max(0, (Number(balRow?.billed) || 0) - (Number(balRow?.received) || 0));

      const salesRes = await ctx.db.execute(sql`
        SELECT COALESCE(SUM(total_amount), 0) AS sales
        FROM sales_invoices
        WHERE tenant_id = ${ctx.tenantId}
          AND invoice_date BETWEEN ${monthStart} AND ${monthEnd}
          AND status NOT IN ('draft', 'cancelled')
      `);
      const sales = Number(((salesRes as unknown as { rows: Array<{ sales: unknown }> }).rows)?.[0]?.sales) || 0;

      const dso = sales > 0 ? Math.round((arBalance / sales) * daysInMonth) : null;
      months.push({ month: monthTag, dso, arBalance, sales, daysInMonth });
    }

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
