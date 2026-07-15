/**
 * Verification of rate chart overrides: exercises the resolution chain
 * (farmer → VMCC → scoped → tenant) plus fall-through and assignment guards.
 * Creates test data inside a transaction and ROLLS BACK — no dev-DB residue.
 *
 *   DATABASE_URL=... tsx apps/api/scripts/verify-rate-overrides.ts <TENANT_ID>
 */
import { eq } from 'drizzle-orm';
import { createDb, mpNodes, mpFarmers, mpRateCharts, mpRateChartCells, vendors } from '@runq/db';
import type { Db } from '@runq/db';
import { RateChartService, assertAssignableRateChart } from '../src/modules/milk-procurement/rate-chart.service';

const TENANT_ID = process.argv[2]!;
class Rollback extends Error {}

let pass = 0, fail = 0;
function check(label: string, cond: boolean, detail?: unknown): void {
  if (cond) { pass++; console.log(`  PASS ${label}`); }
  else { fail++; console.log(`  FAIL ${label}`, detail ?? ''); }
}

async function rejectsWith(fn: () => Promise<unknown>, msg: string): Promise<boolean> {
  try { await fn(); return false; } catch (e) { return e instanceof Error && e.message === msg; }
}

async function run(tx: Db): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);

  const flatChart = async (name: string, rate: string, extra: Partial<typeof mpRateCharts.$inferInsert> = {}) => {
    const [c] = await tx.insert(mpRateCharts).values({
      tenantId: TENANT_ID, name, milkType: 'cow_a1', pricingMode: 'flat',
      flatRatePerLitre: rate, effectiveFrom: '2026-01-01', ...extra,
    }).returning();
    return c!;
  };

  const [node] = await tx.insert(mpNodes).values({
    tenantId: TENANT_ID, code: 'ZZTEST-VMCC', name: 'Override Test VMCC', nodeType: 'vmcc',
  }).returning();
  // dumping ground for override charts so they never win by scope/tenant-wide
  const [otherNode] = await tx.insert(mpNodes).values({
    tenantId: TENANT_ID, code: 'ZZTEST-OTHER', name: 'Override Test Other', nodeType: 'vmcc',
  }).returning();
  const [vendor] = await tx.insert(vendors).values({
    tenantId: TENANT_ID, name: 'Override Test Farmer', category: 'farmer',
  }).returning();
  const [farmer] = await tx.insert(mpFarmers).values({
    tenantId: TENANT_ID, vendorId: vendor!.id, code: 'ZZTEST-F1', name: 'Override Test Farmer',
  }).returning();

  const A = await flatChart('ZZ A tenant-wide', '30.00');
  // B/C/etc are scoped to an unrelated node so auto-resolution can never pick
  // them — they only apply via explicit assignment (also proves assignment
  // works regardless of the chart's declared scope).
  const B = await flatChart('ZZ B node override', '40.00', { scopeNodeId: otherNode!.id });
  const C = await flatChart('ZZ C farmer override', '50.00', { scopeNodeId: otherNode!.id });
  const buffalo = await flatChart('ZZ buffalo', '60.00', { milkType: 'buffalo', scopeNodeId: otherNode!.id });
  const [clrChart] = await tx.insert(mpRateCharts).values({
    tenantId: TENANT_ID, name: 'ZZ CLR', milkType: 'cow_a1', pricingMode: 'clr',
    effectiveFrom: '2026-01-01', scopeNodeId: otherNode!.id,
  }).returning();
  await tx.insert(mpRateChartCells).values({
    tenantId: TENANT_ID, rateChartId: clrChart!.id, clr: '24.00', ratePerLitre: '35.00',
  });

  const svc = new RateChartService(tx, TENANT_ID);
  const resolve = (over: Record<string, unknown> = {}) => svc.resolveRate({
    milkType: 'cow_a1', fat: 4, snf: 8, scopeNodeId: node!.id, onDate: today, ...over,
  } as Parameters<typeof svc.resolveRate>[0]);

  console.log('1. baseline (no overrides)');
  check('resolves tenant-wide A @30', (await resolve()).rateChartId === A.id);

  console.log('2. VMCC override');
  await tx.update(mpNodes).set({ rateChartId: B.id }).where(eq(mpNodes.id, node!.id));
  let r = await resolve();
  check('resolves node override B @40', r.rateChartId === B.id && r.ratePerLitre === 40, r);

  console.log('3. farmer override beats VMCC override');
  await tx.update(mpFarmers).set({ rateChartId: C.id }).where(eq(mpFarmers.id, farmer!.id));
  r = await resolve({ farmerId: farmer!.id });
  check('with farmerId → C @50', r.rateChartId === C.id && r.ratePerLitre === 50, r);
  check('without farmerId → still B', (await resolve()).rateChartId === B.id);

  console.log('4. fall-through: deactivated farmer chart');
  await tx.update(mpRateCharts).set({ isActive: false }).where(eq(mpRateCharts.id, C.id));
  check('falls to B, no error', (await resolve({ farmerId: farmer!.id })).rateChartId === B.id);
  await tx.update(mpRateCharts).set({ isActive: true }).where(eq(mpRateCharts.id, C.id));

  console.log('5. fall-through: mode mismatch (CLR chart on fat/snf pour)');
  await tx.update(mpFarmers).set({ rateChartId: clrChart!.id }).where(eq(mpFarmers.id, farmer!.id));
  check('fat/snf pour falls to B', (await resolve({ farmerId: farmer!.id })).rateChartId === B.id);
  r = await resolve({ farmerId: farmer!.id, fat: undefined, snf: undefined, clr: 25 });
  check('clr pour uses CLR override @35', r.rateChartId === clrChart!.id && r.ratePerLitre === 35, r);

  console.log('6. fall-through: milk type mismatch');
  await tx.update(mpFarmers).set({ rateChartId: buffalo.id }).where(eq(mpFarmers.id, farmer!.id));
  check('buffalo chart on cow pour falls to B', (await resolve({ farmerId: farmer!.id })).rateChartId === B.id);

  console.log('7. fall-through: effective window');
  const future = await flatChart('ZZ future', '70.00', { effectiveFrom: '2030-01-01', scopeNodeId: otherNode!.id });
  await tx.update(mpFarmers).set({ rateChartId: future.id }).where(eq(mpFarmers.id, farmer!.id));
  check('not-yet-effective chart falls to B', (await resolve({ farmerId: farmer!.id })).rateChartId === B.id);

  console.log('8. assignment guards');
  check('random uuid → NotFound', await rejectsWith(() =>
    assertAssignableRateChart(tx, TENANT_ID, '00000000-0000-4000-8000-000000000000'), 'Rate chart not found'));
  check('other tenant\'s chart → NotFound', await rejectsWith(() =>
    assertAssignableRateChart(tx, '00000000-0000-4000-8000-000000000001', B.id), 'Rate chart not found'));
  await tx.update(mpRateCharts).set({ isActive: false }).where(eq(mpRateCharts.id, C.id));
  check('inactive chart → ValidationError', await rejectsWith(() =>
    assertAssignableRateChart(tx, TENANT_ID, C.id), 'Rate chart is inactive'));
  check('active chart → ok', await assertAssignableRateChart(tx, TENANT_ID, B.id).then(() => true, () => false));
}

async function main(): Promise<void> {
  if (!TENANT_ID) throw new Error('Usage: tsx verify-rate-overrides.ts <TENANT_ID>');
  const { db, pool } = createDb(process.env.DATABASE_URL!);
  try {
    await db.transaction(async (tx) => {
      await run(tx as unknown as Db);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  } finally {
    await pool.end();
  }
  console.log(`\n${pass} passed, ${fail} failed — all test data rolled back`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
