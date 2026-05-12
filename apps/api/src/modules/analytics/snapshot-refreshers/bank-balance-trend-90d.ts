import { sql } from 'drizzle-orm';
import type { MetricRefresher } from '../refresh-registry';
import { upsertSnapshot } from '../snapshot-store';

export interface BankBalancePoint {
  date: string; // YYYY-MM-DD
  balance: number;
}
export interface BankBalanceAccount {
  accountId: string;
  accountName: string;
  points: BankBalancePoint[];
}
export interface BankBalanceTrend90dPayload {
  accounts: BankBalanceAccount[];
  totalSeries: BankBalancePoint[];
}

const WINDOW_DAYS = 90;

export const bankBalanceTrend90dRefresher: MetricRefresher = {
  metricKey: 'bank_balance_trend_90d',
  cadence: 'nightly',
  async refresh(ctx) {
    // For each active account, get the last running_balance per day in the
    // window; forward-fill days with no transaction.
    const istToday = new Date(ctx.now.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);

    const accountsRes = await ctx.db.execute(sql`
      SELECT id, name, current_balance
      FROM bank_accounts
      WHERE tenant_id = ${ctx.tenantId} AND is_active = TRUE
      ORDER BY name
    `);
    const accounts = ((accountsRes as unknown as { rows: Array<{ id: string; name: string; current_balance: unknown }> }).rows) ?? [];

    const out: BankBalanceAccount[] = [];
    for (const acc of accounts) {
      const txnRes = await ctx.db.execute(sql`
        SELECT DISTINCT ON (transaction_date) transaction_date, running_balance
        FROM bank_transactions
        WHERE tenant_id = ${ctx.tenantId}
          AND bank_account_id = ${acc.id}
          AND transaction_date >= CURRENT_DATE - INTERVAL '${sql.raw(String(WINDOW_DAYS))} days'
        ORDER BY transaction_date ASC, created_at DESC
      `);
      const txns = ((txnRes as unknown as { rows: Array<{ transaction_date: string; running_balance: unknown }> }).rows) ?? [];
      const byDay = new Map<string, number>();
      for (const t of txns) byDay.set(t.transaction_date, Number(t.running_balance) || 0);

      // Find earliest known balance ≤ window start to seed forward-fill
      const seedRes = await ctx.db.execute(sql`
        SELECT running_balance
        FROM bank_transactions
        WHERE tenant_id = ${ctx.tenantId}
          AND bank_account_id = ${acc.id}
          AND transaction_date < CURRENT_DATE - INTERVAL '${sql.raw(String(WINDOW_DAYS))} days'
        ORDER BY transaction_date DESC, created_at DESC
        LIMIT 1
      `);
      const seedRow = ((seedRes as unknown as { rows: Array<{ running_balance: unknown }> }).rows)?.[0];
      let last = seedRow ? Number(seedRow.running_balance) || 0 : Number(acc.current_balance) || 0;

      const points: BankBalancePoint[] = [];
      const end = new Date(`${istToday}T00:00:00Z`);
      for (let i = WINDOW_DAYS - 1; i >= 0; i--) {
        const d = new Date(end.getTime() - i * 86400_000);
        const key = d.toISOString().slice(0, 10);
        if (byDay.has(key)) last = byDay.get(key) as number;
        points.push({ date: key, balance: last });
      }
      out.push({ accountId: acc.id, accountName: acc.name, points });
    }

    const totalSeries: BankBalancePoint[] = [];
    if (out.length > 0) {
      const len = out[0].points.length;
      for (let i = 0; i < len; i++) {
        totalSeries.push({
          date: out[0].points[i].date,
          balance: out.reduce((s, a) => s + (a.points[i]?.balance ?? 0), 0),
        });
      }
    }

    const payload: BankBalanceTrend90dPayload = { accounts: out, totalSeries };
    await upsertSnapshot(ctx.db, ctx.tenantId, 'bank_balance_trend_90d', istToday, payload);
  },
};
