import { sql } from 'drizzle-orm';
import Redis from 'ioredis';
import { createDb } from '@runq/db';
import { registerAllRefreshers } from '../modules/analytics/snapshot-refreshers';
import { listRefreshers } from '../modules/analytics/refresh-registry';
import { getSnapshot } from '../modules/analytics/snapshot-store';

async function main() {
  const { db, pool } = createDb(process.env.DATABASE_URL!);
  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  registerAllRefreshers();

  const t = await db.execute(sql`SELECT id, name FROM tenants WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1`);
  const tenant = (t as unknown as { rows: Array<{ id: string; name: string }> }).rows[0];
  console.log(`Tenant: ${tenant.name}\n`);

  const istDay = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
  const istMonth = istDay.slice(0, 7);

  for (const r of listRefreshers({ cadence: 'nightly' })) {
    const t0 = performance.now();
    await r.refresh({ db, redis, tenantId: tenant.id, now: new Date() });
    const ms = Math.round(performance.now() - t0);
    const monthMetrics = new Set(['top_expense_categories', 'revenue_vs_expense_12mo', 'dso_trend_6mo']);
    const period = monthMetrics.has(r.metricKey) ? istMonth : istDay;
    const snap = await getSnapshot<Record<string, unknown>>(db, tenant.id, r.metricKey, period);
    console.log(`${r.metricKey.padEnd(28)} ${String(ms).padStart(4)}ms`);
    console.log(`  payload preview: ${JSON.stringify(snap?.payload).slice(0, 200)}`);
  }

  await redis.quit();
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
