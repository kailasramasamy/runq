/**
 * Re-allocate FIFO for customer receipts that paid newer invoices before
 * older ones, because older invoices were `draft` when the auto-receipt
 * waterfall ran.
 *
 * Receipt JEs (DR Bank / CR AR for the full amount) are invariant under
 * reshuffling allocations among one customer's invoices, so we don't touch
 * the receipt or its JE — just delete + re-insert receipt_allocations FIFO
 * and restore each invoice's amount_received / balance_due / status.
 *
 * Per customer, we redo ALL their receipts in chronological order so
 * overlapping receipts don't double-allocate.
 *
 * Run dry: tsx src/scripts/fix-fifo-allocations.ts
 * Run apply: tsx src/scripts/fix-fifo-allocations.ts --apply
 */

import { eq, and, inArray, sql } from 'drizzle-orm';
import {
  createDb,
  paymentReceipts,
  receiptAllocations,
  salesInvoices,
  customers,
  auditLog,
} from '@runq/db';

const TENANT_ID = 'a0365382-afa0-48b6-92cd-4db615a7d98b';

// Real-tenant customers with FIFO violations from the draft-skip pattern.
// Detected via the cross-customer scan; demo-tenant customers excluded.
const CUSTOMER_IDS = [
  '22a2b7da-2adf-484d-8496-962897132d30', // Think FreshFirst Technologies Pvt Ltd
];

const REMEDIATION_NOTE =
  'Re-allocated FIFO by fix-fifo-allocations.ts. Older invoices that were ' +
  'draft when the auto-receipt waterfall ran now absorb in chronological ' +
  'order; receipt JEs unchanged.';

interface ReceiptRow {
  id: string;
  receiptDate: string;
  amount: string;
}

interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  totalAmount: string;
  amountReceived: string;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const { db, pool } = createDb(url);

  console.log(apply ? '🔧 APPLY MODE' : '🔍 DRY RUN');
  console.log('---');

  for (const customerId of CUSTOMER_IDS) {
    const [c] = await db
      .select({ id: customers.id, name: customers.name })
      .from(customers)
      .where(and(eq(customers.tenantId, TENANT_ID), eq(customers.id, customerId)))
      .limit(1);
    if (!c) {
      console.error(`Customer ${customerId} not found in tenant ${TENANT_ID}`);
      continue;
    }
    await processCustomer(db, c.id, c.name, apply);
  }

  if (apply) {
    for (const customerId of CUSTOMER_IDS) {
      await db.insert(auditLog).values({
        tenantId: TENANT_ID,
        action: 'remediated',
        entityType: 'customer',
        entityId: customerId,
        metadata: { details: REMEDIATION_NOTE },
      });
    }
  }

  console.log(apply ? '\n✅ Done.' : '\nRe-run with --apply to execute.');
  await pool.end();
}

async function processCustomer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  customerId: string,
  customerName: string,
  apply: boolean,
): Promise<void> {
  console.log(`── ${customerName} ──`);

  const receipts: ReceiptRow[] = await db
    .select({
      id: paymentReceipts.id,
      receiptDate: paymentReceipts.receiptDate,
      amount: paymentReceipts.amount,
    })
    .from(paymentReceipts)
    .where(and(
      eq(paymentReceipts.tenantId, TENANT_ID),
      eq(paymentReceipts.customerId, customerId),
    ))
    .orderBy(paymentReceipts.receiptDate, paymentReceipts.createdAt);

  console.log(`  ${receipts.length} receipt(s) to redo`);

  if (!apply) {
    for (const r of receipts) {
      console.log(`    ${r.receiptDate}  ₹${r.amount}  (${r.id.slice(0, 8)})`);
    }
    return;
  }

  await db.transaction(async (tx: typeof db) => {
    // Phase 1: tear down ALL allocations for this customer's receipts and
    // restore every invoice that any of them touched.
    const allAllocs = await tx
      .select()
      .from(receiptAllocations)
      .where(and(
        eq(receiptAllocations.tenantId, TENANT_ID),
        inArray(receiptAllocations.receiptId, receipts.map((r) => r.id)),
      ));

    const touchedInvoiceIds = [
      ...new Set(allAllocs.map((a: typeof receiptAllocations.$inferSelect) => a.invoiceId)),
    ] as string[];
    for (const invId of touchedInvoiceIds) {
      const invAllocs = allAllocs.filter(
        (a: typeof receiptAllocations.$inferSelect) => a.invoiceId === invId,
      );
      const totalAlloc = invAllocs.reduce(
        (s: number, a: typeof receiptAllocations.$inferSelect) => s + parseFloat(a.amount),
        0,
      );
      const [inv] = await tx
        .select()
        .from(salesInvoices)
        .where(eq(salesInvoices.id, invId))
        .limit(1);
      if (!inv) continue;
      const newRecv = Math.max(0, parseFloat(inv.amountReceived) - totalAlloc);
      const newBal = parseFloat(inv.totalAmount) - newRecv;
      await tx
        .update(salesInvoices)
        .set({
          amountReceived: String(Math.round(newRecv * 100) / 100),
          balanceDue: String(Math.max(0, Math.round(newBal * 100) / 100)),
          status: newRecv <= 0.01 ? 'sent' : newBal <= 0.01 ? 'paid' : 'partially_paid',
          updatedAt: new Date(),
        })
        .where(eq(salesInvoices.id, inv.id));
    }

    await tx
      .delete(receiptAllocations)
      .where(and(
        eq(receiptAllocations.tenantId, TENANT_ID),
        inArray(receiptAllocations.receiptId, receipts.map((r) => r.id)),
      ));

    // Phase 2: redo each receipt FIFO across the now-restored open invoices
    for (const receipt of receipts) {
      const openInvoices: InvoiceRow[] = await tx
        .select({
          id: salesInvoices.id,
          invoiceNumber: salesInvoices.invoiceNumber,
          totalAmount: salesInvoices.totalAmount,
          amountReceived: salesInvoices.amountReceived,
        })
        .from(salesInvoices)
        .where(and(
          eq(salesInvoices.tenantId, TENANT_ID),
          eq(salesInvoices.customerId, customerId),
          sql`${salesInvoices.balanceDue}::numeric > 0`,
          sql`${salesInvoices.status} NOT IN ('cancelled','draft')`,
        ))
        .orderBy(salesInvoices.invoiceDate, salesInvoices.invoiceNumber);

      let remaining = parseFloat(receipt.amount);
      const allocs: { invNum: string; amount: number }[] = [];

      for (const inv of openInvoices) {
        if (remaining <= 0.01) break;
        const balance = parseFloat(inv.totalAmount) - parseFloat(inv.amountReceived);
        if (balance <= 0.01) continue;
        const allocAmount = Math.round(Math.min(remaining, balance) * 100) / 100;
        const newRecv = parseFloat(inv.amountReceived) + allocAmount;
        const newBal = parseFloat(inv.totalAmount) - newRecv;
        const newStatus: 'paid' | 'partially_paid' = newBal <= 0.01 ? 'paid' : 'partially_paid';

        await tx.insert(receiptAllocations).values({
          tenantId: TENANT_ID,
          receiptId: receipt.id,
          invoiceId: inv.id,
          amount: String(allocAmount),
        });
        await tx
          .update(salesInvoices)
          .set({
            amountReceived: String(Math.round(newRecv * 100) / 100),
            balanceDue: String(Math.max(0, Math.round(newBal * 100) / 100)),
            status: newStatus,
            updatedAt: new Date(),
          })
          .where(eq(salesInvoices.id, inv.id));

        allocs.push({ invNum: inv.invoiceNumber, amount: allocAmount });
        remaining = Math.round((remaining - allocAmount) * 100) / 100;
      }

      console.log(
        `    ${receipt.receiptDate}  ₹${String(receipt.amount).padStart(10)}  →  ${allocs.length} allocs` +
          (remaining > 0.01 ? `, ₹${remaining.toFixed(2)} unallocated` : ''),
      );
    }
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
