const BASE = 'http://localhost:3003/api/v1';
const ts = Date.now().toString().slice(-7);
const today = new Date().toISOString().slice(0, 10);
let token = '';
let pass = 0, fail = 0;

async function call(method, path, body) {
  const headers = { Authorization: `Bearer ${token}` };
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
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

  // two VMCCs
  const A = (await call('POST', '/milk-procurement/nodes', { code: `VA${ts}`, name: 'VMCC A', nodeType: 'vmcc' })).body.data.id;
  const B = (await call('POST', '/milk-procurement/nodes', { code: `VB${ts}`, name: 'VMCC B', nodeType: 'vmcc' })).body.data.id;

  // tenant-wide cow chart @ 50, and an A-scoped cow chart @ 60 (both effective today)
  await call('POST', '/milk-procurement/rate-charts', { name: `Tenant cow ${ts}`, milkType: 'cow', pricingMode: 'flat', flatRatePerLitre: 50, effectiveFrom: today });
  const aChart = (await call('POST', '/milk-procurement/rate-charts', { name: `A-scoped cow ${ts}`, milkType: 'cow', pricingMode: 'flat', flatRatePerLitre: 60, scopeNodeId: A, effectiveFrom: today })).body.data.id;
  check('created A-scoped chart', !!aChart);

  const fa = (await call('POST', '/milk-procurement/farmers', { code: `FA${ts}`, name: 'Farmer A', nodeId: A })).body.data.id;
  const fb = (await call('POST', '/milk-procurement/farmers', { code: `FB${ts}`, name: 'Farmer B', nodeId: B })).body.data.id;

  console.log('\n— resolve (chart selection) —');
  const rA = await call('GET', `/milk-procurement/rate-charts/resolve?milkType=cow&fat=4.2&snf=8.7&scopeNodeId=${A}`);
  check('at VMCC A → A-scoped chart wins (rate 60)', rA.body?.data?.rateChartId === aChart && rA.body?.data?.baseRatePerLitre === 60,
    JSON.stringify(rA.body?.data));
  const rB = await call('GET', `/milk-procurement/rate-charts/resolve?milkType=cow&fat=4.2&snf=8.7&scopeNodeId=${B}`);
  check('at VMCC B → NOT the A-scoped chart (falls back tenant-wide)', rB.body?.data?.rateChartId !== aChart && !!rB.body?.data?.rateChartId,
    JSON.stringify(rB.body?.data));

  console.log('\n— record pours (collection) —');
  const pA = await call('POST', '/milk-procurement/pours', { nodeId: A, farmerId: fa, collectionDate: today, shift: 'am', milkType: 'cow', qtyLitres: 10, fat: 4.2, snf: 8.7, captureSource: 'manual' });
  check('pour at A uses A-scoped chart', pA.status === 201 && pA.body?.data?.rateChartId === aChart && pA.body?.data?.ratePerLitre === '60.00',
    JSON.stringify({ id: pA.body?.data?.rateChartId, rate: pA.body?.data?.ratePerLitre }));
  check('pour at A line amount = 600', pA.body?.data?.lineAmount === '600.00', `line=${pA.body?.data?.lineAmount}`);
  const pB = await call('POST', '/milk-procurement/pours', { nodeId: B, farmerId: fb, collectionDate: today, shift: 'am', milkType: 'cow', qtyLitres: 10, fat: 4.2, snf: 8.7, captureSource: 'manual' });
  check('pour at B records (tenant-wide chart, not A-scoped)', pB.status === 201 && pB.body?.data?.rateChartId !== aChart, `${pB.status}`);

  console.log('\n— deactivate A-scoped → A falls back to tenant-wide —');
  await call('POST', `/milk-procurement/rate-charts/${aChart}/deactivate`);
  const rA2 = await call('GET', `/milk-procurement/rate-charts/resolve?milkType=cow&fat=4.2&snf=8.7&scopeNodeId=${A}`);
  check('after deactivate, A no longer uses A-scoped chart', rA2.body?.data?.rateChartId !== aChart && !!rA2.body?.data?.rateChartId, JSON.stringify(rA2.body?.data));

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
