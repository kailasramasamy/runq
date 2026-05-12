/**
 * Smoke test for Phase 0 analytics foundations.
 * Verifies: cache getOrCompute (miss + hit + invalidate), snapshot upsert/get,
 * event queue enqueue, scheduler registry.
 *
 * Run: pnpm --filter @runq/api exec tsx src/scripts/smoke-analytics-foundation.ts
 */
import { sql } from 'drizzle-orm';
import Redis from 'ioredis';
import { createDb } from '@runq/db';
import {
  getOrCompute,
  invalidate,
  upsertSnapshot,
  getSnapshot,
  registerRefresher,
  listRefreshers,
  enqueueRefresh,
} from '../modules/analytics';

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) { console.error('DATABASE_URL required'); process.exit(1); }
  const { db, pool } = createDb(dbUrl);
  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

  let pass = 0;
  let fail = 0;
  const check = (label: string, ok: boolean) => {
    console.log(`${ok ? '✓' : '✗'} ${label}`);
    if (ok) pass++; else fail++;
  };

  const tenantRow = await db.execute(sql`SELECT id FROM tenants WHERE deleted_at IS NULL LIMIT 1`);
  const tenantId = (tenantRow as unknown as { rows: Array<{ id: string }> }).rows?.[0]?.id;
  if (!tenantId) {
    console.error('No active tenant — seed one and rerun.');
    process.exit(1);
  }
  console.log(`Using tenant ${tenantId}\n`);

  // 1. Cache miss/hit/invalidate
  let calls = 0;
  const compute = async () => { calls++; return { value: 42 }; };
  const v1 = await getOrCompute(redis, { tenantId, metricKey: 'smoke_test', ttlSec: 30 }, compute);
  const v2 = await getOrCompute(redis, { tenantId, metricKey: 'smoke_test', ttlSec: 30 }, compute);
  check('cache returns value on miss', v1.value === 42);
  check('cache returns value on hit', v2.value === 42);
  check('compute called once across miss + hit', calls === 1);

  const removed = await invalidate(redis, { tenantId, metricKey: 'smoke_test' });
  check('invalidate removes cached key', removed >= 1);

  const v3 = await getOrCompute(redis, { tenantId, metricKey: 'smoke_test', ttlSec: 30 }, compute);
  check('compute called again after invalidate', calls === 2 && v3.value === 42);
  await invalidate(redis, { tenantId, metricKey: 'smoke_test' });

  // 2. Snapshot upsert/get
  const payload = { buckets: [{ label: '0-30', amount: 1000 }] };
  await upsertSnapshot(db, tenantId, 'smoke_test_snap', '2026-05-12', payload);
  const snap = await getSnapshot<typeof payload>(db, tenantId, 'smoke_test_snap', '2026-05-12');
  check('snapshot upsert + get round-trip', snap?.payload?.buckets?.[0]?.amount === 1000);

  // Re-upsert (conflict path)
  await upsertSnapshot(db, tenantId, 'smoke_test_snap', '2026-05-12', { buckets: [{ label: '0-30', amount: 2000 }] });
  const snap2 = await getSnapshot<typeof payload>(db, tenantId, 'smoke_test_snap', '2026-05-12');
  check('snapshot upsert overwrites on conflict', snap2?.payload?.buckets?.[0]?.amount === 2000);

  await db.execute(sql`DELETE FROM analytics_snapshots WHERE tenant_id = ${tenantId} AND metric_key = 'smoke_test_snap'`);

  // 3. Registry + event queue
  registerRefresher({
    metricKey: 'smoke_test_refresher',
    cadence: 'nightly',
    refresh: async () => { /* noop */ },
  });
  check('refresher registered & listable', listRefreshers({ cadence: 'nightly' }).some(r => r.metricKey === 'smoke_test_refresher'));

  await enqueueRefresh(redis, tenantId, 'smoke_test_refresher');
  const qLen = await redis.llen('analytics:refresh:queue');
  check('enqueue pushes onto refresh queue', qLen >= 1);
  await redis.del('analytics:refresh:queue');

  console.log(`\n${pass} passed, ${fail} failed`);
  await redis.quit();
  await pool.end();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
