/**
 * One-shot backfill: create missing JEs for sent invoices that have no GL posting.
 * Idempotent — isAlreadyPosted prevents duplicates.
 *
 *   cd apps/api
 *   node --env-file=../../.env --import tsx src/scripts/backfill-invoice-jes.ts
 */

import { eq, and, sql } from 'drizzle-orm';
import { createDb, salesInvoices, customers } from '@runq/db';
import { GLService } from '../modules/gl/gl.service';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const { db, pool } = createDb(url);

  // Find all non-draft/cancelled invoices without a JE
  const rows = await db.select({
    id: salesInvoices.id,
    tenantId: salesInvoices.tenantId,
    invoiceNumber: salesInvoices.invoiceNumber,
    invoiceDate: salesInvoices.invoiceDate,
    totalAmount: salesInvoices.totalAmount,
    customerId: salesInvoices.customerId,
  })
    .from(salesInvoices)
    .where(and(
      sql`${salesInvoices.status} NOT IN ('cancelled', 'draft')`,
      sql`NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.source_type = 'sales_invoice' AND je.source_id = ${salesInvoices.id})`,
    ));

  console.log(`Found ${rows.length} invoices without JEs`);

  let posted = 0;
  let skipped = 0;

  for (const row of rows) {
    const [cust] = await db.select({ name: customers.name }).from(customers)
      .where(eq(customers.id, row.customerId)).limit(1);

    const gl = new GLService(db, row.tenantId);
    try {
      await gl.postSalesInvoice({
        totalAmount: parseFloat(row.totalAmount),
        date: row.invoiceDate,
        id: row.id,
        customerName: cust?.name ?? 'Unknown',
      });
      posted++;
      console.log(`  OK  ${row.invoiceNumber} — ${cust?.name} — ₹${row.totalAmount}`);
    } catch (err) {
      skipped++;
      console.log(`  SKIP ${row.invoiceNumber} — ${(err as Error).message}`);
    }
  }

  console.log(`\nDone: ${posted} JEs created, ${skipped} skipped`);
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
