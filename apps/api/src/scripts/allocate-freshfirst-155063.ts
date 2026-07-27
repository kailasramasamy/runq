/**
 * One-off: allocate the ₹1,55,063 FreshFirst NEFT credit against pending
 * invoices by running the real AutoReceiptService (same code path the app's
 * auto-reconcile uses), so the resulting receipt + allocations + GL are
 * identical to an app-created receipt.
 *
 * Usage: DATABASE_URL=... tsx src/scripts/allocate-freshfirst-155063.ts
 */
import { createDb, bankTransactions, bankAccounts, accounts } from '@runq/db';
import { eq, and } from 'drizzle-orm';
import { AutoReceiptService } from '../modules/banking/auto-receipt.service';

const TID = 'a0365382-afa0-48b6-92cd-4db615a7d98b';
const TXN = '081690d8-aa45-432d-8822-ed284c85f62d';
const CUSTOMER_NAME = 'Think FreshFirst Technologies Pvt Ltd';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL required');
  const { db, pool } = createDb(url);
  try {
    const [txn] = await db.select().from(bankTransactions)
      .where(and(eq(bankTransactions.id, TXN), eq(bankTransactions.tenantId, TID))).limit(1);
    if (!txn) throw new Error('txn not found');
    if (txn.reconStatus !== 'unreconciled') throw new Error(`txn already ${txn.reconStatus}`);
    if (!txn.customerId) throw new Error('txn has no customer assigned');

    const [ba] = await db.select({ glId: bankAccounts.glAccountId }).from(bankAccounts)
      .where(eq(bankAccounts.id, txn.bankAccountId)).limit(1);
    let bankGlCode = '1101';
    if (ba?.glId) {
      const [a] = await db.select({ code: accounts.code }).from(accounts)
        .where(eq(accounts.id, ba.glId)).limit(1);
      if (a?.code) bankGlCode = a.code;
    }

    const result = await new AutoReceiptService(db, TID).createFromBankTxn({
      bankTransactionId: txn.id,
      customerId: txn.customerId,
      customerName: CUSTOMER_NAME,
      bankAccountId: txn.bankAccountId,
      bankGlAccountCode: bankGlCode,
      amount: Number(txn.amount),
      transactionDate: txn.transactionDate,
      narration: txn.narration,
      reference: txn.reference,
    });

    if (!result) {
      console.log('createFromBankTxn returned null (linked to existing receipt or no invoices).');
    } else {
      console.log(`Receipt ${result.receiptId}`);
      console.log(`Allocated to ${result.allocations.length} invoices, unallocated ₹${result.unallocated}`);
      const paid = result.allocations.filter((a) => a.status === 'paid').length;
      const partial = result.allocations.filter((a) => a.status === 'partially_paid').length;
      console.log(`  ${paid} paid, ${partial} partially_paid`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
