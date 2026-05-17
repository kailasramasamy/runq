/**
 * Re-upload an existing GSTR-3B draft to GSTN with the latest payload-
 * transform code. Idempotent — /retsave is PUT — so this just overwrites
 * the saved draft on GSTN's side without affecting the filing lifecycle.
 *
 * Usage: TENANT_ID=... PERIOD=042026 pnpm --filter @runq/api exec tsx \
 *          src/scripts/reupload-gstr3b.ts
 */
import { createDb } from '@runq/db';
import { eq, and } from 'drizzle-orm';
import { gstReturns } from '@runq/db';
import { GstReturnService } from '../modules/gst/gst-return.service';

const TENANT_ID = process.env.TENANT_ID || 'a0365382-afa0-48b6-92cd-4db615a7d98b';
const PERIOD    = process.env.PERIOD    || '042026';

async function main() {
  const { db } = createDb(process.env.DATABASE_URL!);

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
  console.log(`Re-uploading 3B ${ret.id} status=${ret.status}`);

  // upload3b validates status==='validated'. For a re-upload of an
  // already-uploaded return, temporarily flip back so the service path
  // we want exercises (save + auto-verify).
  await db.update(gstReturns).set({ status: 'validated' }).where(eq(gstReturns.id, ret.id));

  const svc = new GstReturnService(db, TENANT_ID);
  const result = await svc.upload3b(ret.id);
  console.log('Upload result:', JSON.stringify(result, null, 2));

  // Re-fetch to see drift result the auto-verify wrote.
  const [after] = await db.select().from(gstReturns).where(eq(gstReturns.id, ret.id)).limit(1);
  console.log('Post-verify drift:', JSON.stringify(after?.verifyDrift ?? null, null, 2));
  console.log('Final status:', after?.status);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
