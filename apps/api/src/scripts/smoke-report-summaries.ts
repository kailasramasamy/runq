import { sql } from 'drizzle-orm';
import Redis from 'ioredis';
import { createDb } from '@runq/db';
import { ReportSummariesService } from '../modules/analytics/report-summaries.service';

async function main() {
  const { db, pool } = createDb(process.env.DATABASE_URL!);
  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  const log = { warn: (...a: unknown[]) => console.warn(...a) } as never;

  const t = await db.execute(sql`SELECT id, name FROM tenants WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1`);
  const tenant = (t as unknown as { rows: Array<{ id: string; name: string }> }).rows[0];
  console.log(`Tenant: ${tenant.name}\n`);

  for (const k of ['pnl_summary','bs_summary','tb_summary','unreconciled_bank_txns']) {
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', `analytics:${tenant.id}:${k}*`, 'COUNT', 100);
      cursor = next;
      if (keys.length) await redis.del(...keys);
    } while (cursor !== '0');
  }

  const svc = new ReportSummariesService(db, redis, tenant.id, log);

  const time = async <T>(label: string, fn: () => Promise<T>) => {
    const t0 = performance.now();
    const r = await fn();
    console.log(`${label.padEnd(28)} ${String(Math.round(performance.now() - t0)).padStart(5)}ms`);
    return r;
  };

  const pnl = await time('pnl_summary',           () => svc.pnlSummary());
  console.log(`  revenue ${pnl.totalRevenue} · expense ${pnl.totalExpense} · net ${pnl.netProfit}`);
  const bs  = await time('bs_summary',            () => svc.bsSummary());
  console.log(`  assets ${bs.totalAssets} · liab ${bs.totalLiabilities} · equity ${bs.totalEquity} · balanced=${bs.balanced}`);
  const tb  = await time('tb_summary',            () => svc.trialBalanceSummary());
  console.log(`  accounts ${tb.accountCount} · debit ${tb.totalDebit} · credit ${tb.totalCredit} · balanced=${tb.balanced}`);
  const ur  = await time('unreconciled_bank_txns',() => svc.unreconciledBankTxns());
  console.log(`  count ${ur.count} · total ${ur.total}`);

  console.log('\n— cache hit pass —');
  await time('pnl_summary (cached)', () => svc.pnlSummary());
  await time('bs_summary (cached)',  () => svc.bsSummary());

  await redis.quit();
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
