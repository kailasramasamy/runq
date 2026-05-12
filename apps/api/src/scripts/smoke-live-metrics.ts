import { sql } from 'drizzle-orm';
import Redis from 'ioredis';
import { createDb } from '@runq/db';
import { LiveMetricsService } from '../modules/analytics/live-metrics.service';

async function main() {
  const { db, pool } = createDb(process.env.DATABASE_URL!);
  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  const logger = { warn: (...a: unknown[]) => console.warn(...a) } as never;

  const t = await db.execute(sql`SELECT id, name FROM tenants WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1`);
  const tenant = (t as unknown as { rows: Array<{ id: string; name: string }> }).rows[0];
  console.log(`Tenant: ${tenant.name} (${tenant.id})\n`);

  const svc = new LiveMetricsService(db, redis, tenant.id, logger);

  // Invalidate caches first so we see real timings
  for (const k of ['cash_position','ar_outstanding_total','ap_outstanding_total','sales_mtd','bills_due_this_week']) {
    await redis.del(`analytics:${tenant.id}:${k}`);
  }

  const time = async <T>(label: string, fn: () => Promise<T>) => {
    const t0 = performance.now();
    const r = await fn();
    console.log(`${label.padEnd(28)} ${Math.round(performance.now() - t0)}ms`);
    return r;
  };

  const cash = await time('cash_position', () => svc.cashPosition());
  console.log(`  total: ${cash.total}, accounts: ${cash.byAccount.length}`);

  const ar = await time('ar_outstanding', () => svc.arOutstanding());
  console.log(`  total: ${ar.total}, invoices: ${ar.invoiceCount}`);

  const ap = await time('ap_outstanding', () => svc.apOutstanding());
  console.log(`  total: ${ap.total}, bills: ${ap.invoiceCount}`);

  const sales = await time('sales_mtd', () => svc.salesMtd());
  console.log(`  this month: ${sales.amount} (${sales.count}), prev: ${sales.prevAmount} (${sales.prevCount})`);

  const due = await time('bills_due_this_week', () => svc.billsDueThisWeek());
  console.log(`  bills: ${due.items.length}, total: ${due.totalAmount}`);

  console.log('\n— cache hit pass —');
  await time('cash_position (cached)', () => svc.cashPosition());
  await time('ar_outstanding (cached)', () => svc.arOutstanding());

  await redis.quit();
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
