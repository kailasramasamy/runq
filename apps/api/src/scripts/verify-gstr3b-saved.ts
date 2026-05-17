/**
 * Pulls the GSTN-stored 3B summary for a given tenant+period and diffs
 * it against what runq sent at SAVE time. Identifies silent-drops by
 * GSTN's compute pipeline (the canonical Table 5 decimal-rejection case).
 *
 * Usage: TENANT_ID=... PERIOD=042026 pnpm --filter @runq/api exec tsx \
 *          src/scripts/verify-gstr3b-saved.ts
 */
import { createDb } from '@runq/db';
import { eq, and } from 'drizzle-orm';
import { gstReturns, tenants } from '@runq/db';
import { GstReturnService } from '../modules/gst/gst-return.service';

const TENANT_ID = process.env.TENANT_ID || 'a0365382-afa0-48b6-92cd-4db615a7d98b';
const PERIOD    = process.env.PERIOD    || '042026';

async function main() {
  const { db } = createDb(process.env.DATABASE_URL!);

  const [t] = await db.select().from(tenants).where(eq(tenants.id, TENANT_ID)).limit(1);
  if (!t) { console.error('No tenant', TENANT_ID); process.exit(1); }

  const [ret] = await db
    .select()
    .from(gstReturns)
    .where(and(
      eq(gstReturns.tenantId, TENANT_ID),
      eq(gstReturns.period, PERIOD),
      eq(gstReturns.returnType, 'gstr3b'),
    ))
    .limit(1);
  if (!ret) { console.error('No 3B for', TENANT_ID, PERIOD); process.exit(1); }
  console.log(`Verifying 3B ${ret.id} status=${ret.status}`);

  const svc = new GstReturnService(db, TENANT_ID);
  // Dump the raw GSP response so we can verify our diff parser is reading
  // the right shape. WhiteBooks may wrap differently than we expect.
  const profile = await (svc as any).getTenantGstProfile();
  const token = await (svc as any).getValidToken(ret.gstin);
  const gsp = (svc as any).gsp;
  const raw = await gsp.getRawGstr3bSummary(token, ret.gstin, profile.gstUsername, PERIOD);
  console.log('--- RAW GSTN retsum response ---');
  console.log(JSON.stringify(raw, null, 2));
  console.log('--------------------------------');
  const drift = await svc.verify3b(ret.id);
  if (!drift || drift.length === 0) {
    console.log('✓ No drift — everything we sent is stored as-is on GSTN.');
  } else {
    console.log(`⚠ ${drift.length} drift field(s) found:`);
    for (const d of drift) {
      console.log(`  ${d.section} · ${d.field}: sent=${d.sent}  stored=${d.stored}  delta=${d.delta}`);
    }
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
