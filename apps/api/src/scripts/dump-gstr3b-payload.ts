/**
 * Dump the exact GSTR-3B JSON payload runq would send to WhiteBooks for
 * a given tenant + period. Lets us diff against GSTN schema rejections
 * without burning a sandbox call.
 *
 * Usage: pnpm --filter @runq/api exec tsx src/scripts/dump-gstr3b-payload.ts
 */
import { createDb } from '@runq/db';
import { eq, and } from 'drizzle-orm';
import { gstReturns, tenants } from '@runq/db';
import { WhiteBooksGspClient } from '../modules/gst/gsp-client';

const TENANT_ID = process.env.TENANT_ID || 'a0365382-afa0-48b6-92cd-4db615a7d98b';
const PERIOD = process.env.PERIOD || '042026';

async function main() {
  const { db } = createDb(process.env.DATABASE_URL!);

  const [t] = await db.select().from(tenants).where(eq(tenants.id, TENANT_ID)).limit(1);
  const settings = t?.settings as { gstin?: string } | undefined;
  const gstin = settings?.gstin || '';

  const [ret] = await db
    .select()
    .from(gstReturns)
    .where(and(
      eq(gstReturns.tenantId, TENANT_ID),
      eq(gstReturns.period, PERIOD),
      eq(gstReturns.returnType, 'gstr3b'),
    ))
    .limit(1);

  if (!ret?.data) {
    console.error('No GSTR-3B draft data for', TENANT_ID, PERIOD);
    process.exit(1);
  }

  const client = new WhiteBooksGspClient();
  const transform = (client as unknown as {
    transformGstr3bForUpload: (g: string, p: string, d: unknown) => unknown;
  }).transformGstr3bForUpload.bind(client);

  const payload = transform(gstin, PERIOD, ret.data);
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
