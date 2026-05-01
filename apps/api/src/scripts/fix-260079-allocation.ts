/**
 * One-shot remediation for sales invoice #260079 (Freshalicious).
 *
 * #260079 was in `draft` status when fix-freshalicious-receipts.ts ran the
 * AutoReceiptService waterfall on 2026-04-29. The waterfall filters out
 * drafts, so the Apr-16 receipt's leftover ₹4,704.77 went to #260086 + a
 * partial of #260087 instead of partially paying #260079. #260079 was later
 * marked `sent` on 2026-05-01.
 *
 * This script tears down the Apr-16 + Apr-18 receipts, restores their
 * allocated invoices, then re-runs AutoReceiptService oldest-first. With
 * #260079 now `sent`, the FIFO waterfall picks it up in order.
 *
 * Run dry: tsx src/scripts/fix-260079-allocation.ts
 * Run apply: tsx src/scripts/fix-260079-allocation.ts --apply
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

// Only the two receipts whose allocations got skewed by #260079 being draft.
// Earlier receipts (Apr-04, Apr-08, Apr-13) only touched invoices ≤ #260072
// which were sent at allocation time — those are correct, leave them alone.
const TXN_IDS = [
  'c7eecc59-d7a7-4016-a5e9-a8af5e0ce957', // 2026-04-16  ₹18,687.84
  '54ffb2a9-2e41-438f-8e74-eef890980f18', // 2026-04-18  ₹14,616.18
];

const REMEDIATION_NOTE =
  'Remediated by fix-260079-allocation.ts. Invoice #260079 (₹4,768.50) was ' +
  'in draft status when the original waterfall ran on 2026-04-29 and was ' +
  'silently skipped. After being marked sent on 2026-05-01, the Apr-16 and ' +
  'Apr-18 receipts were torn down and re-allocated FIFO.';

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

  console.log(`Bank txns to redo: ${txns.length}`);
  console.log(`Existing recon_matches: ${matches.length}`);
  for (const t of txns) console.log(`  ${t.transactionDate}  ₹${t.amount}`);

  if (!apply) {
    console.log('\nRe-run with --apply to execute.');
    await pool.end();
    return;
  }

  // ─── Phase 1: tear down the two receipts ───
  await db.transaction(async (tx) => {
    await tx
      .delete(reconciliationMatches)
      .where(and(
        eq(reconciliationMatches.tenantId, TENANT_ID),
        inArray(reconciliationMatches.bankTransactionId, TXN_IDS),
      ));

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

    await tx
      .update(bankTransactions)
      .set({
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
  console.log('✅ Phase 1: receipts torn down, invoice balances restored.');

  // ─── Phase 2: re-run AutoReceiptService oldest-first ───
  const autoReceipt = new AutoReceiptService(db, TENANT_ID);
  for (const t of txns) {
    const bankGlAccountCode = bankGlByAccount.get(t.bankAccountId)!;

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

  // ─── Phase 3: audit-log breadcrumb ───
  for (const txnId of TXN_IDS) {
    await db.insert(auditLog).values({
      tenantId: TENANT_ID,
      action: 'remediated',
      entityType: 'bank_transaction',
      entityId: txnId,
      metadata: { details: REMEDIATION_NOTE },
    });
  }

  console.log('\n✅ Done.');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
