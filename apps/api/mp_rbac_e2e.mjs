import pg from 'pg';
import argon2 from 'argon2';

const BASE = 'http://localhost:3013/api/v1';
const today = new Date().toISOString().slice(0, 10);
const ts = Date.now().toString().slice(-8);
const PW = 'Test12345!';
const farmerPhone = `9${ts}`; // 9 + 8 digits
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} — ${detail ?? ''}`); }
}

async function login(email, password = PW) {
  const r = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, tenant: 'runq-demo' }),
  });
  const j = await r.json();
  return { status: r.status, token: j.data?.token };
}
function client(token) {
  return async (method, path, body) => {
    const headers = { Authorization: `Bearer ${token}` };
    if (body) headers['Content-Type'] = 'application/json';
    const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
}

(async () => {
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const { rows: [t] } = await db.query("SELECT id FROM tenants WHERE slug = 'runq-demo'");
  const tenantId = t.id;
  const hash = await argon2.hash(PW);
  const opEmail = `op_rbac${ts}@runq.in`;
  const farmerEmail = `farmer_rbac${ts}@runq.in`;

  // create persona users + user_tenant grants (milk_procurement only)
  const { rows: [opU] } = await db.query(
    `INSERT INTO users (tenant_id, email, name, role, password_hash, is_active)
     VALUES ($1,$2,'Op RBAC','field_operator',$3,true) RETURNING id`, [tenantId, opEmail, hash]);
  await db.query(`INSERT INTO user_tenants (user_id, tenant_id, role, modules) VALUES ($1,$2,'field_operator',$3::jsonb)`,
    [opU.id, tenantId, JSON.stringify(['milk_procurement'])]);
  const { rows: [farmerU] } = await db.query(
    `INSERT INTO users (tenant_id, email, name, phone, role, password_hash, is_active)
     VALUES ($1,$2,'Farmer RBAC',$3,'farmer',$4,true) RETURNING id`, [tenantId, farmerEmail, farmerPhone, hash]);
  await db.query(`INSERT INTO user_tenants (user_id, tenant_id, role, modules) VALUES ($1,$2,'farmer',$3::jsonb)`,
    [farmerU.id, tenantId, JSON.stringify(['milk_procurement'])]);
  await db.end();
  console.log(`setup: opUser=${opU.id} farmerUser=${farmerU.id} phone=${farmerPhone}`);

  // ── as owner: build fixtures ──
  const owner = client((await login('appreview@runq.in', 'AppleReview2026!')).token);
  const nodeA = (await owner('POST', '/milk-procurement/nodes', { code: `A${ts}`, name: 'Node A', nodeType: 'vmcc' })).body.data.id;
  const nodeB = (await owner('POST', '/milk-procurement/nodes', { code: `B${ts}`, name: 'Node B', nodeType: 'vmcc' })).body.data.id;
  await owner('POST', '/milk-procurement/rate-charts', { name: `C${ts}`, milkType: 'cow', pricingMode: 'flat', flatRatePerLitre: 50, effectiveFrom: today });
  const f1 = (await owner('POST', '/milk-procurement/farmers', { code: `F${ts}`, name: 'F1', phone: farmerPhone, nodeId: nodeA })).body.data.id;
  const opLink = await owner('POST', '/milk-procurement/operators', { nodeId: nodeA, userId: opU.id, compType: 'per_litre_commission', ratePerLitre: 1, effectiveFrom: today });
  await owner('POST', '/milk-procurement/pours', { nodeId: nodeA, farmerId: f1, collectionDate: today, shift: 'am', milkType: 'cow', qtyLitres: 10, fat: 4.2, snf: 8.7 });
  check('owner fixtures built', !!nodeA && !!nodeB && !!f1 && opLink.status === 201, `opLink=${opLink.status}`);

  // ── as field_operator ──
  console.log('\n— field_operator —');
  const opLogin = await login(opEmail);
  check('operator login', opLogin.status === 200 && !!opLogin.token, `status ${opLogin.status}`);
  const op = client(opLogin.token);
  const wAtA = await op('POST', '/milk-procurement/pours', { nodeId: nodeA, farmerId: f1, collectionDate: today, shift: 'pm', milkType: 'cow', qtyLitres: 7, fat: 4.0, snf: 8.5 });
  check('operator records pour at OWN node (201)', wAtA.status === 201, `status ${wAtA.status} ${JSON.stringify(wAtA.body)}`);
  const wAtB = await op('POST', '/milk-procurement/pours', { nodeId: nodeB, farmerId: f1, collectionDate: today, shift: 'pm', milkType: 'cow', qtyLitres: 7, fat: 4.0, snf: 8.5 });
  check('operator BLOCKED at other node (403)', wAtB.status === 403, `status ${wAtB.status}`);
  const opPours = await op('GET', '/milk-procurement/pours?limit=200');
  const allA = (opPours.body?.data ?? []).every((p) => p.nodeId === nodeA);
  check('operator sees only own-node pours', (opPours.body?.data ?? []).length > 0 && allA, `count=${opPours.body?.data?.length} allA=${allA}`);
  const opNodes = await op('GET', '/milk-procurement/nodes?limit=200');
  check('operator sees only own node', (opNodes.body?.data ?? []).length === 1 && opNodes.body.data[0].id === nodeA, `count=${opNodes.body?.data?.length}`);
  const opWriteChart = await op('POST', '/milk-procurement/rate-charts', { name: 'x', milkType: 'cow', pricingMode: 'flat', flatRatePerLitre: 1, effectiveFrom: today });
  check('operator CANNOT write masters (403)', opWriteChart.status === 403, `status ${opWriteChart.status}`);
  const opFinance = await op('GET', '/ap/vendors?limit=1');
  check('operator BLOCKED from finance module (403)', opFinance.status === 403, `status ${opFinance.status}`);

  // ── as farmer ──
  console.log('\n— farmer —');
  const fLogin = await login(farmerEmail);
  check('farmer login', fLogin.status === 200 && !!fLogin.token);
  const farmer = client(fLogin.token);
  const fPours = await farmer('GET', '/milk-procurement/pours?limit=200');
  const allMine = (fPours.body?.data ?? []).every((p) => p.farmerId === f1);
  check('farmer sees only own pours', (fPours.body?.data ?? []).length > 0 && allMine, `count=${fPours.body?.data?.length} allMine=${allMine}`);
  const fWrite = await farmer('POST', '/milk-procurement/pours', { nodeId: nodeA, farmerId: f1, collectionDate: today, shift: 'pm', milkType: 'cow', qtyLitres: 5, fat: 4, snf: 8.5 });
  check('farmer CANNOT record pour (403)', fWrite.status === 403, `status ${fWrite.status}`);
  const fLedger = await farmer('GET', '/milk-procurement/payouts/ledger');
  check('farmer reads own ledger w/o id (200)', fLedger.status === 200, `status ${fLedger.status}`);
  const fNodes = await farmer('GET', '/milk-procurement/nodes');
  check('farmer BLOCKED from nodes list (403)', fNodes.status === 403, `status ${fNodes.status}`);

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
