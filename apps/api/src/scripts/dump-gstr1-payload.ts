/**
 * Quick debug script: load the current GSTR-1 draft from DB and dump the
 * exact JSON payload that runq would send to WhiteBooks. Lets us inspect
 * the wire format without waiting for log tails.
 *
 * Usage: pnpm --filter @runq/api exec tsx src/scripts/dump-gstr1-payload.ts
 */
import { createDb } from '@runq/db';
import { eq, and } from 'drizzle-orm';
import { gstReturns, tenants } from '@runq/db';
import { WhiteBooksGspClient } from '../modules/gst/gsp-client';

const TENANT_ID = 'c74fabbb-f342-4741-a2a5-e96043449546';
const PERIOD = '042026';

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
      eq(gstReturns.returnType, 'gstr1'),
    ))
    .limit(1);

  if (!ret?.data) {
    console.error('No draft data');
    process.exit(1);
  }

  const client = new WhiteBooksGspClient();
  // Access the private transform via any-cast for debug purposes
  const transform = (client as unknown as {
    transformGstr1ForUpload: (g: string, p: string, d: unknown) => unknown;
  }).transformGstr1ForUpload.bind(client);

  const payload = transform(gstin, PERIOD, ret.data);
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
