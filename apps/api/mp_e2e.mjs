const BASE = 'http://localhost:3013/api/v1';
const sfx = `_e${Date.now().toString().slice(-7)}`;
const today = new Date().toISOString().slice(0, 10);
let token = '';
let pass = 0, fail = 0;

async function call(method, path, body) {
  const headers = { Authorization: `Bearer ${token}` };
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
}
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} — ${detail ?? ''}`); }
}

(async () => {
  const login = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'appreview@runq.in', password: 'AppleReview2026!', tenant: 'runq-demo' }),
  });
  token = (await login.json()).data?.token;
  check('login', !!token);
  if (!token) process.exit(1);

  // fixtures: VMCC, farmer, flat chart @50, two pours (am 10, pm 8) → nodeQty 18, gross 900
  const vmcc = await call('POST', '/milk-procurement/nodes', { code: `V${sfx}`, name: 'VMCC', nodeType: 'vmcc' });
  const vmccId = vmcc.body?.data?.id;
  const farmer = await call('POST', '/milk-procurement/farmers', { code: `F${sfx}`, name: 'F', nodeId: vmccId });
  const farmerId = farmer.body?.data?.id;
  await call('POST', '/milk-procurement/rate-charts', { name: `Cow${sfx}`, milkType: 'cow', pricingMode: 'flat', flatRatePerLitre: 50, effectiveFrom: today });
  await call('POST', '/milk-procurement/pours', { nodeId: vmccId, farmerId, collectionDate: today, shift: 'am', milkType: 'cow', qtyLitres: 10, fat: 4.2, snf: 8.7 });
  await call('POST', '/milk-procurement/pours', { nodeId: vmccId, farmerId, collectionDate: today, shift: 'pm', milkType: 'cow', qtyLitres: 8, fat: 4.2, snf: 8.7 });
  check('fixtures + 2 pours', !!vmccId && !!farmerId);

  console.log('\n— A7 operator comp —');
  const op = await call('POST', '/milk-procurement/operators', {
    nodeId: vmccId, role: 'operator', compType: 'per_litre_commission', ratePerLitre: 2, rentAmount: 1000, effectiveFrom: today,
  });
  check('create operator (201)', op.status === 201, `${op.status} ${JSON.stringify(op.body)}`);
  const bad = await call('POST', '/milk-procurement/operators', { nodeId: vmccId, compType: 'per_litre_commission', effectiveFrom: today });
  check('commission without rate → 400', bad.status === 400, `status ${bad.status}`);
  const comp = await call('GET', `/milk-procurement/operators/commission?nodeId=${vmccId}&from=${today}&to=${today}`);
  const o0 = comp.body?.data?.operators?.[0];
  check('commission: nodeQty 18, comm 36, rent 1000, total 1036',
    comp.body?.data?.nodeQty === 18 && o0?.commission === 36 && o0?.rent === 1000 && o0?.total === 1036,
    JSON.stringify(comp.body?.data));
  const opl = await call('GET', `/milk-procurement/operators?nodeId=${vmccId}`);
  check('list operators by node = 1', (opl.body?.data ?? []).length === 1, `count=${opl.body?.data?.length}`);

  console.log('\n— A8 config —');
  const put1 = await call('PUT', '/milk-procurement/config/gl-settings', { defaultPayoutMode: 'via_vmcc' });
  check('upsert gl-settings → via_vmcc', put1.body?.data?.defaultPayoutMode === 'via_vmcc', JSON.stringify(put1.body?.data));
  const get1 = await call('GET', '/milk-procurement/config/gl-settings');
  check('get gl-settings persists', get1.body?.data?.defaultPayoutMode === 'via_vmcc');
  const put2 = await call('PUT', '/milk-procurement/config/gl-settings', { defaultPayoutMode: 'direct_to_farmer' });
  check('update gl-settings → direct (same row)', put2.body?.data?.defaultPayoutMode === 'direct_to_farmer' && put2.body?.data?.id === put1.body?.data?.id);
  const seqs = await call('GET', '/milk-procurement/config/sequences');
  check('list sequences has counters', (seqs.body?.data ?? []).length >= 1, `count=${seqs.body?.data?.length}`);

  console.log('\n— A9 reports —');
  const rep = await call('GET', `/milk-procurement/reports/collection?nodeId=${vmccId}&from=${today}&to=${today}`);
  const d = rep.body?.data;
  check('collection: total 18, am 10, pm 8', d?.totalQty === 18 && d?.amQty === 10 && d?.pmQty === 8, JSON.stringify(d));
  check('collection: farmers 1, pours 2, gross 900', d?.farmerCount === 1 && d?.pourCount === 2 && d?.grossAmount === 900);
  check('collection: avg fat 4.2 / snf 8.7', d?.avgFat === 4.2 && d?.avgSnf === 8.7, JSON.stringify({ f: d?.avgFat, s: d?.avgSnf }));

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
