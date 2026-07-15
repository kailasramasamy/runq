/**
 * Verification of GET /payouts/my-lines (PayoutService.linesForFarmer):
 * farmer principals are forced to their own lines, reversed cycles are
 * excluded, joins carry the cycle window/status, ordering + limit hold.
 * Creates test data inside a transaction and ROLLS BACK — no dev-DB residue.
 *
 *   DATABASE_URL=... tsx apps/api/scripts/verify-farmer-lines.ts <TENANT_ID>
 */
import { createDb, mpNodes, mpFarmers, mpFarmerMemberships, mpPayoutCycles, mpPayoutLines, vendors } from '@runq/db';
import type { Db } from '@runq/db';
import { PayoutService } from '../src/modules/milk-procurement/payout.service';
import type { MpPrincipal } from '../src/modules/milk-procurement/access-scope';

const TENANT_ID = process.argv[2]!;
class Rollback extends Error {}

let pass = 0, fail = 0;
function check(label: string, cond: boolean, detail?: unknown): void {
  if (cond) { pass++; console.log(`  PASS ${label}`); }
  else { fail++; console.log(`  FAIL ${label}`, detail ?? ''); }
}

async function rejects(fn: () => Promise<unknown>): Promise<boolean> {
  try { await fn(); return false; } catch { return true; }
}

async function run(tx: Db): Promise<void> {
  const [node] = await tx.insert(mpNodes).values({
    tenantId: TENANT_ID, code: 'ZZFL-VMCC', name: 'Lines Test VMCC', nodeType: 'vmcc',
  }).returning();
  const [otherNode] = await tx.insert(mpNodes).values({
    tenantId: TENANT_ID, code: 'ZZFL-OTHER', name: 'Lines Test Other', nodeType: 'vmcc',
  }).returning();

  const mkFarmer = async (code: string) => {
    const [v] = await tx.insert(vendors).values({
      tenantId: TENANT_ID, name: `Lines Test ${code}`, category: 'farmer',
    }).returning();
    const [f] = await tx.insert(mpFarmers).values({
      tenantId: TENANT_ID, vendorId: v!.id, code, name: `Lines Test ${code}`,
    }).returning();
    await tx.insert(mpFarmerMemberships).values({
      tenantId: TENANT_ID, farmerId: f!.id, nodeId: node!.id, isPrimary: true,
    });
    return f!;
  };
  const farmerA = await mkFarmer('ZZFL-A');
  const farmerB = await mkFarmer('ZZFL-B');

  const mkCycle = async (no: string, start: string, end: string, status: 'open' | 'locked' | 'reversed') => {
    const [c] = await tx.insert(mpPayoutCycles).values({
      tenantId: TENANT_ID, cycleNo: no, periodStart: start, periodEnd: end, status,
    }).returning();
    return c!;
  };
  const openCycle = await mkCycle('ZZFL-C1', '2026-07-01', '2026-07-15', 'open');
  const lockedCycle = await mkCycle('ZZFL-C2', '2026-06-16', '2026-06-30', 'locked');
  const reversedCycle = await mkCycle('ZZFL-C3', '2026-06-01', '2026-06-15', 'reversed');

  const mkLine = async (cycleId: string, farmerId: string, net: string) => {
    await tx.insert(mpPayoutLines).values({
      tenantId: TENANT_ID, payoutCycleId: cycleId, farmerId,
      qtyLitres: '100', grossAmount: net, bonusAmount: '0', deductionTotal: '0', netAmount: net,
    });
  };
  await mkLine(openCycle.id, farmerA.id, '3000');
  await mkLine(lockedCycle.id, farmerA.id, '2800');
  await mkLine(reversedCycle.id, farmerA.id, '999');
  await mkLine(openCycle.id, farmerB.id, '1500');

  const svc = new PayoutService(tx, TENANT_ID);
  const asFarmerA: MpPrincipal = { kind: 'farmer', farmerId: farmerA.id };
  const asAll: MpPrincipal = { kind: 'all' };
  const atNode: MpPrincipal = { kind: 'operator', nodeIds: new Set([node!.id]), directNodeIds: new Set([node!.id]) };
  const atOtherNode: MpPrincipal = { kind: 'operator', nodeIds: new Set([otherNode!.id]), directNodeIds: new Set([otherNode!.id]) };

  console.log('1. farmer principal scoping');
  const own = await svc.linesForFarmer(undefined, asFarmerA, 24);
  check('gets own lines, reversed cycle excluded', own.length === 2, own.length);
  const spoofed = await svc.linesForFarmer(farmerB.id, asFarmerA, 24);
  check('passing another farmerId still returns own lines',
    spoofed.every((r) => r.farmerId === farmerA.id) && spoofed.length === 2);

  console.log('2. joined cycle fields + ordering');
  check('newest periodStart first', own[0]?.periodStart === '2026-07-01' && own[1]?.periodStart === '2026-06-16');
  check('cycle window + status + no flattened', own[0]?.periodEnd === '2026-07-15'
    && own[0]?.cycleStatus === 'open' && own[1]?.cycleStatus === 'locked' && own[0]?.cycleNo === 'ZZFL-C1');
  check('limit respected', (await svc.linesForFarmer(undefined, asFarmerA, 1)).length === 1);

  console.log('3. admin + operator principals');
  const admin = await svc.linesForFarmer(farmerB.id, asAll, 24);
  check('admin with farmerId gets that farmer', admin.length === 1 && admin[0]?.farmerId === farmerB.id);
  check('admin without farmerId rejects', await rejects(() => svc.linesForFarmer(undefined, asAll, 24)));
  check('operator at farmer\'s node ok', (await svc.linesForFarmer(farmerA.id, atNode, 24)).length === 2);
  check('operator at wrong node rejects', await rejects(() => svc.linesForFarmer(farmerA.id, atOtherNode, 24)));
}

async function main(): Promise<void> {
  if (!TENANT_ID) throw new Error('Usage: tsx verify-farmer-lines.ts <TENANT_ID>');
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
