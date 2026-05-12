import { sql } from 'drizzle-orm';
import Redis from 'ioredis';
import { createDb } from '@runq/db';
import { LiveMetricsService } from '../modules/analytics/live-metrics.service';
import { ReportSummariesService } from '../modules/analytics/report-summaries.service';
import { CAPortalService } from '../modules/ca-portal/ca-portal.service';

async function main() {
  const { db, pool } = createDb(process.env.DATABASE_URL!);
  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  const t = await db.execute(sql`SELECT id, name FROM tenants WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1`);
  const tenant = (t as unknown as { rows: Array<{ id: string; name: string }> }).rows[0];
  console.log(`Tenant: ${tenant.name}\n`);
  const log = { warn: console.warn } as never;

  // Clear caches
  for (const k of ['cash_forecast','pnl_summary']) {
    let cur = '0';
    do {
      const [n, ks] = await redis.scan(cur, 'MATCH', `analytics:${tenant.id}:${k}*`, 'COUNT', 100);
      cur = n; if (ks.length) await redis.del(...ks);
    } while (cur !== '0');
  }

  const live = new LiveMetricsService(db, redis, tenant.id, log);
  const reports = new ReportSummariesService(db, redis, tenant.id, log);
  const ca = new CAPortalService(db, tenant.id);
  const t0 = (n: number) => `${String(Math.round(performance.now() - n)).padStart(4)}ms`;

  console.log('— #1 cash forecast —');
  let s = performance.now();
  const cf = await live.cashForecast();
  console.log(`cashForecast ${t0(s)} · cash on hand ${cf.cashOnHand}`);
  console.log(`  next 7d:  in ${cf.next7d.inflow} (${cf.next7d.receivableCount}) - out ${cf.next7d.outflow} (${cf.next7d.payableCount}) = net ${cf.next7d.net} → projected ${cf.projectedAt7d}`);
  console.log(`  next 30d: in ${cf.next30d.inflow} (${cf.next30d.receivableCount}) - out ${cf.next30d.outflow} (${cf.next30d.payableCount}) = net ${cf.next30d.net} → projected ${cf.projectedAt30d}`);

  console.log('\n— #13 P&L period selector —');
  for (const k of ['fy', 'qtr', 'month'] as const) {
    s = performance.now();
    const p = await reports.pnlSummary(k);
    console.log(`pnlSummary(${k}) ${t0(s)}`);
    console.log(`  ${p.period.from} → ${p.period.to}: rev ${p.totalRevenue}, exp ${p.totalExpense}, net ${p.netProfit}`);
    console.log(`  vs prior (${p.prior.period.from} → ${p.prior.period.to}): net ${p.prior.netProfit}, delta ${p.netProfitDeltaPct}%`);
  }

  console.log('\n— #23 trial balance reuse —');
  s = performance.now();
  const tb = await ca.getTrialBalance();
  console.log(`TB ${t0(s)} · ${tb.accounts.length} accounts · debit ${tb.totalDebit}, credit ${tb.totalCredit}, balanced=${Math.abs(tb.totalDebit - tb.totalCredit) < 0.01}`);

  await redis.quit(); await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
