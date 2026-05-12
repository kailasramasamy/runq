import { sql } from 'drizzle-orm';
import Redis from 'ioredis';
import { createDb } from '@runq/db';
import { ReportSummariesService } from '../modules/analytics/report-summaries.service';

async function main() {
  const { db, pool } = createDb(process.env.DATABASE_URL!);
  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  const t = await db.execute(sql`SELECT id, name FROM tenants WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1`);
  const tenant = (t as unknown as { rows: Array<{ id: string; name: string }> }).rows[0];
  console.log(`Tenant: ${tenant.name}\n`);

  for (const k of ['suspense_summary','pending_approvals']) {
    let cur = '0';
    do {
      const [n, ks] = await redis.scan(cur, 'MATCH', `analytics:${tenant.id}:${k}*`, 'COUNT', 100);
      cur = n; if (ks.length) await redis.del(...ks);
    } while (cur !== '0');
  }

  const svc = new ReportSummariesService(db, redis, tenant.id, { warn: console.warn } as never);

  const t1 = performance.now();
  const s = await svc.suspenseSummary();
  console.log(`suspense_summary  ${Math.round(performance.now() - t1)}ms`);
  console.log(`  totalAbsBalance: ₹${s.totalAbsBalance} · stuck: ${s.totalStuck} · clean: ${s.clean}`);
  for (const a of s.accounts) {
    console.log(`    ${a.accountCode} ${a.accountName.padEnd(35)} balance=${a.balance} (${a.lineCount} lines)`);
  }

  const t2 = performance.now();
  const p = await svc.pendingApprovals();
  console.log(`\npending_approvals ${Math.round(performance.now() - t2)}ms`);
  console.log(`  total: ${p.total}`);
  for (const b of p.byEntityType) {
    console.log(`    ${b.entityType.padEnd(20)} count=${b.count} oldest=${b.oldestRequestedAt ?? '—'}`);
  }

  await redis.quit();
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
