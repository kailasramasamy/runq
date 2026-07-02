/**
 * Dhenu VMCC billing → GL — end-to-end against runq_dev.
 *
 * Proves the per-VMCC bill settlement flow:
 *   • generate  → one bill per via_vmcc VMCC under a CC for a locked cycle
 *   • pay       → Dr Farmer Payable (2150) / Cr Bank (1101) for milk cost
 *               + Dr Commission Expense (5060) / Cr Bank (1101) for comp
 *               + AP payment to the VMCC vendor = total, txn ref captured
 *               + payout lines tagged (billId/paymentId/settledViaNodeId/paidAt)
 *               + mp_operator_payouts row recorded
 *               + cycle auto-flips to paid
 *   • generate again → idempotent (0 new); pay again → rejected
 *
 * Fixtures synthetic (E2E-VB-*), torn down in `finally`.
 *
 * Usage: pnpm exec tsx --env-file=/abs/.env scripts/e2e-mp-vmcc-bill.ts  (from apps/api)
 */

import {
  createDb, mpNodes, mpFarmers, mpFarmerMemberships, mpNodeOperators, mpOperatorPayouts,
  mpPours, mpPayoutCycles, mpPayoutLines, mpPayoutDeductions, mpVmccBills, payments, vendors,
  accounts, journalEntries, journalLines,
} from '@runq/db';
import { and, eq, inArray } from 'drizzle-orm';
import { NodeService } from '../src/modules/milk-procurement/node.service';
import { FarmerService } from '../src/modules/milk-procurement/farmer.service';
import { VmccBillService } from '../src/modules/milk-procurement/vmcc-bill.service';

const TENANT_ID = '4ae78c54-aef4-46cb-9283-3db65edd076b'; // runq Demo Co
const CC = 'E2E-VB-CC', VMCC = 'E2E-VB-VMCC', FARMER = 'E2E-VB-F', PAYEE = 'E2E-VB-PAYEE';
const PSTART = '2020-04-01', PEND = '2020-04-15', PDATE = '2020-04-05';

let pass = 0, fail = 0;
function check(label: string, ok: boolean, detail?: string): void {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
}

async function cleanup(db: any): Promise<void> {
  const nodes = await db.select({ id: mpNodes.id }).from(mpNodes)
    .where(and(eq(mpNodes.tenantId, TENANT_ID), inArray(mpNodes.code, [CC, VMCC])));
  const nodeIds = nodes.map((n: any) => n.id);
  const farmers = await db.select({ id: mpFarmers.id, vendorId: mpFarmers.vendorId }).from(mpFarmers)
    .where(and(eq(mpFarmers.tenantId, TENANT_ID), eq(mpFarmers.code, FARMER)));
  const farmerIds = farmers.map((f: any) => f.id);
  const cycles = await db.select({ id: mpPayoutCycles.id }).from(mpPayoutCycles)
    .where(and(eq(mpPayoutCycles.tenantId, TENANT_ID), eq(mpPayoutCycles.periodStart, PSTART)));
  const cycleIds = cycles.map((c: any) => c.id);

  const billRows = cycleIds.length
    ? await db.select({ id: mpVmccBills.id, paymentId: mpVmccBills.paymentId }).from(mpVmccBills)
        .where(inArray(mpVmccBills.payoutCycleId, cycleIds))
    : [];
  const billIds = billRows.map((b: any) => b.id);
  const paymentIds = billRows.map((b: any) => b.paymentId).filter(Boolean);

  if (cycleIds.length) {
    const lines = await db.select({ id: mpPayoutLines.id }).from(mpPayoutLines).where(inArray(mpPayoutLines.payoutCycleId, cycleIds));
    const lineIds = lines.map((l: any) => l.id);
    if (lineIds.length) await db.delete(mpPayoutDeductions).where(inArray(mpPayoutDeductions.payoutLineId, lineIds));
    await db.delete(mpPayoutLines).where(inArray(mpPayoutLines.payoutCycleId, cycleIds));
    await db.delete(mpVmccBills).where(inArray(mpVmccBills.payoutCycleId, cycleIds));
    await db.delete(mpPayoutCycles).where(inArray(mpPayoutCycles.id, cycleIds));
  }
  if (paymentIds.length) await db.delete(payments).where(inArray(payments.id, paymentIds));

  // JEs posted by lock (cycle) + bill legs (bill id).
  const jeSources = [...cycleIds, ...billIds];
  if (jeSources.length) {
    const jes = await db.select({ id: journalEntries.id }).from(journalEntries).where(and(
      eq(journalEntries.tenantId, TENANT_ID),
      inArray(journalEntries.sourceType, ['mp_payout_cycle', 'mp_payout_payment', 'mp_vmcc_bill_payment', 'mp_vmcc_bill_commission', 'mp_vmcc_bill_reversal']),
      inArray(journalEntries.sourceId, jeSources),
    ));
    const jeIds = jes.map((j: any) => j.id);
    if (jeIds.length) {
      await db.delete(journalLines).where(inArray(journalLines.journalEntryId, jeIds));
      await db.delete(journalEntries).where(inArray(journalEntries.id, jeIds));
    }
  }
  if (nodeIds.length) {
    await db.delete(mpOperatorPayouts).where(inArray(mpOperatorPayouts.nodeId, nodeIds));
    await db.delete(mpNodeOperators).where(inArray(mpNodeOperators.nodeId, nodeIds));
    await db.delete(mpPours).where(inArray(mpPours.nodeId, nodeIds));
    await db.delete(mpFarmerMemberships).where(inArray(mpFarmerMemberships.nodeId, nodeIds));
  }
  for (const f of farmers) {
    await db.delete(mpFarmers).where(eq(mpFarmers.id, f.id));
    await db.delete(vendors).where(eq(vendors.id, f.vendorId));
  }
  if (nodeIds.length) await db.delete(mpNodes).where(inArray(mpNodes.id, nodeIds));
  await db.delete(vendors).where(and(eq(vendors.tenantId, TENANT_ID), eq(vendors.name, PAYEE)));
}

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

  console.log('\n=== Dhenu VMCC billing → GL e2e ===\n');
  await cleanup(db);

  try {
    const nodeSvc = new NodeService(db, TENANT_ID);
    const cc = await nodeSvc.create({ code: CC, name: 'VB Chilling Centre', nodeType: 'cc', hasBmc: true } as any);
    const [payee] = await db.insert(vendors).values({ tenantId: TENANT_ID, name: PAYEE, category: 'other' }).returning({ id: vendors.id });
    const vmcc = await nodeSvc.create({
      code: VMCC, name: 'VB VMCC', nodeType: 'vmcc', hasBmc: false, parentNodeId: cc.id,
      payoutMode: 'via_vmcc', payeeVendorId: payee!.id } as any);
    const farmer = await new FarmerService(db, TENANT_ID).create({
      code: FARMER, name: 'VB Farmer', isSociety: false, defaultMilkType: 'cow', nodeId: vmcc.id } as any);

    // Operator: per-litre ₹2 commission + ₹100 rent.
    await db.insert(mpNodeOperators).values({
      tenantId: TENANT_ID, nodeId: vmcc.id, name: 'VB Operator', role: 'operator',
      compType: 'per_litre_commission', ratePerLitre: '2', rentAmount: '100', payeeVendorId: payee!.id,
      effectiveFrom: PSTART, isActive: true,
    });

    // One pour: 100 L @ ₹30 = ₹3000.
    await db.insert(mpPours).values({
      tenantId: TENANT_ID, nodeId: vmcc.id, farmerId: farmer.id, collectionDate: PDATE, shift: 'am',
      milkType: 'cow', qtyLitres: '100', fat: '4', snf: '8.5', qualityGrade: 'a', ratePerLitre: '30',
      baseAmount: '3000', bonusAmount: '0', lineAmount: '3000', status: 'recorded',
    });

    const billSvc = new VmccBillService(db, TENANT_ID);
    const SEL = { year: 2020, month: 4, half: 'first' as const }; // 2020-04-01 → 2020-04-15

    // ── Billable preview (auto-creates the open cycle, no GL) ────────────────────
    const preview = await billSvc.listBillable(SEL, cc.id, { kind: 'all' });
    const pv = preview.find((r) => r.vmccNodeId === vmcc.id);
    check('preview: VMCC listed', !!pv);
    check('preview: milk cost 3000', pv?.milkCost === 3000, `${pv?.milkCost}`);
    check('preview: commission+rent 300', (pv?.commission ?? 0) + (pv?.rent ?? 0) === 300, `comm ${pv?.commission} rent ${pv?.rent}`);
    check('preview: total 3300', pv?.total === 3300, `${pv?.total}`);

    // ── Generate (auto-resolves + LOCKS the tenant-wide cycle) ───────────────────
    const gen = await billSvc.generate({ ...SEL, ccNodeId: cc.id }, { kind: 'all' });
    check('generate: 1 bill created', gen.length === 1, `${gen.length}`);
    const billId = gen[0]!.id;
    const [cycle] = await db.select().from(mpPayoutCycles).where(and(
      eq(mpPayoutCycles.tenantId, TENANT_ID), eq(mpPayoutCycles.periodStart, PSTART), eq(mpPayoutCycles.periodEnd, PEND)));
    check('cycle auto-created + locked', cycle?.status === 'locked', cycle?.status);
    // Regenerate refreshes the same bill (idempotent amounts), not a duplicate.
    const genAgain = await billSvc.generate({ ...SEL, ccNodeId: cc.id }, { kind: 'all' });
    check('regenerate refreshes same bill', genAgain.length === 1 && genAgain[0]!.id === billId && Number(genAgain[0]!.totalAmount) === 3300, `${genAgain.length}`);

    // ── Pay ──────────────────────────────────────────────────────────────────
    const paid = await billSvc.pay(billId, { txnReference: 'UTR-VB-001', paymentMode: 'bank_transfer', paymentDate: PDATE }, { kind: 'all' });
    check('pay: bill status paid', paid.status === 'paid');
    check('pay: total 3300', Number(paid.totalAmount) === 3300, `${paid.totalAmount}`);
    check('pay: txn ref stored', paid.txnReference === 'UTR-VB-001');

    const milkJe = await findJe(db, 'mp_vmcc_bill_payment', billId);
    check('milk JE posted', !!milkJe);
    if (milkJe) {
      const payable = await legByCode(db, milkJe.id, '2150');
      const bank = await legByCode(db, milkJe.id, '1101');
      check('milk JE: Dr Farmer Payable 3000', payable.debit === 3000, `Dr ${payable.debit}`);
      check('milk JE: Cr Bank 3000', bank.credit === 3000, `Cr ${bank.credit}`);
    }
    const commJe = await findJe(db, 'mp_vmcc_bill_commission', billId);
    check('commission JE posted', !!commJe);
    if (commJe) {
      const comm = await legByCode(db, commJe.id, '5060');
      const bank = await legByCode(db, commJe.id, '1101');
      check('commission JE: Dr Commission 300', comm.debit === 300, `Dr ${comm.debit}`);
      check('commission JE: Cr Bank 300', bank.credit === 300, `Cr ${bank.credit}`);
      check('commission JE balanced', Number(commJe.totalDebit) === Number(commJe.totalCredit));
    }

    // AP payment to the VMCC vendor = total.
    if (paid.paymentId) {
      const [pay] = await db.select().from(payments).where(eq(payments.id, paid.paymentId));
      check('AP payment = 3300 to VMCC vendor', Number(pay?.amount) === 3300 && pay?.vendorId === payee!.id, `${pay?.amount}`);
    } else check('AP payment created', false);

    // Payout line tagged + cycle closed + operator payout recorded.
    const [line] = await db.select().from(mpPayoutLines).where(eq(mpPayoutLines.payoutCycleId, cycle.id));
    check('line: billId set', line?.billId === billId);
    check('line: settledViaNodeId = VMCC', line?.settledViaNodeId === vmcc.id);
    check('line: paidAt set', !!line?.paidAt);
    const [freshCycle] = await db.select().from(mpPayoutCycles).where(eq(mpPayoutCycles.id, cycle.id));
    check('cycle auto-flipped to paid', freshCycle?.status === 'paid');
    const [op] = await db.select().from(mpOperatorPayouts).where(eq(mpOperatorPayouts.nodeId, vmcc.id));
    check('operator payout recorded (total 300)', Number(op?.total) === 300, `${op?.total}`);

    // ── Idempotency ────────────────────────────────────────────────────────────
    let rejected = false;
    try { await billSvc.pay(billId, { paymentMode: 'cash', paymentDate: PDATE }, { kind: 'all' }); }
    catch { rejected = true; }
    check('pay again: rejected', rejected);

    // Control: Farmer Payable nets to 0 across lock accrual + bill milk pay.
    const accrual = await findJe(db, 'mp_payout_cycle', cycle.id);
    let d = 0, c = 0;
    for (const je of [accrual, milkJe].filter(Boolean)) {
      const l = await legByCode(db, je.id, '2150'); d += l.debit; c += l.credit;
    }
    check('Farmer Payable nets to 0', d - c === 0, `${d - c}`);

    console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed\n`);
  } finally {
    await cleanup(db);
    await pool.end();
  }
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
