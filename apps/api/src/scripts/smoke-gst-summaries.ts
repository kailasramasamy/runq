import { sql } from 'drizzle-orm';
import Redis from 'ioredis';
import { createDb } from '@runq/db';
import { GstSummariesService, previousMonthPeriod } from '../modules/analytics/gst-summaries.service';

async function main() {
  const { db, pool } = createDb(process.env.DATABASE_URL!);
  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  const log = { warn: (...a: unknown[]) => console.warn(...a) } as never;

  const t = await db.execute(sql`SELECT id, name FROM tenants WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1`);
  const tenant = (t as unknown as { rows: Array<{ id: string; name: string }> }).rows[0];
  console.log(`Tenant: ${tenant.name}`);
  console.log(`Period: ${previousMonthPeriod().label} (${previousMonthPeriod().period})\n`);

  // Clear cache
  for (const k of ['gstr1_vs_3b_summary','gstr2b_recon_summary','gst_liability_current','vendors_not_filed_summary']) {
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', `analytics:${tenant.id}:${k}*`, 'COUNT', 100);
      cursor = next;
      if (keys.length) await redis.del(...keys);
    } while (cursor !== '0');
  }

  const svc = new GstSummariesService(db, redis, tenant.id, log);
  const time = async <T>(label: string, fn: () => Promise<T>) => {
    const t0 = performance.now();
    const r = await fn();
    console.log(`${label.padEnd(28)} ${String(Math.round(performance.now() - t0)).padStart(5)}ms`);
    return r;
  };

  const a = await time('gstr1_vs_3b_summary', () => svc.gstr1Vs3bSummary());
  console.log(`  gstr1=${a.gstr1Available} gstr3b=${a.gstr3bAvailable} mismatch=${a.hasMismatch} taxableΔ=${a.outwardTaxableValueDelta} taxΔ=${a.totalTaxDelta}`);

  const b = await time('gstr2b_recon_summary', () => svc.gstr2bReconSummary());
  console.log(`  has2b=${b.has2b} matched=${b.matched.count} mismatched=${b.mismatched.count} notInBooks=${b.notInBooks.count} notIn2b=${b.notIn2b.count} itcAvail=${b.totalItcAvailable} itcClaim=${b.totalItcClaimable} atRisk=${b.itcAtRisk}`);

  const c = await time('gst_liability_current', () => svc.gstLiabilityCurrent());
  console.log(`  has3b=${c.has3b} payable=${c.totalPayable} itcUsed=${c.totalItcUsed} cash=${c.totalCashPayable}`);

  const d = await time('vendors_not_filed_summary', () => svc.vendorsNotFiledSummary());
  console.log(`  has2b=${d.has2b} blockers=${d.vendors.length} totalAtRisk=${d.totalItcAtRisk}`);
  for (const v of d.vendors.slice(0, 3)) {
    console.log(`    - ${v.vendorName} [${v.reason}] ₹${v.itcAtRisk}`);
  }

  await redis.quit();
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
