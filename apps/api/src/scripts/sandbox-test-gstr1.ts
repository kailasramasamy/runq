/**
 * End-to-end sandbox test: load draft, transform, request OTP, verify,
 * upload to /gstr1/retsave. Lets us iterate on payload format without
 * Railway redeploy cycles.
 *
 * Usage:
 *   DATABASE_URL='...' MASTERS_INDIA_API_URL='https://apisandbox.whitebooks.in' \
 *   MASTERS_INDIA_CLIENT_ID='...' MASTERS_INDIA_CLIENT_SECRET='...' \
 *   MASTERS_INDIA_EMAIL='...' MASTERS_INDIA_SANDBOX=true \
 *   pnpm --filter @runq/api exec tsx src/scripts/sandbox-test-gstr1.ts
 */
import { createDb, gstReturns } from '@runq/db';
import { eq, and } from 'drizzle-orm';
import { WhiteBooksGspClient } from '../modules/gst/gsp-client';

const TENANT_ID = 'a0365382-afa0-48b6-92cd-4db615a7d98b';
const PERIOD = '042026';
const GSTIN = '27AAGCB1286Q2Z3';
const USERNAME = 'MH_NT2.1642';
const OTP = '575757';

async function main() {
  const { db } = createDb(process.env.DATABASE_URL!);
  const [ret] = await db.select().from(gstReturns).where(and(
    eq(gstReturns.tenantId, TENANT_ID),
    eq(gstReturns.period, PERIOD),
    eq(gstReturns.returnType, 'gstr1'),
  )).limit(1);
  if (!ret?.data) { console.error('No draft'); process.exit(1); }

  // Full payload (no filtering)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = ret.data as any;
  const minimalData = data;
  console.log('Minimal payload b2b count:', minimalData.b2b.length, 'hsn count:', minimalData.hsn.length);

  const client = new WhiteBooksGspClient();

  console.log('1+2) Reusing latest token from gsp_auth_tokens (skip OTP)...');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { gspAuthTokens } = await import('@runq/db');
  const [existingToken] = await db
    .select()
    .from(gspAuthTokens)
    .where(eq(gspAuthTokens.gstin, GSTIN))
    .orderBy((require('drizzle-orm').sql as any)`${gspAuthTokens.createdAt} DESC`)
    .limit(1);
  if (!existingToken) { console.error('No token found'); process.exit(1); }
  const token = {
    accessToken: existingToken.accessToken,
    txn: existingToken.txn || '',
    expiresAt: existingToken.expiresAt,
  };
  console.log('   reusing txn:', token.txn);

  console.log('3) Uploading runq-transformed payload (full)...');
  const result = await client.uploadGstr1(token, GSTIN, USERNAME, PERIOD, minimalData);
  console.log('Result:', JSON.stringify(result, null, 2));
  process.exit(0);
  // Below is dead code — keeping for reference of dev-portal sample test.
  /* eslint-disable */
  const samplePayload = {
    gstin: GSTIN,
    fp: PERIOD,
    gt: 3782969.01,
    cur_gt: 3782969.01,
    b2b: [{
      ctin: '01AABCE2207R1Z5',
      inv: [{ inum: 'S008400', idt: '24-11-2016', val: 729248.16, pos: '06', rchrg: 'N', etin: '01AABCE5507R1C4', inv_typ: 'R', diff_percent: 0.65, itms: [{ num: 1, itm_det: { rt: 5, txval: 10000, iamt: 325, csamt: 500 } }] }],
    }],
    b2cl: [{ pos: '05', inv: [{ inum: '92661', idt: '10-01-2016', val: 784586.33, inv_typ: 'CBW', etin: '27AHQPA8875L1CU', diff_percent: 0.65, itms: [{ num: 1, itm_det: { rt: 5, txval: 10000, iamt: 325, csamt: 500 } }] }] }],
    cdnr: [{ ctin: '01AAAAP1208Q1ZS', nt: [{ ntty: 'C', nt_num: '533515', nt_dt: '23-09-2016', p_gst: 'N', pos: '01', rchrg: 'N', inv_typ: 'R', val: 123123, diff_percent: 0.65, itms: [{ num: 1, itm_det: { rt: 10, txval: 5225.28, iamt: 339.64, csamt: 789.52 } }] }] }],
    b2cs: [{ sply_ty: 'INTER', diff_percent: 0.65, rt: 5, typ: 'E', etin: '01AABCE5507R1C4', pos: '05', txval: 110, iamt: 10, csamt: 10 }],
    exp: [{ exp_typ: 'WPAY', inv: [{ inum: '81542', idt: '12-02-2016', val: 995048.36, diff_percent: 0.65, sbpcode: 'ASB991', sbnum: '7896542', sbdt: '04-10-2016', itms: [{ txval: 10000, rt: 5, iamt: 833.33, csamt: 100 }] }] }],
    hsn: { data: [{ num: 1, hsn_sc: '1009', desc: 'Goods Description', uqc: 'kg', qty: 2.05, rt: 0.1, txval: 10.23, iamt: 14.52, csamt: 500 }] },
    nil: { inv: [{ sply_ty: 'INTRB2B', expt_amt: 123.45, nil_amt: 1470.85, ngsup_amt: 1258.5 }] },
    doc_issue: { doc_det: [{ doc_num: 1, docs: [{ num: 1, from: '20', to: '29', totnum: 20, cancel: 3, net_issue: 17 }] }] },
  };
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'client_id': process.env.MASTERS_INDIA_CLIENT_ID!,
    'client_secret': process.env.MASTERS_INDIA_CLIENT_SECRET!,
    'gst_username': USERNAME,
    'state_cd': '27',
    'access_token': token.accessToken,
    'txn': token.txn || '',
    'gstin': GSTIN,
    'ret_period': PERIOD,
    'ip_address': '127.0.0.1',
  };
  const url = `${process.env.MASTERS_INDIA_API_URL}/gstr1/retsave?email=${encodeURIComponent(process.env.MASTERS_INDIA_EMAIL!)}`;
  const res = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(samplePayload) });
  const result2 = await res.json();
  console.log('Sample result:', result2);
  console.log('Result:');
  console.log(JSON.stringify(result, null, 2));

  process.exit(0);
}

main().catch((e) => { console.error('FAILED:', e); process.exit(1); });
