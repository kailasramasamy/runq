/**
 * Dhenu payout → GL (P1.1, expense-basis) — end-to-end against runq_dev.
 *
 * Proves the milk-procurement payout flow now posts balanced journal entries:
 *   • advance given     → Dr Farmer Advances (1150) / Cr Bank (1101)
 *   • cycle lock        → Dr Milk Purchases (5050) / Cr Farmer Payable (2150)
 *                         + Cr Farmer Advances (1150, recovered); cycle.journalEntryId set
 *   • cycle pay         → Dr Farmer Payable (2150) / Cr Bank (1101)
 *   • Farmer Payable and Farmer Advances both net to zero across the lifecycle.
 *
 * Fixtures synthetic (E2E-PGL-*), torn down in `finally`.
 *
 * Usage: pnpm exec tsx --env-file=/abs/.env scripts/e2e-mp-payout-gl.ts  (run from apps/api)
 */

import {
  createDb, mpNodes, mpFarmers, mpFarmerMemberships, mpPours, mpPayoutCycles,
  mpPayoutLines, mpPayoutDeductions, mpFarmerLedger, payments, vendors,
  accounts, journalEntries, journalLines,
} from '@runq/db';
import { and, eq, inArray } from 'drizzle-orm';
import { NodeService } from '../src/modules/milk-procurement/node.service';
import { FarmerService } from '../src/modules/milk-procurement/farmer.service';
import { PayoutService } from '../src/modules/milk-procurement/payout.service';

const TENANT_ID = '4ae78c54-aef4-46cb-9283-3db65edd076b'; // runq Demo Co
const NODE = 'E2E-PGL-VMCC';
const FARMER = 'E2E-PGL-F';
const PSTART = '2020-03-01', PEND = '2020-03-31', PDATE = '2020-03-05';

let pass = 0, fail = 0;
function check(label: string, ok: boolean, detail?: string): void {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
}

async function cleanup(db: any): Promise<void> {
  const nodes = await db.select({ id: mpNodes.id }).from(mpNodes)
    .where(and(eq(mpNodes.tenantId, TENANT_ID), eq(mpNodes.code, NODE)));
  const nodeIds = nodes.map((n: any) => n.id);
  const farmers = await db.select({ id: mpFarmers.id, vendorId: mpFarmers.vendorId }).from(mpFarmers)
    .where(and(eq(mpFarmers.tenantId, TENANT_ID), eq(mpFarmers.code, FARMER)));
  const farmerIds = farmers.map((f: any) => f.id);

  const cycles = await db.select({ id: mpPayoutCycles.id }).from(mpPayoutCycles)
    .where(and(eq(mpPayoutCycles.tenantId, TENANT_ID), eq(mpPayoutCycles.periodStart, PSTART)));
  const cycleIds = cycles.map((c: any) => c.id);
  if (cycleIds.length) {
    const lines = await db.select({ id: mpPayoutLines.id, paymentId: mpPayoutLines.paymentId })
      .from(mpPayoutLines).where(inArray(mpPayoutLines.payoutCycleId, cycleIds));
    const lineIds = lines.map((l: any) => l.id);
    const paymentIds = lines.map((l: any) => l.paymentId).filter(Boolean);
    if (lineIds.length) await db.delete(mpPayoutDeductions).where(inArray(mpPayoutDeductions.payoutLineId, lineIds));
    await db.delete(mpPayoutLines).where(inArray(mpPayoutLines.payoutCycleId, cycleIds));
    await db.delete(mpPayoutCycles).where(inArray(mpPayoutCycles.id, cycleIds));
    if (paymentIds.length) await db.delete(payments).where(inArray(payments.id, paymentIds));
  }
  // JEs posted by this flow (keyed by source = cycle id or ledger row id).
  const sourceIds = [...cycleIds, ...(farmerIds.length ? await ledgerIds(db, farmerIds) : [])];
  if (sourceIds.length) {
    const jes = await db.select({ id: journalEntries.id }).from(journalEntries).where(and(
      eq(journalEntries.tenantId, TENANT_ID),
      inArray(journalEntries.sourceType, ['mp_payout_cycle', 'mp_payout_payment', 'mp_farmer_ledger']),
      inArray(journalEntries.sourceId, sourceIds),
    ));
    const jeIds = jes.map((j: any) => j.id);
    if (jeIds.length) {
      await db.delete(journalLines).where(inArray(journalLines.journalEntryId, jeIds));
      await db.delete(journalEntries).where(inArray(journalEntries.id, jeIds));
    }
  }
  if (farmerIds.length) await db.delete(mpFarmerLedger).where(inArray(mpFarmerLedger.farmerId, farmerIds));
  if (nodeIds.length) {
    await db.delete(mpPours).where(inArray(mpPours.nodeId, nodeIds));
    await db.delete(mpFarmerMemberships).where(inArray(mpFarmerMemberships.nodeId, nodeIds));
  }
  for (const f of farmers) {
    await db.delete(mpFarmers).where(eq(mpFarmers.id, f.id));
    await db.delete(vendors).where(eq(vendors.id, f.vendorId));
  }
  if (nodeIds.length) await db.delete(mpNodes).where(inArray(mpNodes.id, nodeIds));
}

async function ledgerIds(db: any, farmerIds: string[]): Promise<string[]> {
  const rows = await db.select({ id: mpFarmerLedger.id }).from(mpFarmerLedger)
    .where(inArray(mpFarmerLedger.farmerId, farmerIds));
  return rows.map((r: any) => r.id);
}

/** Sum debit/credit for an account code within a single JE. */
async function legByCode(db: any, jeId: string, code: string): Promise<{ debit: number; credit: number }> {
  const [acc] = await db.select({ id: accounts.id }).from(accounts)
    .where(and(eq(accounts.tenantId, TENANT_ID), eq(accounts.code, code)));
  if (!acc) return { debit: 0, credit: 0 };
  const rows = await db.select({ debit: journalLines.debit, credit: journalLines.credit })
    .from(journalLines).where(and(eq(journalLines.journalEntryId, jeId), eq(journalLines.accountId, acc.id)));
  return rows.reduce((a: any, r: any) => ({ debit: a.debit + Number(r.debit), credit: a.credit + Number(r.credit) }), { debit: 0, credit: 0 });
}

async function findJe(db: any, sourceType: string, sourceId: string): Promise<any | null> {
  const [je] = await db.select().from(journalEntries).where(and(
    eq(journalEntries.tenantId, TENANT_ID), eq(journalEntries.sourceType, sourceType), eq(journalEntries.sourceId, sourceId)));
  return je ?? null;
}

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL required');
  const { db, pool } = createDb(dbUrl);

  console.log('\n=== Dhenu payout → GL e2e ===\n');
  await cleanup(db);

  try {
    const node = await new NodeService(db, TENANT_ID).create({
      code: NODE, name: 'PGL VMCC', nodeType: 'vmcc', hasBmc: false, payoutMode: 'direct_to_farmer' } as any);
    const farmer = await new FarmerService(db, TENANT_ID).create({
      code: FARMER, name: 'PGL Farmer', isSociety: false, defaultMilkType: 'cow', nodeId: node.id } as any);

    // One pour: 100 L @ ₹30 = ₹3000 gross.
    await db.insert(mpPours).values({
      tenantId: TENANT_ID, nodeId: node.id, farmerId: farmer.id, collectionDate: PDATE, shift: 'am',
      milkType: 'cow', qtyLitres: '100', fat: '4', snf: '8.5', qualityGrade: 'a', ratePerLitre: '30',
      baseAmount: '3000', bonusAmount: '0', lineAmount: '3000', status: 'recorded',
    });

    const svc = new PayoutService(db, TENANT_ID);

    // ── Advance given → grant JE ───────────────────────────────────────────────
    const adv = await svc.addLedgerEntry(
      { farmerId: farmer.id, entryType: 'advance_given', amount: 500, occurredOn: PDATE } as any, undefined, { kind: 'all' });
    const grantJe = await findJe(db, 'mp_farmer_ledger', adv.id);
    check('advance grant JE posted', !!grantJe);
    if (grantJe) {
      const advAsset = await legByCode(db, grantJe.id, '1150');
      const bank = await legByCode(db, grantJe.id, '1101');
      check('grant: Dr Farmer Advances 500', advAsset.debit === 500, `Dr ${advAsset.debit}`);
      check('grant: Cr Bank 500', bank.credit === 500, `Cr ${bank.credit}`);
    }

    // ── Create + lock cycle → accrual JE ───────────────────────────────────────
    const cycle = await svc.createCycle({ scopeNodeId: node.id, periodStart: PSTART, periodEnd: PEND }, { kind: 'all' });
    check('cycle line net = 2500 (3000 − 500 advance)', Number(cycle.lines[0]?.netAmount) === 2500, `net ${cycle.lines[0]?.netAmount}`);
    const locked = await svc.lockCycle(cycle.id, { kind: 'all' });
    check('cycle.journalEntryId set on lock', !!locked.journalEntryId);
    const accrualJe = await findJe(db, 'mp_payout_cycle', cycle.id);
    check('accrual JE matches cycle.journalEntryId', accrualJe?.id === locked.journalEntryId);
    if (accrualJe) {
      const milk = await legByCode(db, accrualJe.id, '5050');
      const payable = await legByCode(db, accrualJe.id, '2150');
      const advRec = await legByCode(db, accrualJe.id, '1150');
      check('accrual: Dr Milk Purchases 3000', milk.debit === 3000, `Dr ${milk.debit}`);
      check('accrual: Cr Farmer Payable 2500', payable.credit === 2500, `Cr ${payable.credit}`);
      check('accrual: Cr Farmer Advances 500 (recovered)', advRec.credit === 500, `Cr ${advRec.credit}`);
      check('accrual JE balanced', Number(accrualJe.totalDebit) === Number(accrualJe.totalCredit));
    }

    // ── Pay cycle → payment JE ─────────────────────────────────────────────────
    await svc.payCycle(cycle.id, { kind: 'all' }, undefined);
    const payJe = await findJe(db, 'mp_payout_payment', cycle.id);
    check('payment JE posted', !!payJe);
    if (payJe) {
      const payable = await legByCode(db, payJe.id, '2150');
      const bank = await legByCode(db, payJe.id, '1101');
      check('payment: Dr Farmer Payable 2500', payable.debit === 2500, `Dr ${payable.debit}`);
      check('payment: Cr Bank 2500', bank.credit === 2500, `Cr ${bank.credit}`);
    }

    // ── Control accounts net to zero across the lifecycle ──────────────────────
    const jeIds = [grantJe, accrualJe, payJe].filter(Boolean).map((j: any) => j.id);
    const net = async (code: string) => {
      let d = 0, c = 0;
      for (const id of jeIds) { const l = await legByCode(db, id, code); d += l.debit; c += l.credit; }
      return d - c;
    };
    check('Farmer Payable nets to 0', (await net('2150')) === 0, `${await net('2150')}`);
    check('Farmer Advances nets to 0', (await net('1150')) === 0, `${await net('1150')}`);

    console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed\n`);
  } finally {
    await cleanup(db);
    await pool.end();
  }
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
