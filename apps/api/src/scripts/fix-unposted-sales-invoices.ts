/**
 * Bring sales invoices into the GL.
 *
 *  1. Invoices with no sales_invoice JE (77 platform invoices May–Jul 2026,
 *     bulk-created as already 'paid', plus two stragglers) get posted.
 *  2. Platform invoices were paid from the customer wallet — the bank credits
 *     sit in 2102 Advance from Customers. Settle them as April's were: a wallet
 *     receipt + allocation, Dr 2102 / Cr 1103.
 *  3. Sales JEs that credited the whole total (GST included) to 4001 are
 *     re-posted with output GST on 2103/2105/2106.
 *
 * Run dry:   tsx --env-file=../../.env src/scripts/fix-unposted-sales-invoices.ts
 * Run apply: tsx --env-file=../../.env src/scripts/fix-unposted-sales-invoices.ts --apply
 */

import { sql } from 'drizzle-orm';
import { createDb, paymentReceipts, receiptAllocations } from '@runq/db';
import type { Db } from '@runq/db';
import { GLService } from '../modules/gl/gl.service';

const TENANT_ID = 'a0365382-afa0-48b6-92cd-4db615a7d98b';
const WALLET_NOTE = 'Paid from customer wallet';

interface InvoiceRow {
  id: string; invoiceNumber: string; date: string; total: number;
  customerId: string; customerName: string; walletCustomer: boolean; allocated: number;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const { db, pool } = createDb(url);
  console.log(apply ? '🔧 APPLY MODE' : '🔍 DRY RUN');

  const unposted = await loadUnposted(db);
  const toSettle = unposted.filter((i) => i.walletCustomer && i.allocated === 0);
  console.log(`${unposted.length} unposted invoices (₹${sum(unposted)}), ${toSettle.length} to settle from wallet (₹${sum(toSettle)})`);
  const gstLess = await loadGstLessPostings(db);
  console.log(`${gstLess.length} posted invoices with GST inside revenue (₹${sum(gstLess)} total)`);
  if (!apply) {
    await pool.end();
    return;
  }

  for (const inv of unposted) {
    await db.transaction(async (tx) => {
      const gl = new GLService(tx as unknown as Db, TENANT_ID);
      await gl.postSalesInvoice({ id: inv.id, date: inv.date, totalAmount: inv.total, customerName: inv.customerName });
      if (toSettle.includes(inv)) await settleFromWallet(tx as unknown as Db, gl, inv);
    });
  }
  for (const inv of gstLess) {
    await db.transaction(async (tx) => {
      const gl = new GLService(tx as unknown as Db, TENANT_ID);
      await gl.deletePostingsFor('sales_invoice', inv.id);
      await gl.postSalesInvoice({ id: inv.id, date: inv.date, totalAmount: inv.total, customerName: inv.customerName });
    });
  }
  console.log('✅ applied');
  await pool.end();
}

async function settleFromWallet(tx: Db, gl: GLService, inv: InvoiceRow): Promise<void> {
  const [receipt] = await tx.insert(paymentReceipts).values({
    tenantId: TENANT_ID, customerId: inv.customerId, receiptDate: inv.date,
    amount: String(inv.total), paymentMethod: 'bank_transfer', notes: WALLET_NOTE,
  }).returning({ id: paymentReceipts.id });
  await tx.insert(receiptAllocations).values({
    tenantId: TENANT_ID, receiptId: receipt!.id, invoiceId: inv.id, amount: String(inv.total),
  });
  await gl.postWalletReceipt({ id: receipt!.id, date: inv.date, amount: inv.total, customerName: inv.customerName });
}

/** Sent/paid invoices with no sales JE. A wallet customer is one already settled via wallet receipts. */
async function loadUnposted(db: Db): Promise<InvoiceRow[]> {
  return rowsOf(await db.execute(sql`
    SELECT si.id, si.invoice_number, si.invoice_date::text AS date, si.total_amount AS total,
           c.id AS customer_id, c.name AS customer_name,
           EXISTS (SELECT 1 FROM payment_receipts pr WHERE pr.customer_id = c.id AND pr.notes = ${WALLET_NOTE}) AS wallet_customer,
           COALESCE((SELECT SUM(ra.amount) FROM receipt_allocations ra WHERE ra.invoice_id = si.id), 0) AS allocated
    FROM sales_invoices si JOIN customers c ON c.id = si.customer_id
    WHERE si.tenant_id = ${TENANT_ID} AND si.status NOT IN ('draft', 'cancelled')
      AND NOT EXISTS (SELECT 1 FROM journal_entries j WHERE j.source_type = 'sales_invoice' AND j.source_id = si.id)
    ORDER BY si.invoice_date
  `));
}

/** Posted invoices carrying GST whose JE has no output-tax line. */
async function loadGstLessPostings(db: Db): Promise<InvoiceRow[]> {
  return rowsOf(await db.execute(sql`
    SELECT si.id, si.invoice_number, si.invoice_date::text AS date, si.total_amount AS total,
           c.id AS customer_id, c.name AS customer_name, false AS wallet_customer, 0 AS allocated
    FROM sales_invoices si JOIN customers c ON c.id = si.customer_id
    JOIN journal_entries j ON j.source_type = 'sales_invoice' AND j.source_id = si.id
    WHERE si.tenant_id = ${TENANT_ID} AND si.cgst_amount + si.sgst_amount + si.igst_amount > 0
      AND NOT EXISTS (SELECT 1 FROM journal_lines jl JOIN accounts a ON a.id = jl.account_id
                      WHERE jl.journal_entry_id = j.id AND a.code IN ('2103', '2105', '2106'))
    ORDER BY si.invoice_date
  `));
}

function rowsOf(res: unknown): InvoiceRow[] {
  const rows = (res as { rows?: Record<string, string | boolean | null>[] }).rows ?? [];
  return rows.map((r) => ({
    id: r.id as string, invoiceNumber: r.invoice_number as string, date: r.date as string,
    total: parseFloat(r.total as string), customerId: r.customer_id as string,
    customerName: r.customer_name as string, walletCustomer: r.wallet_customer === true,
    allocated: parseFloat(String(r.allocated)),
  }));
}

function sum(rows: InvoiceRow[]): string {
  return rows.reduce((s, r) => s + r.total, 0).toFixed(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
