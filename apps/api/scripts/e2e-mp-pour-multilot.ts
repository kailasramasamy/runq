/**
 * Dhenu pour replace-vs-add-lot — end-to-end against runq_dev.
 *
 * Proves the multi-lot model: a repeat for the same (farmer, date, shift, milk
 * type) REPLACES by default (prior → reversed, last-write-wins), but with
 * `asNewLot` it ADDS a second priced pour. All fixtures are synthetic
 * (E2E-LOT-*) in the Vrindavan tenant (which has an active cow rate chart) and
 * are torn down in `finally`.
 *
 * Usage: tsx --env-file=../../.env apps/api/scripts/e2e-mp-pour-multilot.ts
 */

import { createDb, mpNodes, mpFarmers, mpFarmerMemberships, mpPours, vendors } from '@runq/db';
import { and, eq } from 'drizzle-orm';
import { NodeService } from '../src/modules/milk-procurement/node.service';
import { FarmerService } from '../src/modules/milk-procurement/farmer.service';
import { PourService } from '../src/modules/milk-procurement/pour.service';

const TENANT_ID = 'a0365382-afa0-48b6-92cd-4db615a7d98b'; // Vrindavan Dairy LLP (has cow chart)
const NODE_CODE = 'E2E-LOT';
const FARMER_CODE = 'E2E-LOT-F';
const DATE = new Date().toISOString().slice(0, 10);
const ALL = { kind: 'all' } as const;

let pass = 0, fail = 0;
function check(label: string, ok: boolean, detail?: string): void {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
}

async function cleanup(db: any): Promise<void> {
  const [node] = await db.select({ id: mpNodes.id }).from(mpNodes)
    .where(and(eq(mpNodes.tenantId, TENANT_ID), eq(mpNodes.code, NODE_CODE))).limit(1);
  const [farmer] = await db.select({ id: mpFarmers.id, vendorId: mpFarmers.vendorId }).from(mpFarmers)
    .where(and(eq(mpFarmers.tenantId, TENANT_ID), eq(mpFarmers.code, FARMER_CODE))).limit(1);
  if (node) await db.delete(mpPours).where(eq(mpPours.nodeId, node.id));
  if (farmer) {
    await db.delete(mpFarmerMemberships).where(eq(mpFarmerMemberships.farmerId, farmer.id));
    await db.delete(mpFarmers).where(eq(mpFarmers.id, farmer.id));
    await db.delete(vendors).where(eq(vendors.id, farmer.vendorId));
  }
  if (node) await db.delete(mpNodes).where(eq(mpNodes.id, node.id));
}

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL required');
  const { db, pool } = createDb(dbUrl);

  console.log('\n=== Dhenu pour replace-vs-add-lot e2e ===\n');
  await cleanup(db);
  try {
    const node = await new NodeService(db, TENANT_ID).create({
      code: NODE_CODE, name: 'Lot VMCC', nodeType: 'vmcc', hasBmc: false } as any);
    const farmer = await new FarmerService(db, TENANT_ID).create({
      code: FARMER_CODE, name: 'Lot Farmer', isSociety: false, defaultMilkType: 'cow', nodeId: node.id } as any);
    const svc = new PourService(db, TENANT_ID);
    const base = { nodeId: node.id, farmerId: farmer.id, collectionDate: DATE,
      shift: 'am', milkType: 'cow', fat: 4, snf: 8.5, captureSource: 'manual' } as const;

    const recordedAm = async () => {
      const rows = await db.select({ qty: mpPours.qtyLitres, status: mpPours.status }).from(mpPours)
        .where(and(eq(mpPours.nodeId, node.id), eq(mpPours.shift, 'am')));
      const recorded = rows.filter((r: any) => r.status === 'recorded');
      const reversed = rows.filter((r: any) => r.status === 'reversed');
      const sum = recorded.reduce((a: number, r: any) => a + Number(r.qty), 0);
      return { recorded: recorded.length, reversed: reversed.length, sum };
    };

    await svc.record({ ...base, qtyLitres: 10, asNewLot: false } as any, undefined, ALL);
    let s = await recordedAm();
    check('1st pour → 1 recorded, qty 10', s.recorded === 1 && s.sum === 10, JSON.stringify(s));

    await svc.record({ ...base, qtyLitres: 12, asNewLot: false } as any, undefined, ALL);
    s = await recordedAm();
    check('replace (asNewLot=false) → still 1 recorded, qty 12, 1 reversed',
      s.recorded === 1 && s.sum === 12 && s.reversed === 1, JSON.stringify(s));

    await svc.record({ ...base, qtyLitres: 5, asNewLot: true } as any, undefined, ALL);
    s = await recordedAm();
    check('add lot (asNewLot=true) → 2 recorded, qty 17', s.recorded === 2 && s.sum === 17, JSON.stringify(s));

    await svc.record({ ...base, qtyLitres: 3, asNewLot: false } as any, undefined, ALL);
    s = await recordedAm();
    check('replace after multi-lot → reverses both, 1 recorded qty 3',
      s.recorded === 1 && s.sum === 3, JSON.stringify(s));
  } finally {
    await cleanup(db);
    await pool.end();
  }

  console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
