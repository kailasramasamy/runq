/**
 * White Books GSP sandbox connectivity test.
 * Run: pnpm --filter api exec tsx --env-file=/Users/vaidehi/Projects/runq/.env scripts/test-gsp-sandbox.ts
 */

const BASE_URL = process.env.MASTERS_INDIA_API_URL || 'https://apisandbox.whitebooks.in';
const CLIENT_ID = process.env.MASTERS_INDIA_CLIENT_ID || '';
const CLIENT_SECRET = process.env.MASTERS_INDIA_CLIENT_SECRET || '';
const GSTIN = process.env.MASTERS_INDIA_GSTIN || '';
const USERNAME = process.env.MASTERS_INDIA_USERNAME || '';
const EMAIL = process.env.MASTERS_INDIA_EMAIL || '';
const SANDBOX_OTP = '575757';

function stateCode(): string { return GSTIN.substring(0, 2); }

function headers(txn?: string): Record<string, string> {
  const h: Record<string, string> = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'client_id': CLIENT_ID,
    'client_secret': CLIENT_SECRET,
    'gst_username': USERNAME,
    'state_cd': stateCode(),
    'ip_address': '127.0.0.1',
  };
  if (txn) h['txn'] = txn;
  return h;
}

async function main() {
  console.log('=== White Books GSP Sandbox Test ===\n');
  console.log(`Base URL:  ${BASE_URL}`);
  console.log(`GSTIN:     ${GSTIN}`);
  console.log(`Username:  ${USERNAME}`);
  console.log(`Email:     ${EMAIL}`);
  console.log(`Client ID: ${CLIENT_ID.substring(0, 8)}...`);
  console.log();

  if (!EMAIL) {
    console.log('❌ MASTERS_INDIA_EMAIL not set in .env — required for White Books API');
    return;
  }

  // Step 1: Request OTP
  console.log('1. Requesting OTP...');
  const otpUrl = `${BASE_URL}/authentication/otprequest?email=${encodeURIComponent(EMAIL)}`;
  const otpRes = await fetch(otpUrl, { method: 'GET', headers: headers() });
  const otpData = await otpRes.json();
  console.log(`   Status: ${otpRes.status}`);
  console.log(`   Response:`, JSON.stringify(otpData, null, 2));
  console.log();

  const txn = otpData.txn || otpData.header?.txn;
  if (!txn) {
    console.log('❌ No transaction ID returned. Check credentials.');
    return;
  }
  console.log(`   ✅ TXN: ${txn}`);

  // Step 2: Verify OTP
  console.log('\n2. Verifying OTP (sandbox: 575757)...');
  const authUrl = `${BASE_URL}/authentication/authtoken?email=${encodeURIComponent(EMAIL)}&otp=${SANDBOX_OTP}`;
  const authRes = await fetch(authUrl, { method: 'GET', headers: headers(txn) });
  const authData = await authRes.json();
  console.log(`   Status: ${authRes.status}`);
  console.log(`   Response:`, JSON.stringify(authData, null, 2));
  console.log();

  const token = authData.auth_token || authData.authtoken || authData.header?.auth_token || authData.header?.authtoken;
  const activeTxn = authData.txn || authData.header?.txn || txn;
  if (!token) {
    // Auth succeeded but token may be in an unexpected location — the txn itself acts as the session
    console.log('   Note: No separate auth_token field. Using txn as session identifier.');
    console.log(`   TXN (session): ${activeTxn}`);
  } else {
    console.log(`✅ Authenticated!`);
    console.log(`   Token: ${token.substring(0, 30)}...`);
    console.log(`   TXN:   ${activeTxn}`);
  }
  console.log();

  // Step 3: Try GSTR-1 summary
  const testPeriod = '032026';
  console.log(`3. Fetching GSTR-1 summary for ${testPeriod}...`);
  const activeTxnForSum = authData.txn || authData.header?.txn || txn;
  const sumUrl = `${BASE_URL}/gstr1/retsum?gstin=${GSTIN}&retperiod=${testPeriod}&email=${encodeURIComponent(EMAIL)}`;
  const sumRes = await fetch(sumUrl, { method: 'GET', headers: headers(activeTxnForSum) });
  const sumData = await sumRes.json();
  console.log(`   Status: ${sumRes.status}`);
  console.log(`   Response:`, JSON.stringify(sumData, null, 2).substring(0, 500));
  console.log();

  console.log('=== Sandbox test complete ===');
}

main().catch(console.error);
