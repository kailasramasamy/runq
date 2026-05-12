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

  for (const k of ['cash_runway','gross_margin','cash_flow_summary']) {
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
    console.log(`${label.padEnd(20)} ${String(Math.round(performance.now() - t0)).padStart(4)}ms`);
    return r;
  };

  const r = await time('cash_runway', () => svc.cashRunway());
  console.log(`  cash ${r.cashOnHand} · 30d net burn ${r.netBurn30d} · runway ${r.runwayMonths === null ? 'cash-positive' : r.runwayMonths + 'mo'}`);

  const gm = await time('gross_margin', () => svc.grossMargin());
  console.log(`  revenue ${gm.revenue} · cogs ${gm.cogs} · gp ${gm.grossProfit} · margin ${gm.marginPct === null ? 'n/a' : gm.marginPct + '%'}`);

  const cf = await time('cash_flow_summary', () => svc.cashFlowSummary());
  console.log(`  op ${cf.operating} · inv ${cf.investing} · fin ${cf.financing} · net ${cf.netChange} · close ${cf.closingBalance}`);

  await redis.quit();
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
