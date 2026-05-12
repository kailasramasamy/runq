import { sql } from 'drizzle-orm';
import type { MetricRefresher } from '../refresh-registry';
import { upsertSnapshot } from '../snapshot-store';

export interface RevExpMonth {
  month: string; // YYYY-MM
  revenue: number;
  expense: number;
}
export interface RevenueVsExpense12moPayload {
  months: RevExpMonth[];
  totalRevenue: number;
  totalExpense: number;
}

export const revenueVsExpense12moRefresher: MetricRefresher = {
  metricKey: 'revenue_vs_expense_12mo',
  cadence: 'nightly',
  async refresh(ctx) {
    const istNow = new Date(ctx.now.getTime() + 5.5 * 3_600_000);
    const startY = istNow.getUTCFullYear();
    const startM = istNow.getUTCMonth() - 11;
    const start = new Date(Date.UTC(startY, startM, 1));
    const startIso = start.toISOString().slice(0, 10);

    const res = await ctx.db.execute(sql`
      SELECT
        TO_CHAR(DATE_TRUNC('month', je.date), 'YYYY-MM') AS month,
        a.type,
        COALESCE(SUM(
          CASE
            WHEN a.type = 'revenue' THEN jl.credit - jl.debit
            WHEN a.type = 'expense' THEN jl.debit  - jl.credit
            ELSE 0
          END
        ), 0) AS amount
      FROM journal_lines jl
      JOIN journal_entries je ON je.id = jl.journal_entry_id
      JOIN accounts a ON a.id = jl.account_id
      WHERE jl.tenant_id = ${ctx.tenantId}
        AND je.status = 'posted'
        AND je.date >= ${startIso}
        AND a.type IN ('revenue', 'expense')
      GROUP BY 1, 2
    `);
    const rows = ((res as unknown as { rows: Array<{ month: string; type: 'revenue' | 'expense'; amount: unknown }> }).rows) ?? [];
    const byMonth = new Map<string, RevExpMonth>();
    for (let i = 0; i < 12; i++) {
      const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
      const key = d.toISOString().slice(0, 7);
      byMonth.set(key, { month: key, revenue: 0, expense: 0 });
    }
    for (const r of rows) {
      const slot = byMonth.get(r.month);
      if (!slot) continue;
      const v = Math.max(0, Number(r.amount) || 0);
      if (r.type === 'revenue') slot.revenue = v;
      else slot.expense = v;
    }
    const months = Array.from(byMonth.values());
    const payload: RevenueVsExpense12moPayload = {
      months,
      totalRevenue: months.reduce((s, m) => s + m.revenue, 0),
      totalExpense: months.reduce((s, m) => s + m.expense, 0),
    };
    const period = istNow.toISOString().slice(0, 7);
    await upsertSnapshot(ctx.db, ctx.tenantId, 'revenue_vs_expense_12mo', period, payload);
  },
};
