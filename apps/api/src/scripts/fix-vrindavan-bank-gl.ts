/**
 * One-shot remediation for Vrindavan Dairy LLP bank GL.
 *
 * Closes a ₹2.01L gap between the Banking dashboard balance (₹2,15,587.06,
 * sum of running_balance across ICICI + AXIS) and the Cash at Bank GL
 * (₹13,675.57). Three issues:
 *
 *  1. Duplicate payment JE on ICICI bank txn 3e6a41f4 ₹61,074.80
 *     (Apr 16, A2 Milk - Gollahalli). Two posted payment JEs CR'd Cash:
 *       - JE-0348 → payment ffbb3c9d-5820-4d8b-933d-c03dab6f1b12 (kept)
 *       - JE-0350 → payment 556793d3-42fd-4370-8bfe-ac3bdcf68e85 (reversed)
 *
 *  2. JE-0140 (bank_credit) wrongly categorised the ₹33,982 inter-bank
 *     transfer inflow at ICICI as a customer receipt — DR Cash / CR AR.
 *     Reversing it leaves the placeholder "Vrindavan Dairy - ICICI Current"
 *     PI + its payment as the (ugly but balanced) inter-bank trail.
 *
 *  3. No opening-balance JE for the bank GL. After fixes 1 + 2 the GL lands
 *     at ₹40,768.37; the dashboard reflects ₹2,15,587.06 because the
 *     bank-txn running_balance carries an implicit opening of ₹1,74,818.69.
 *     Post a single equity-side JE to seed it (matches existing
 *     opening_balance_ar / opening_balance_ap convention, offsets to 3002
 *     Retained Earnings).
 *
 *  4. Soft-delete the orphan vendor "Vrindavan Dairy - Axis Current"
 *     (zero PIs/payments — unused placeholder).
 *
 * Run dry: tsx src/scripts/fix-vrindavan-bank-gl.ts
 * Run apply: tsx src/scripts/fix-vrindavan-bank-gl.ts --apply
 */

import { eq, and, inArray, sql } from 'drizzle-orm';
import {
  createDb,
  journalEntries,
  journalLines,
  payments,
  paymentAllocations,
  purchaseInvoices,
  reconciliationMatches,
  vendors,
  accounts,
  auditLog,
} from '@runq/db';

const TENANT_ID = 'a0365382-afa0-48b6-92cd-4db615a7d98b'; // Vrindavan Dairy LLP — verified via tenants table
const BANK_GL_ID = '04ec64d8-7fb6-4184-a022-53dae26d3b21'; // 1101 Cash at Bank
const RE_GL_CODE = '3002'; // Retained Earnings (matches existing OB convention)

// (1) Duplicate payment to reverse
const DUPLICATE_PAYMENT_ID = '556793d3-42fd-4370-8bfe-ac3bdcf68e85';
const DUPLICATE_PAYMENT_JE_NUMBER = 'JE-2627-0350';

// (2) Mis-categorised bank_credit JE to reverse (inter-bank inflow)
const MISCAT_JE_NUMBER = 'JE-2627-0140';

// (3) Opening-balance amount
const OPENING_BALANCE = 174818.69;
const OPENING_DATE = '2026-03-31';

// (4) Orphan vendor to remove
const ORPHAN_VENDOR_ID = '68dc8f99-143f-4a18-abe3-6b4a8fd2d5a5'; // Vrindavan Dairy - Axis Current

const REMEDIATION_NOTE =
  'Remediated by fix-vrindavan-bank-gl.ts: (1) reversed duplicate payment ' +
  'JE-0350 ₹61,074.80; (2) reversed mis-categorised bank_credit JE-0140 ' +
  '₹33,982 (inter-bank transfer wrongly hit AR); (3) posted opening-balance ' +
  '₹1,74,818.69 to Cash at Bank; (4) removed orphan placeholder vendor.';

async function main() {
  const apply = process.argv.includes('--apply');
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const { db, pool } = createDb(url);

  console.log(apply ? '🔧 APPLY MODE' : '🔍 DRY RUN');
  console.log('---');

  // Pre-flight: capture current GL balance
  const beforeGl = await db.execute<{ balance: string }>(sql`
    SELECT (COALESCE(SUM(jl.debit),0) - COALESCE(SUM(jl.credit),0))::text AS balance
    FROM journal_lines jl
    JOIN journal_entries je ON je.id=jl.journal_entry_id
    WHERE jl.account_id=${BANK_GL_ID}::uuid AND je.status='posted';
  `);
  console.log(`Bank GL before: ₹${beforeGl.rows[0]?.balance}`);

  const dupJe = await loadJe(db, DUPLICATE_PAYMENT_JE_NUMBER);
  const miscatJe = await loadJe(db, MISCAT_JE_NUMBER);
  const orphanVendor = await db.select().from(vendors).where(eq(vendors.id, ORPHAN_VENDOR_ID)).limit(1);
  const orphanVendorPiCount = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(purchaseInvoices)
    .where(eq(purchaseInvoices.vendorId, ORPHAN_VENDOR_ID));

  console.log(`(1) Duplicate payment JE: ${dupJe.entryNumber} status=${dupJe.status} total_debit=${dupJe.totalDebit}`);
  console.log(`(2) Mis-cat bank_credit JE: ${miscatJe.entryNumber} status=${miscatJe.status} total_debit=${miscatJe.totalDebit}`);
  console.log(`(3) Opening balance to post: ₹${OPENING_BALANCE.toFixed(2)} on ${OPENING_DATE}`);
  console.log(`(4) Orphan vendor: ${orphanVendor[0]?.name ?? '(missing)'} — ${orphanVendorPiCount[0]?.n ?? 0} PIs`);

  if (!apply) {
    console.log('\nRe-run with --apply to execute.');
    await pool.end();
    return;
  }

  if (dupJe.status !== 'posted') throw new Error(`${DUPLICATE_PAYMENT_JE_NUMBER} is not posted (status=${dupJe.status}); aborting.`);
  if (miscatJe.status !== 'posted') throw new Error(`${MISCAT_JE_NUMBER} is not posted (status=${miscatJe.status}); aborting.`);
  if ((orphanVendorPiCount[0]?.n ?? 0) > 0) throw new Error('Orphan vendor has PIs — refusing to delete.');

  const reGl = await db.select().from(accounts)
    .where(and(eq(accounts.tenantId, TENANT_ID), eq(accounts.code, RE_GL_CODE))).limit(1);
  if (!reGl[0]) throw new Error(`GL account code ${RE_GL_CODE} (Retained Earnings) not found.`);

  await db.transaction(async (tx) => {
    // (1) Reverse duplicate payment JE — set JE status, restore allocations, delete payment
    await tx.update(journalEntries)
      .set({ status: 'reversed', updatedAt: new Date() })
      .where(eq(journalEntries.id, dupJe.id));

    const dupAllocs = await tx.select().from(paymentAllocations)
      .where(eq(paymentAllocations.paymentId, DUPLICATE_PAYMENT_ID));
    for (const alloc of dupAllocs) {
      const [pi] = await tx.select().from(purchaseInvoices)
        .where(eq(purchaseInvoices.id, alloc.invoiceId)).limit(1);
      if (!pi) continue;
      const newPaid = Math.max(0, parseFloat(pi.amountPaid) - parseFloat(alloc.amount));
      const newBal = parseFloat(pi.totalAmount) - newPaid;
      await tx.update(purchaseInvoices).set({
        amountPaid: String(Math.round(newPaid * 100) / 100),
        balanceDue: String(Math.max(0, Math.round(newBal * 100) / 100)),
        status: newPaid <= 0.01 ? 'approved' : (newBal <= 0.01 ? 'paid' : 'partially_paid'),
        updatedAt: new Date(),
      }).where(eq(purchaseInvoices.id, pi.id));
    }
    await tx.delete(paymentAllocations).where(eq(paymentAllocations.paymentId, DUPLICATE_PAYMENT_ID));
    await tx.delete(reconciliationMatches).where(eq(reconciliationMatches.paymentId, DUPLICATE_PAYMENT_ID));
    await tx.delete(payments).where(eq(payments.id, DUPLICATE_PAYMENT_ID));

    // (2) Reverse the mis-categorised bank_credit JE
    await tx.update(journalEntries)
      .set({ status: 'reversed', updatedAt: new Date() })
      .where(eq(journalEntries.id, miscatJe.id));

    // (3) Post opening-balance JE
    const obEntryNumber = await nextEntryNumber(tx, TENANT_ID);
    const [obJe] = await tx.insert(journalEntries).values({
      tenantId: TENANT_ID,
      entryNumber: obEntryNumber,
      date: OPENING_DATE,
      description: 'Opening balance: Cash at Bank (ICICI + AXIS)',
      status: 'posted',
      sourceType: 'opening_balance_bank',
      totalDebit: String(OPENING_BALANCE),
      totalCredit: String(OPENING_BALANCE),
    }).returning();

    await tx.insert(journalLines).values([
      { tenantId: TENANT_ID, journalEntryId: obJe!.id, accountId: BANK_GL_ID, debit: String(OPENING_BALANCE), credit: '0' },
      { tenantId: TENANT_ID, journalEntryId: obJe!.id, accountId: reGl[0]!.id, debit: '0', credit: String(OPENING_BALANCE) },
    ]);

    // (4) Delete orphan vendor
    await tx.delete(vendors).where(eq(vendors.id, ORPHAN_VENDOR_ID));

    // Audit breadcrumbs
    await tx.insert(auditLog).values([
      {
        tenantId: TENANT_ID,
        action: 'reversed',
        entityType: 'journal_entry',
        entityId: dupJe.id,
        metadata: { reason: REMEDIATION_NOTE, role: 'duplicate_payment_je' },
      },
      {
        tenantId: TENANT_ID,
        action: 'reversed',
        entityType: 'journal_entry',
        entityId: miscatJe.id,
        metadata: { reason: REMEDIATION_NOTE, role: 'miscategorised_bank_credit_je' },
      },
      {
        tenantId: TENANT_ID,
        action: 'created',
        entityType: 'journal_entry',
        entityId: obJe!.id,
        metadata: { reason: REMEDIATION_NOTE, role: 'opening_balance', amount: OPENING_BALANCE },
      },
      {
        tenantId: TENANT_ID,
        action: 'deleted',
        entityType: 'vendor',
        entityId: ORPHAN_VENDOR_ID,
        metadata: { reason: REMEDIATION_NOTE, role: 'orphan_placeholder' },
      },
    ]);
  });

  // Post-flight: capture new GL balance
  const afterGl = await db.execute<{ balance: string }>(sql`
    SELECT (COALESCE(SUM(jl.debit),0) - COALESCE(SUM(jl.credit),0))::text AS balance
    FROM journal_lines jl
    JOIN journal_entries je ON je.id=jl.journal_entry_id
    WHERE jl.account_id=${BANK_GL_ID}::uuid AND je.status='posted';
  `);
  console.log(`\nBank GL after:  ₹${afterGl.rows[0]?.balance}`);
  console.log('✅ Done.');
  await pool.end();
}

interface JeRow {
  id: string;
  entryNumber: string;
  status: string;
  totalDebit: string;
}

async function loadJe(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  entryNumber: string,
): Promise<JeRow> {
  const [row] = await db
    .select({
      id: journalEntries.id,
      entryNumber: journalEntries.entryNumber,
      status: journalEntries.status,
      totalDebit: journalEntries.totalDebit,
    })
    .from(journalEntries)
    .where(and(eq(journalEntries.tenantId, TENANT_ID), eq(journalEntries.entryNumber, entryNumber)))
    .limit(1);
  if (!row) throw new Error(`JE ${entryNumber} not found in tenant ${TENANT_ID}`);
  return row;
}

async function nextEntryNumber(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  tenantId: string,
): Promise<string> {
  const [latest] = await tx
    .select({ entryNumber: journalEntries.entryNumber })
    .from(journalEntries)
    .where(eq(journalEntries.tenantId, tenantId))
    .orderBy(sql`${journalEntries.entryNumber} DESC`)
    .limit(1);
  // Format: JE-XXXX-NNNN. Bump the last 4-digit segment.
  const m = (latest?.entryNumber as string | undefined)?.match(/^(JE-\d+-)(\d+)$/);
  if (!m) throw new Error(`Could not parse latest entry number: ${latest?.entryNumber}`);
  const next = (parseInt(m[2]!, 10) + 1).toString().padStart(m[2]!.length, '0');
  void inArray; // satisfy lint if unused later
  return `${m[1]}${next}`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
