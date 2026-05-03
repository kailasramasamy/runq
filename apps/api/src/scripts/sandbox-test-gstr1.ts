/**
 * Sandbox iteration script: load draft, fresh OTP, upload to /gstr1/retsave.
 */
import { createDb, gstReturns, gspAuthTokens } from '@runq/db';
import { eq, and, desc } from 'drizzle-orm';
import { WhiteBooksGspClient } from '../modules/gst/gsp-client';

const TENANT_ID = 'a0365382-afa0-48b6-92cd-4db615a7d98b';
const PERIOD = '042026';
const GSTIN = '29AALFV5152D1ZZ';
const USERNAME = 'vrindavandairy';
const STATE_CD = '29';
const OTP = '';
const SKIP_OTP = true;

async function main() {
  const { db } = createDb(process.env.DATABASE_URL!);
  const [ret] = await db.select().from(gstReturns).where(and(
    eq(gstReturns.tenantId, TENANT_ID),
    eq(gstReturns.period, PERIOD),
    eq(gstReturns.returnType, 'gstr1'),
  )).limit(1);
  if (!ret?.data) { console.error('No draft'); process.exit(1); }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = ret.data as any;

  const client = new WhiteBooksGspClient();
  let token;
  if (SKIP_OTP) {
    const [t] = await db.select().from(gspAuthTokens).where(eq(gspAuthTokens.gstin, GSTIN)).orderBy(desc(gspAuthTokens.createdAt)).limit(1);
    if (!t) { console.error('No token'); process.exit(1); }
    token = { accessToken: t.accessToken, txn: t.txn || '', expiresAt: t.expiresAt };
    console.log('Using existing token, txn:', token.txn);
  } else {
    const challenge = await client.requestOtp(GSTIN, USERNAME);
    console.log('   ', JSON.stringify(challenge));
    token = await client.verifyOtp(GSTIN, USERNAME, OTP, challenge.txn!);
    console.log('2) txn:', token.txn);
  }

  // Use runq's actual transform via uploadGstr1
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await client.uploadGstr1(token, GSTIN, USERNAME, PERIOD, data as any);
  console.log('3) Result:', JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch((e) => { console.error('FAILED:', e); process.exit(1); });
