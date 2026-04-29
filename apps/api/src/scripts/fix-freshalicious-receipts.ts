/**
 * One-shot remediation for Freshalicious Super Bazar Pvt Ltd.
 *
 * Two issues:
 *  1. The first 2 bank credits (Apr-04, Apr-08) have duplicate JEs:
 *     a `bank_credit` JE (DR Cash / CR AR) created by categorize-posting
 *     and then a `receipt` JE (DR Cash / CR AR) created by the Apr-13
 *     backfill that turned them into receipts. AR over-credited by
 *     ₹30,853.63 across the two.
 *  2. The OB invoice OB-FSBP-719D-2526 (₹8,560.35) was created today,
 *     AFTER the auto-receipts ran. So the waterfall started at invoice
 *     260001 (Apr-01) and skipped the OB. We re-allocate so the OB
 *     gets paid first.
 *
 * Single transaction:
 *   1. Mark the 2 duplicate bank_credit JEs as `reversed`.
 *   2. For all 5 bank txns: reverse the receipt JE, delete the receipt
 *      + allocations, restore invoice balances, delete recon_match,
 *      reset bank txn fields. (Inline because the 2 Apr-13 receipts
 *      have notes "Backfill: auto-created…", so reverseFromBankTxn
 *      would skip them.)
 *   3. Retag all 5 to Freshalicious and run AutoReceiptService oldest-
 *      first. Now OB-FSBP-719D-2526 is the oldest open invoice and
 *      will absorb its ₹8,560.35 first.
 *   4. Write audit_log entries for the JE reversals and bank-txn
 *      breadcrumbs. (The new receipts get their own audit entries via
 *      AutoReceiptService.)
 *
 * Run dry: tsx src/scripts/fix-freshalicious-receipts.ts
 * Run apply: tsx src/scripts/fix-freshalicious-receipts.ts --apply
 */

import { eq, and, inArray } from 'drizzle-orm';
import {
  createDb,
  bankTransactions,
  bankAccounts,
  accounts,
  journalEntries,
  paymentReceipts,
  receiptAllocations,
  reconciliationMatches,
  salesInvoices,
  auditLog,
} from '@runq/db';
import { AutoReceiptService } from '../modules/banking/auto-receipt.service';

const TENANT_ID = 'a0365382-afa0-48b6-92cd-4db615a7d98b';
const FRESHALICIOUS = '719df45d-ebaf-4962-b12c-3d630eecf1c5';
const FRESHALICIOUS_NAME = 'Freshalicious Super Bazar Pvt Ltd';

const TXN_IDS = [
  '96e5ecc5-fc17-4914-a013-b1e884010527', // 2026-04-04 14,181.41 — has duplicate bank_credit JE
  'd4f369fb-0d52-428b-963b-f2f5f06c0780', // 2026-04-08 16,672.22 — has duplicate bank_credit JE
  'ee7c18b8-e074-4ab4-9c7b-288e7c1dc06f', // 2026-04-13 14,249.90
  'c7eecc59-d7a7-4016-a5e9-a8af5e0ce957', // 2026-04-16 18,687.84
  '54ffb2a9-2e41-438f-8e74-eef890980f18', // 2026-04-18 14,616.18
];

const REMEDIATION_NOTE =
  'Remediated by fix-freshalicious-receipts.ts on 2026-04-29. ' +
  'Duplicate bank_credit JEs on the first 2 txns over-credited AR by ' +
  '₹30,853.63; OB-FSBP-719D-2526 was created after the original waterfall ' +
  'and was missed. All 5 receipts re-created via AutoReceiptService oldest-first.';

async function main() {
  const apply = process.argv.includes('--apply');
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const { db, pool } = createDb(url);

  console.log(apply ? '🔧 APPLY MODE' : '🔍 DRY RUN');
  console.log('---');

  const txns = await db
    .select({
      id: bankTransactions.id,
      transactionDate: bankTransactions.transactionDate,
      amount: bankTransactions.amount,
      narration: bankTransactions.narration,
      reference: bankTransactions.reference,
      bankAccountId: bankTransactions.bankAccountId,
      journalEntryId: bankTransactions.journalEntryId,
    })
    .from(bankTransactions)
    .where(and(
      eq(bankTransactions.tenantId, TENANT_ID),
      inArray(bankTransactions.id, TXN_IDS),
    ));

  if (txns.length !== TXN_IDS.length) {
    console.error(`Expected ${TXN_IDS.length} txns, got ${txns.length}.`);
    process.exit(1);
  }
  txns.sort((a, b) => a.transactionDate.localeCompare(b.transactionDate));

  // Find duplicate bank_credit JEs
  const dupBankCreditJes = await db
    .select({ id: journalEntries.id, sourceId: journalEntries.sourceId, totalDebit: journalEntries.totalDebit })
    .from(journalEntries)
    .where(and(
      eq(journalEntries.tenantId, TENANT_ID),
      eq(journalEntries.sourceType, 'bank_credit'),
      eq(journalEntries.status, 'posted'),
      inArray(journalEntries.sourceId, TXN_IDS),
    ));

  // Find existing receipts via recon_matches
  const matches = await db
    .select({
      bankTxnId: reconciliationMatches.bankTransactionId,
      matchId: reconciliationMatches.id,
      receiptId: reconciliationMatches.receiptId,
    })
    .from(reconciliationMatches)
    .where(and(
      eq(reconciliationMatches.tenantId, TENANT_ID),
      inArray(reconciliationMatches.bankTransactionId, TXN_IDS),
    ));

  // Resolve bank GL code per bank account
  const bankGlByAccount = new Map<string, string>();
  for (const t of txns) {
    if (bankGlByAccount.has(t.bankAccountId)) continue;
    const [row] = await db
      .select({ code: accounts.code })
      .from(bankAccounts)
      .innerJoin(accounts, eq(bankAccounts.glAccountId, accounts.id))
      .where(and(eq(bankAccounts.id, t.bankAccountId), eq(bankAccounts.tenantId, TENANT_ID)))
      .limit(1);
    if (!row) throw new Error(`Bank GL missing for account ${t.bankAccountId}`);
    bankGlByAccount.set(t.bankAccountId, row.code);
  }

  console.log(`Bank txns: ${txns.length}`);
  console.log(`Duplicate bank_credit JEs to reverse: ${dupBankCreditJes.length}`);
  console.log(`Existing recon_matches: ${matches.length}`);

  if (!apply) {
    console.log('\nWould reverse bank_credit JEs:');
    for (const je of dupBankCreditJes) console.log(`  ${je.id}  ₹${je.totalDebit}  on bank txn ${je.sourceId}`);
    console.log('\nWould reverse + recreate receipts for:');
    for (const t of txns) console.log(`  ${t.transactionDate}  ₹${t.amount}`);
    console.log('\nRe-run with --apply to execute.');
    await pool.end();
    return;
  }

  // ─── Phase 1: reverse duplicate bank_credit JEs and tear down existing receipts ───
  await db.transaction(async (tx) => {
    if (dupBankCreditJes.length > 0) {
      await tx
        .update(journalEntries)
        .set({ status: 'reversed', updatedAt: new Date() })
        .where(and(
          eq(journalEntries.tenantId, TENANT_ID),
          inArray(journalEntries.id, dupBankCreditJes.map((j) => j.id)),
        ));
    }

    // Delete recon matches FIRST (before deleting receipts they reference)
    await tx
      .delete(reconciliationMatches)
      .where(and(
        eq(reconciliationMatches.tenantId, TENANT_ID),
        inArray(reconciliationMatches.bankTransactionId, TXN_IDS),
      ));

    // Tear down each receipt: restore invoice balances, reverse receipt JE, delete receipt
    for (const m of matches) {
      if (!m.receiptId) continue;
      const allocs = await tx
        .select()
        .from(receiptAllocations)
        .where(eq(receiptAllocations.receiptId, m.receiptId));

      for (const alloc of allocs) {
        const [inv] = await tx
          .select()
          .from(salesInvoices)
          .where(eq(salesInvoices.id, alloc.invoiceId))
          .limit(1);
        if (!inv) continue;
        const newRecv = Math.max(0, parseFloat(inv.amountReceived) - parseFloat(alloc.amount));
        const newBal = parseFloat(inv.balanceDue) + parseFloat(alloc.amount);
        await tx
          .update(salesInvoices)
          .set({
            amountReceived: String(newRecv),
            balanceDue: String(newBal),
            status: newRecv <= 0.01 ? 'sent' : 'partially_paid',
            updatedAt: new Date(),
          })
          .where(eq(salesInvoices.id, inv.id));
      }
      await tx.delete(receiptAllocations).where(eq(receiptAllocations.receiptId, m.receiptId));
      await tx
        .update(journalEntries)
        .set({ status: 'reversed', updatedAt: new Date() })
        .where(and(
          eq(journalEntries.tenantId, TENANT_ID),
          eq(journalEntries.sourceType, 'receipt'),
          eq(journalEntries.sourceId, m.receiptId),
        ));
      await tx.delete(paymentReceipts).where(eq(paymentReceipts.id, m.receiptId));
    }

    // Reset bank txns
    await tx
      .update(bankTransactions)
      .set({
        customerId: null,
        glAccountId: null,
        journalEntryId: null,
        reconStatus: 'unreconciled',
        updatedAt: new Date(),
      })
      .where(and(
        eq(bankTransactions.tenantId, TENANT_ID),
        inArray(bankTransactions.id, TXN_IDS),
      ));
  });
  console.log('✅ Phase 1: duplicate JEs reversed, old receipts torn down, txns reset.');

  // ─── Phase 2: re-run AutoReceiptService oldest-first ───
  const autoReceipt = new AutoReceiptService(db, TENANT_ID);
  for (const t of txns) {
    const bankGlAccountCode = bankGlByAccount.get(t.bankAccountId)!;

    await db
      .update(bankTransactions)
      .set({ customerId: FRESHALICIOUS, updatedAt: new Date() })
      .where(eq(bankTransactions.id, t.id));

    const result = await autoReceipt.createFromBankTxn({
      bankTransactionId: t.id,
      customerId: FRESHALICIOUS,
      customerName: FRESHALICIOUS_NAME,
      bankAccountId: t.bankAccountId,
      bankGlAccountCode,
      amount: parseFloat(t.amount),
      transactionDate: t.transactionDate,
      narration: t.narration,
      reference: t.reference,
    });

    console.log(
      `  ${t.transactionDate}  ₹${t.amount.padStart(10)}  →  ` +
        (result
          ? `receipt ${result.receiptId.slice(0, 8)}, ${result.allocations.length} allocs, ₹${result.unallocated} unallocated`
          : 'tagged-only'),
    );
  }

  // ─── Phase 3: audit-log breadcrumbs ───
  for (const je of dupBankCreditJes) {
    await db.insert(auditLog).values({
      tenantId: TENANT_ID,
      action: 'reversed',
      entityType: 'journal_entry',
      entityId: je.id,
      metadata: { reason: REMEDIATION_NOTE, bankTransactionId: je.sourceId, duplicateOf: 'receipt' },
    });
  }
  for (const txnId of TXN_IDS) {
    await db.insert(auditLog).values({
      tenantId: TENANT_ID,
      action: 'remediated',
      entityType: 'bank_transaction',
      entityId: txnId,
      metadata: { details: REMEDIATION_NOTE },
    });
  }

  console.log('\n✅ Phase 2 + 3 done.');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
