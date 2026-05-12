import { sql } from 'drizzle-orm';
import type { MetricRefresher } from '../refresh-registry';
import { upsertSnapshot } from '../snapshot-store';

export interface ExpenseCategoryRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  amount: number;
}
export interface TopExpenseCategoriesPayload {
  items: ExpenseCategoryRow[];
  totalAmount: number;
  monthStart: string;
}

export const topExpenseCategoriesRefresher: MetricRefresher = {
  metricKey: 'top_expense_categories',
  cadence: 'nightly',
  async refresh(ctx) {
    // Group posted journal-line debits on expense-type accounts for the
    // current calendar month. This is GL-accurate (uses the same numbers
    // a P&L would) and works regardless of bill-line categorization.
    const istNow = new Date(ctx.now.getTime() + 5.5 * 3_600_000);
    const monthStart = `${istNow.getUTCFullYear()}-${String(istNow.getUTCMonth() + 1).padStart(2, '0')}-01`;
    const period = monthStart.slice(0, 7);

    const res = await ctx.db.execute(sql`
      SELECT a.id AS account_id, a.code, a.name,
             COALESCE(SUM(jl.debit - jl.credit), 0) AS amount
      FROM journal_lines jl
      JOIN journal_entries je ON je.id = jl.journal_entry_id
      JOIN accounts a ON a.id = jl.account_id
      WHERE jl.tenant_id = ${ctx.tenantId}
        AND je.status = 'posted'
        AND je.date >= ${monthStart}
        AND a.type = 'expense'
      GROUP BY a.id, a.code, a.name
      HAVING COALESCE(SUM(jl.debit - jl.credit), 0) > 0
      ORDER BY amount DESC
      LIMIT 10
    `);
    const rows = ((res as unknown as { rows: Array<{ account_id: string; code: string; name: string; amount: unknown }> }).rows) ?? [];
    const items: ExpenseCategoryRow[] = rows.map((r) => ({
      accountId: r.account_id,
      accountCode: r.code,
      accountName: r.name,
      amount: Number(r.amount) || 0,
    }));
    const payload: TopExpenseCategoriesPayload = {
      items,
      totalAmount: items.reduce((s, i) => s + i.amount, 0),
      monthStart,
    };
    await upsertSnapshot(ctx.db, ctx.tenantId, 'top_expense_categories', period, payload);
  },
};
