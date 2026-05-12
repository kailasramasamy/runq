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

/**
 * Per-account daily closing balance for the last 90 days, forward-filled.
 *
 * Two batched queries (was 1 + 2N before):
 *  1. All accounts + their last transactions within window (DISTINCT ON
 *     per (account, date) returns the close-of-day balance).
 *  2. Seed balance per account (latest txn strictly before window start).
 *
 * Forward-fill happens in JS — cheap, indexed in account map.
 */
export const bankBalanceTrend90dRefresher: MetricRefresher = {
  metricKey: 'bank_balance_trend_90d',
  cadence: 'nightly',
  async refresh(ctx) {
    const istToday = new Date(ctx.now.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);

    const accountsRes = await ctx.db.execute(sql`
      SELECT id, name, current_balance
      FROM bank_accounts
      WHERE tenant_id = ${ctx.tenantId} AND is_active = TRUE
      ORDER BY name
    `);
    const accounts = ((accountsRes as unknown as { rows: Array<{ id: string; name: string; current_balance: unknown }> }).rows) ?? [];
    if (accounts.length === 0) {
      const payload: BankBalanceTrend90dPayload = { accounts: [], totalSeries: [] };
      await upsertSnapshot(ctx.db, ctx.tenantId, 'bank_balance_trend_90d', istToday, payload);
      return;
    }

    // All in-window txns, one close-of-day per (account, date)
    const txnRes = await ctx.db.execute(sql`
      SELECT DISTINCT ON (bank_account_id, transaction_date)
        bank_account_id, transaction_date, running_balance
      FROM bank_transactions
      WHERE tenant_id = ${ctx.tenantId}
        AND transaction_date >= CURRENT_DATE - INTERVAL '${sql.raw(String(WINDOW_DAYS))} days'
      ORDER BY bank_account_id, transaction_date ASC, created_at DESC
    `);
    const txns = ((txnRes as unknown as { rows: Array<{ bank_account_id: string; transaction_date: string; running_balance: unknown }> }).rows) ?? [];

    // Latest pre-window balance per account — DISTINCT ON
    const seedRes = await ctx.db.execute(sql`
      SELECT DISTINCT ON (bank_account_id) bank_account_id, running_balance
      FROM bank_transactions
      WHERE tenant_id = ${ctx.tenantId}
        AND transaction_date < CURRENT_DATE - INTERVAL '${sql.raw(String(WINDOW_DAYS))} days'
      ORDER BY bank_account_id, transaction_date DESC, created_at DESC
    `);
    const seedByAccount = new Map<string, number>();
    for (const r of ((seedRes as unknown as { rows: Array<{ bank_account_id: string; running_balance: unknown }> }).rows ?? [])) {
      seedByAccount.set(r.bank_account_id, Number(r.running_balance) || 0);
    }

    // Group txns by account
    const txnsByAccount = new Map<string, Map<string, number>>();
    for (const t of txns) {
      let m = txnsByAccount.get(t.bank_account_id);
      if (!m) { m = new Map(); txnsByAccount.set(t.bank_account_id, m); }
      m.set(t.transaction_date, Number(t.running_balance) || 0);
    }

    // Build series per account with forward-fill
    const end = new Date(`${istToday}T00:00:00Z`);
    const out: BankBalanceAccount[] = accounts.map((acc) => {
      const byDay = txnsByAccount.get(acc.id) ?? new Map<string, number>();
      let last = seedByAccount.has(acc.id) ? seedByAccount.get(acc.id)! : Number(acc.current_balance) || 0;
      const points: BankBalancePoint[] = [];
      for (let i = WINDOW_DAYS - 1; i >= 0; i--) {
        const d = new Date(end.getTime() - i * 86400_000);
        const key = d.toISOString().slice(0, 10);
        if (byDay.has(key)) last = byDay.get(key) as number;
        points.push({ date: key, balance: last });
      }
      return { accountId: acc.id, accountName: acc.name, points };
    });

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
