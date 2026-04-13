/**
 * One-shot backfill: create payment receipts for reconciled bank credit
 * transactions that have a customerId but no linked receipt.
 * Uses FIFO waterfall allocation across unpaid invoices.
 * Idempotent — checks for existing reconciliation_matches with a receiptId.
 *
 *   cd apps/api
 *   node --env-file=../../.env --import tsx src/scripts/backfill-customer-receipts.ts
 */

import { eq, and, sql, isNotNull } from 'drizzle-orm';
import {
  createDb,
  bankTransactions,
  bankAccounts,
  accounts,
  customers,
  salesInvoices,
  paymentReceipts,
  receiptAllocations,
  reconciliationMatches,
} from '@runq/db';
import { GLService } from '../modules/gl/gl.service';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const { db, pool } = createDb(url);

  // Find reconciled credit transactions with customerId but no receipt linked
  const rows = await db
    .select({
      id: bankTransactions.id,
      tenantId: bankTransactions.tenantId,
      bankAccountId: bankTransactions.bankAccountId,
      customerId: bankTransactions.customerId,
      transactionDate: bankTransactions.transactionDate,
      amount: bankTransactions.amount,
      reference: bankTransactions.reference,
      narration: bankTransactions.narration,
    })
    .from(bankTransactions)
    .where(and(
      eq(bankTransactions.type, 'credit'),
      isNotNull(bankTransactions.customerId),
      sql`${bankTransactions.reconStatus} IN ('matched', 'manually_matched')`,
      sql`NOT EXISTS (
        SELECT 1 FROM reconciliation_matches rm
        WHERE rm.bank_transaction_id = ${bankTransactions.id}
          AND rm.receipt_id IS NOT NULL
      )`,
    ));

  console.log(`Found ${rows.length} reconciled customer credits without receipts\n`);

  let created = 0;
  let skipped = 0;

  for (const row of rows) {
    const [cust] = await db.select({ name: customers.name }).from(customers)
      .where(eq(customers.id, row.customerId!)).limit(1);
    if (!cust) {
      console.log(`  SKIP ${row.id} — customer not found`);
      skipped++;
      continue;
    }

    const amount = parseFloat(row.amount);

    // Find unpaid invoices for this customer (oldest first)
    const invoices = await db
      .select({ id: salesInvoices.id, num: salesInvoices.invoiceNumber, balanceDue: salesInvoices.balanceDue })
      .from(salesInvoices)
      .where(and(
        eq(salesInvoices.tenantId, row.tenantId),
        eq(salesInvoices.customerId, row.customerId!),
        sql`${salesInvoices.balanceDue}::numeric > 0`,
        sql`${salesInvoices.status} NOT IN ('cancelled', 'draft')`,
      ))
      .orderBy(salesInvoices.invoiceDate);

    if (invoices.length === 0) {
      console.log(`  SKIP ${row.id} — ${cust.name} — no unpaid invoices`);
      skipped++;
      continue;
    }

    // Create receipt + waterfall allocations in a transaction
    const receiptId = await db.transaction(async (tx) => {
      const [receipt] = await tx.insert(paymentReceipts).values({
        tenantId: row.tenantId,
        customerId: row.customerId!,
        bankAccountId: row.bankAccountId,
        receiptDate: row.transactionDate,
        amount: String(amount),
        paymentMethod: 'bank_transfer',
        referenceNumber: row.reference,
        notes: `Backfill: auto-created from reconciled bank txn ${row.reference ?? row.id}`,
      }).returning();

      let remaining = amount;
      const allocs: string[] = [];

      for (const inv of invoices) {
        if (remaining <= 0.01) break;
        const balance = parseFloat(inv.balanceDue);
        const allocAmount = Math.min(remaining, balance);
        const newBalance = balance - allocAmount;
        const newStatus = newBalance <= 0.01 ? 'paid' : 'partially_paid';

        await tx.insert(receiptAllocations).values({
          tenantId: row.tenantId,
          receiptId: receipt!.id,
          invoiceId: inv.id,
          amount: String(Math.round(allocAmount * 100) / 100),
        });

        await tx.update(salesInvoices).set({
          amountReceived: sql`${salesInvoices.amountReceived}::numeric + ${allocAmount}`,
          balanceDue: String(Math.max(0, Math.round(newBalance * 100) / 100)),
          status: newStatus,
          updatedAt: new Date(),
        }).where(eq(salesInvoices.id, inv.id));

        allocs.push(`${inv.num}=${newStatus}`);
        remaining -= allocAmount;
      }

      // Link receipt to existing reconciliation match (or create new one)
      const [existingMatch] = await tx.select({ id: reconciliationMatches.id })
        .from(reconciliationMatches)
        .where(and(
          eq(reconciliationMatches.bankTransactionId, row.id),
          eq(reconciliationMatches.tenantId, row.tenantId),
        ))
        .limit(1);

      if (existingMatch) {
        await tx.update(reconciliationMatches)
          .set({ receiptId: receipt!.id })
          .where(eq(reconciliationMatches.id, existingMatch.id));
      } else {
        await tx.insert(reconciliationMatches).values({
          tenantId: row.tenantId,
          bankTransactionId: row.id,
          receiptId: receipt!.id,
          matchType: 'auto_amount_date',
        });
      }

      console.log(`  OK  ${cust.name} — ₹${amount.toLocaleString('en-IN')} → [${allocs.join(', ')}]${remaining > 0.01 ? ` (₹${remaining.toLocaleString('en-IN')} unallocated)` : ''}`);
      return receipt!.id;
    });

    // Post receipt JE
    const gl = new GLService(db, row.tenantId);
    await gl.postReceipt({
      amount,
      date: row.transactionDate,
      id: receiptId,
      customerName: cust.name,
    });

    created++;
  }

  console.log(`\nDone: ${created} receipts created, ${skipped} skipped`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
