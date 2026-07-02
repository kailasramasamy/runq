/**
 * Seed a full month of June 2026 milk-procurement data for the Vrindavan Dairy
 * LLP tenant — both CCs and every via_vmcc VMCC under them — so the VMCC billing
 * flow can be tested end-to-end. LOCAL dev DB only (runq_dev).
 *
 * Per run (idempotent):
 *   • clears any June-2026 payout cycle (+ its lines/deductions/bills/payments/JEs)
 *     so the half-month billing periods (1-15, 16-EOM) resolve cleanly;
 *   • ensures each via_vmcc VMCC has a payee vendor (billing pays it);
 *   • ensures ≥3 farmers per VMCC (creates where missing);
 *   • gives each VMCC one clean seed operator effective 2026-06-01 (existing
 *     mid-June operators on these nodes are deactivated so June comp is sane);
 *   • wipes + regenerates randomized June pours (AM+PM, small daily variation).
 *
 * Run: pnpm exec tsx --env-file=../../.env scripts/seed-mp-june.ts   (from apps/api)
 */

import {
  createDb, mpNodes, mpFarmers, mpFarmerMemberships, mpNodeOperators, mpPours,
  mpPayoutCycles, mpPayoutLines, mpPayoutDeductions, mpVmccBills, payments,
  vendors, journalEntries, journalLines,
} from '@runq/db';
import { and, eq, inArray, gte, lte, isNull } from 'drizzle-orm';
import { FarmerService } from '../src/modules/milk-procurement/farmer.service';

const TENANT_ID = 'a0365382-afa0-48b6-92cd-4db615a7d98b'; // Vrindavan Dairy LLP
const YEAR = 2026, MONTH = 6;
const FARMERS_PER_VMCC = 3;
const MILK_TYPES = ['cow_a1', 'buffalo', 'cow_a2'] as const;

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const round = (n: number, d = 2) => { const f = 10 ** d; return Math.round(n * f) / f; };
const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]!;
const gradeOf = (fat: number) => (fat >= 4.0 ? 'a' : fat >= 3.5 ? 'b' : 'c') as 'a' | 'b' | 'c';

function juneDays(): string[] {
  const eom = new Date(Date.UTC(YEAR, MONTH, 0)).getUTCDate();
  return Array.from({ length: eom }, (_, i) => `${YEAR}-06-${String(i + 1).padStart(2, '0')}`);
}

/** Remove every June-2026 payout cycle + everything hanging off it (clean slate). */
async function clearJuneCycles(db: any): Promise<void> {
  const cycles = await db.select({ id: mpPayoutCycles.id }).from(mpPayoutCycles).where(and(
    eq(mpPayoutCycles.tenantId, TENANT_ID),
    gte(mpPayoutCycles.periodStart, `${YEAR}-06-01`), lte(mpPayoutCycles.periodStart, `${YEAR}-06-30`),
  ));
  const cycleIds = cycles.map((c: any) => c.id);
  if (!cycleIds.length) return;
  const bills = await db.select({ id: mpVmccBills.id, paymentId: mpVmccBills.paymentId }).from(mpVmccBills)
    .where(inArray(mpVmccBills.payoutCycleId, cycleIds));
  const billIds = bills.map((b: any) => b.id);
  const lines = await db.select({ id: mpPayoutLines.id, paymentId: mpPayoutLines.paymentId }).from(mpPayoutLines)
    .where(inArray(mpPayoutLines.payoutCycleId, cycleIds));
  const lineIds = lines.map((l: any) => l.id);
  const paymentIds = [...bills.map((b: any) => b.paymentId), ...lines.map((l: any) => l.paymentId)].filter(Boolean);

  if (lineIds.length) await db.delete(mpPayoutDeductions).where(inArray(mpPayoutDeductions.payoutLineId, lineIds));
  await db.delete(mpPayoutLines).where(inArray(mpPayoutLines.payoutCycleId, cycleIds));
  await db.delete(mpVmccBills).where(inArray(mpVmccBills.payoutCycleId, cycleIds));
  await db.delete(mpPayoutCycles).where(inArray(mpPayoutCycles.id, cycleIds));
  if (paymentIds.length) await db.delete(payments).where(inArray(payments.id, paymentIds));

  const jes = await db.select({ id: journalEntries.id }).from(journalEntries).where(and(
    eq(journalEntries.tenantId, TENANT_ID),
    inArray(journalEntries.sourceType, ['mp_payout_cycle', 'mp_payout_payment', 'mp_vmcc_bill_payment', 'mp_vmcc_bill_commission', 'mp_vmcc_bill_reversal']),
    inArray(journalEntries.sourceId, [...cycleIds, ...billIds]),
  ));
  const jeIds = jes.map((j: any) => j.id);
  if (jeIds.length) {
    await db.delete(journalLines).where(inArray(journalLines.journalEntryId, jeIds));
    await db.delete(journalEntries).where(inArray(journalEntries.id, jeIds));
  }
  console.log(`  cleared ${cycleIds.length} June cycle(s), ${billIds.length} bill(s), ${jeIds.length} JE(s)`);
}

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL required');
  const { db, pool } = createDb(dbUrl);
  const farmerSvc = new FarmerService(db, TENANT_ID);
  console.log('\n=== Seed June 2026 milk-procurement data (Vrindavan) ===\n');

  // via_vmcc VMCCs under any CC (null mode inherits the tenant default via_vmcc).
  const defMode = 'via_vmcc'; // tenant default (confirmed) — null → via_vmcc
  const allVmccs = await db.select().from(mpNodes)
    .where(and(eq(mpNodes.tenantId, TENANT_ID), eq(mpNodes.nodeType, 'vmcc'), eq(mpNodes.isActive, true)));
  const vmccs = allVmccs.filter((v: any) => (v.payoutMode ?? defMode) === 'via_vmcc');
  console.log(`VMCCs to seed: ${vmccs.length}`);

  console.log('\nClearing June cycles…');
  await clearJuneCycles(db);

  const days = juneDays();
  let farmersCreated = 0, opsSeeded = 0, pourCount = 0;

  for (const v of vmccs) {
    // 1. payee vendor
    let payeeId = v.payeeVendorId as string | null;
    if (!payeeId) {
      const [ven] = await db.insert(vendors).values({
        tenantId: TENANT_ID, name: `${v.name} Payee`, category: 'other',
      }).returning({ id: vendors.id });
      payeeId = ven!.id;
      await db.update(mpNodes).set({ payeeVendorId: payeeId }).where(eq(mpNodes.id, v.id));
    }

    // 2. farmers (top up to target)
    const existing = await db.select({ farmerId: mpFarmerMemberships.farmerId }).from(mpFarmerMemberships)
      .where(and(eq(mpFarmerMemberships.tenantId, TENANT_ID), eq(mpFarmerMemberships.nodeId, v.id), isNull(mpFarmerMemberships.leftOn)));
    const needed = Math.max(0, FARMERS_PER_VMCC - existing.length);
    for (let i = 0; i < needed; i++) {
      await farmerSvc.create({
        name: `${v.name} Farmer ${existing.length + i + 1}`, isSociety: false,
        defaultMilkType: pick(MILK_TYPES), nodeId: v.id,
      } as any);
      farmersCreated++;
    }

    // 3. clean seed operator effective Jun 1 (retire other operators on this node)
    await db.update(mpNodeOperators).set({ isActive: false })
      .where(and(eq(mpNodeOperators.tenantId, TENANT_ID), eq(mpNodeOperators.nodeId, v.id), eq(mpNodeOperators.isActive, true)));
    await db.delete(mpNodeOperators)
      .where(and(eq(mpNodeOperators.tenantId, TENANT_ID), eq(mpNodeOperators.nodeId, v.id), eq(mpNodeOperators.name, 'Seed Operator')));
    const perLitre = Math.random() < 0.6;
    await db.insert(mpNodeOperators).values({
      tenantId: TENANT_ID, nodeId: v.id, name: 'Seed Operator', role: 'operator',
      compType: perLitre ? 'per_litre_commission' : 'fixed_salary',
      ratePerLitre: perLitre ? String(round(rand(1.5, 2.5))) : null,
      monthlySalary: perLitre ? null : String(round(rand(1500, 2500), 0)),
      rentAmount: String(round(rand(0, 500), 0)), payeeVendorId: payeeId,
      effectiveFrom: `${YEAR}-06-01`, isActive: true,
    });
    opsSeeded++;

    // 4. wipe June pours for this VMCC, then regenerate
    await db.delete(mpPours).where(and(
      eq(mpPours.tenantId, TENANT_ID), eq(mpPours.nodeId, v.id),
      gte(mpPours.collectionDate, `${YEAR}-06-01`), lte(mpPours.collectionDate, `${YEAR}-06-30`),
    ));
    const farmers = await db.select({ id: mpFarmers.id, milkType: mpFarmers.defaultMilkType }).from(mpFarmers)
      .innerJoin(mpFarmerMemberships, and(
        eq(mpFarmerMemberships.farmerId, mpFarmers.id), eq(mpFarmerMemberships.nodeId, v.id),
        isNull(mpFarmerMemberships.leftOn),
      )).where(eq(mpFarmers.tenantId, TENANT_ID));

    const rows: any[] = [];
    for (const f of farmers) {
      const baseQty = rand(6, 12);           // this farmer's typical daily pour
      const baseFat = rand(3.4, 4.6);        // and typical quality
      const baseSnf = rand(8.0, 8.9);
      for (const date of days) {
        for (const shift of ['am', 'pm'] as const) {
          const qty = round(Math.max(1, baseQty + rand(-1.5, 1.5) + (shift === 'pm' ? rand(-1, 0.5) : 0)), 1);
          const fat = round(baseFat + rand(-0.3, 0.3));
          const snf = round(baseSnf + rand(-0.2, 0.2));
          const rate = round(28 + (fat - 3.5) * 4 + rand(-0.5, 0.5));
          const base = round(qty * rate);
          rows.push({
            tenantId: TENANT_ID, nodeId: v.id, farmerId: f.id, collectionDate: date, shift,
            milkType: f.milkType, qtyLitres: String(qty), fat: String(fat), snf: String(snf),
            qualityGrade: gradeOf(fat), ratePerLitre: String(rate),
            baseAmount: String(base), bonusAmount: '0', lineAmount: String(base), status: 'recorded',
          });
        }
      }
    }
    for (let i = 0; i < rows.length; i += 500) await db.insert(mpPours).values(rows.slice(i, i + 500));
    pourCount += rows.length;
    console.log(`  ${v.code}: ${farmers.length} farmers, ${rows.length} pours`);
  }

  console.log(`\n✅ ${vmccs.length} VMCCs · ${farmersCreated} farmers created · ${opsSeeded} operators seeded · ${pourCount} June pours\n`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
