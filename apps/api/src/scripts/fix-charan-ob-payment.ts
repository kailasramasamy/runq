/**
 * One-shot remediation for Delivery Boy - Charan's bank debit that
 * bypassed auto-bill-pay. Bank txn 57559f58 (₹7,500, 2026-04-10) was
 * tagged to Charan but went through categorize-direct-posting instead
 * of auto-bill-pay. JE 54996908 posted DR Salary 5201 / CR Cash 1101 —
 * recognizing salary expense in current FY even though the OB bill
 * (which was already in books as DR Retained Earnings / CR AP via
 * opening_balance_ap JE) represents a prior-FY accrual. Net effect:
 * AP overstated by ₹7,500 and Salary double-counted.
 *
 * Fix:
 *   1. Reverse the bank_debit JE.
 *   2. Reset bank txn (clear journal_entry_id, recon_status='unreconciled',
 *      keep vendor_id).
 *   3. Run AutoBillPayService.createFromBankTxn — `findExistingBill` will
 *      match the OB by (vendor + amount + date<=30d), then
 *      `createPaymentForBill` allocates and posts DR AP / CR Cash via
 *      gl.postPayment + writes its own audit_log entry.
 *   4. Add audit_log breadcrumbs for the reversed JE and the bank txn.
 *
 * Run dry: tsx src/scripts/fix-charan-ob-payment.ts
 * Run apply: tsx src/scripts/fix-charan-ob-payment.ts --apply
 */

import { eq, and } from 'drizzle-orm';
import {
  createDb,
  bankTransactions,
  bankAccounts,
  accounts,
  journalEntries,
  vendors,
  auditLog,
} from '@runq/db';
import { AutoBillPayService } from '../modules/banking/auto-bill-pay.service';

const TENANT_ID = 'a0365382-afa0-48b6-92cd-4db615a7d98b';
const BANK_TXN_ID = '57559f58-7582-4968-bf24-a69de02c2aee';
const BAD_JE_ID = '54996908-e43c-42fb-84b2-6af6f3cd2218';
const VENDOR_ID = '192a2afe-b7ec-40c3-9e3e-72bdd894d8b8';

const REMEDIATION_NOTE =
  'Reversed by fix-charan-ob-payment.ts on 2026-04-29. Bank debit ' +
  'bypassed auto-bill-pay and posted DR Salary / CR Cash, double-' +
  'recognizing salary expense (already in prior FY via opening_balance_ap ' +
  'JE for OB-DB-C-192A-2526). Re-routed through AutoBillPayService so it ' +
  'allocates against the OB bill and posts DR AP / CR Cash instead.';

async function main() {
  const apply = process.argv.includes('--apply');
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const { db, pool } = createDb(url);

  console.log(apply ? '🔧 APPLY MODE' : '🔍 DRY RUN');

  const [txn] = await db
    .select({
      id: bankTransactions.id,
      transactionDate: bankTransactions.transactionDate,
      amount: bankTransactions.amount,
      narration: bankTransactions.narration,
      reference: bankTransactions.reference,
      bankAccountId: bankTransactions.bankAccountId,
    })
    .from(bankTransactions)
    .where(and(eq(bankTransactions.id, BANK_TXN_ID), eq(bankTransactions.tenantId, TENANT_ID)))
    .limit(1);
  if (!txn) throw new Error('Bank txn not found');

  const [vendor] = await db
    .select({ name: vendors.name, expenseAccountCode: vendors.expenseAccountCode })
    .from(vendors)
    .where(and(eq(vendors.id, VENDOR_ID), eq(vendors.tenantId, TENANT_ID)))
    .limit(1);
  if (!vendor) throw new Error('Vendor not found');
  if (!vendor.expenseAccountCode) throw new Error('Vendor has no expenseAccountCode');

  const [bankGl] = await db
    .select({ code: accounts.code })
    .from(bankAccounts)
    .innerJoin(accounts, eq(bankAccounts.glAccountId, accounts.id))
    .where(and(eq(bankAccounts.id, txn.bankAccountId), eq(bankAccounts.tenantId, TENANT_ID)))
    .limit(1);
  if (!bankGl) throw new Error('Bank GL not found');

  console.log(`\nWill reverse JE ${BAD_JE_ID} (DR Salary 5201 / CR Cash 1101 ₹${txn.amount})`);
  console.log(`Will reset bank txn ${BANK_TXN_ID} and re-run auto-bill-pay against OB-DB-C-192A-2526`);

  if (!apply) {
    console.log('\nRe-run with --apply to execute.');
    await pool.end();
    return;
  }

  // Phase 1: reverse bad JE + reset bank txn
  await db.transaction(async (tx) => {
    await tx
      .update(journalEntries)
      .set({ status: 'reversed', updatedAt: new Date() })
      .where(and(eq(journalEntries.id, BAD_JE_ID), eq(journalEntries.tenantId, TENANT_ID)));

    await tx
      .update(bankTransactions)
      .set({
        glAccountId: null,
        journalEntryId: null,
        reconStatus: 'unreconciled',
        updatedAt: new Date(),
      })
      .where(and(eq(bankTransactions.id, BANK_TXN_ID), eq(bankTransactions.tenantId, TENANT_ID)));
  });
  console.log('✅ Phase 1: bank_debit JE reversed, bank txn reset.');

  // Phase 2: run auto-bill-pay
  const autoBillPay = new AutoBillPayService(db, TENANT_ID);
  const result = await autoBillPay.createFromBankTxn({
    bankTransactionId: BANK_TXN_ID,
    vendorId: VENDOR_ID,
    vendorName: vendor.name,
    expenseAccountCode: vendor.expenseAccountCode,
    bankAccountId: txn.bankAccountId,
    bankGlAccountCode: bankGl.code,
    amount: parseFloat(txn.amount),
    transactionDate: txn.transactionDate,
    narration: txn.narration,
    reference: txn.reference,
  });

  if (result) {
    console.log(`✅ Phase 2: bill ${result.billId.slice(0, 8)}, payment ${result.paymentId.slice(0, 8)}`);
  } else {
    console.log('⚠️ Phase 2: auto-bill-pay returned null (linked to existing payment)');
  }

  // Phase 3: audit-log breadcrumbs
  await db.insert(auditLog).values({
    tenantId: TENANT_ID,
    action: 'reversed',
    entityType: 'journal_entry',
    entityId: BAD_JE_ID,
    metadata: { reason: REMEDIATION_NOTE, bankTransactionId: BANK_TXN_ID },
  });
  await db.insert(auditLog).values({
    tenantId: TENANT_ID,
    action: 'remediated',
    entityType: 'bank_transaction',
    entityId: BANK_TXN_ID,
    metadata: { details: REMEDIATION_NOTE, vendorId: VENDOR_ID, amount: txn.amount },
  });

  console.log('✅ Phase 3: audit entries written.');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
