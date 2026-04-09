/**
 * Phase 3 smoke test — exercises the full review + approve pipeline against
 * the dev DB. Run with:
 *   cd apps/api
 *   node --env-file=../../.env --import tsx src/scripts/po-approve-smoke.ts
 *
 * What it does:
 *   1. Picks the Vrindavan Milk Products tenant (must have customers + items)
 *   2. Creates a po_uploads row with text content
 *   3. Runs the parser
 *   4. Picks the first matched/unmatched draft
 *   5. Forces a customer pick + item pick on each line via PoDraftService
 *   6. Calls approve and verifies a sales_invoices row was created
 *   7. Verifies customer_sku_aliases got upserted
 *   8. Cleans up the test invoice + draft + upload
 */

import { eq, and, like } from 'drizzle-orm';
import {
  createDb,
  poUploads,
  poDrafts,
  poDraftLines,
  customerSkuAliases,
  salesInvoices,
  customers,
  items,
} from '@runq/db';
import { PoParserService } from '../modules/ar/po-parser.service';
import { PoDraftService } from '../modules/ar/po-draft.service';
import { getStorageProvider } from '../utils/storage';

const TENANT_NAME_LIKE = 'Vrindavan%';

const SAMPLE_TEXT_PO = `[09/04/26, 8:23 AM] Test Buyer: PO for tomorrow morning delivery
- 50 x Full Cream Milk 1L Pouch
- 25 kg Paneer Block
Delivery 7am
Thanks!`;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');

  const { db, pool } = createDb(url);

  // Find the test tenant
  const tenantRows = await pool.query<{ id: string; name: string }>(
    'SELECT id, name FROM tenants WHERE name LIKE $1 LIMIT 1',
    [TENANT_NAME_LIKE],
  );
  if (tenantRows.rows.length === 0) {
    console.error(`No tenant matching ${TENANT_NAME_LIKE}`);
    process.exit(1);
  }
  const tenantId = tenantRows.rows[0]!.id;
  console.log(`\nUsing tenant: ${tenantRows.rows[0]!.name}`);

  // Pick first available customer + item
  const [customer] = await db
    .select({ id: customers.id, name: customers.name })
    .from(customers)
    .where(and(eq(customers.tenantId, tenantId), eq(customers.isActive, true)))
    .limit(1);
  if (!customer) {
    console.error('No active customers');
    process.exit(1);
  }
  console.log(`Test customer: ${customer.name}`);

  const itemRows = await db
    .select({ id: items.id, name: items.name })
    .from(items)
    .where(and(eq(items.tenantId, tenantId), eq(items.isActive, true)))
    .limit(2);
  if (itemRows.length < 2) {
    console.error(`Need at least 2 items, have ${itemRows.length}`);
    process.exit(1);
  }
  console.log(`Test items: ${itemRows.map((i) => i.name).join(', ')}`);

  // Find a user for approvedBy (use the first user in this tenant)
  const userRow = await pool.query<{ id: string }>(
    'SELECT id FROM users WHERE tenant_id = $1 LIMIT 1',
    [tenantId],
  );
  if (userRow.rows.length === 0) {
    console.error('No user in tenant');
    process.exit(1);
  }
  const userId = userRow.rows[0]!.id;

  // 1. Create the upload row directly
  const ins = await pool.query<{ id: string }>(
    `INSERT INTO po_uploads (tenant_id, source, raw_text, file_hash, status)
     VALUES ($1, 'paste_text', $2, $3, 'pending')
     RETURNING id`,
    [tenantId, SAMPLE_TEXT_PO, `smoke-${Date.now()}`],
  );
  const uploadId = ins.rows[0]!.id;
  console.log(`\nCreated po_uploads: ${uploadId}`);

  // 2. Run the parser
  const parser = new PoParserService(db, tenantId, getStorageProvider());
  console.log('Running parser...');
  const t0 = Date.now();
  await parser.parse(uploadId);
  console.log(`Parser finished in ${Date.now() - t0}ms`);

  // 3. Inspect the parsed draft
  const draftRows = await db
    .select()
    .from(poDrafts)
    .where(and(eq(poDrafts.poUploadId, uploadId), eq(poDrafts.tenantId, tenantId)))
    .limit(1);
  if (draftRows.length === 0) throw new Error('Parser did not create a draft');
  const draft = draftRows[0]!;
  console.log(`Draft created: ${draft.id}, status=${draft.reviewStatus}`);

  const lines = await db
    .select()
    .from(poDraftLines)
    .where(and(eq(poDraftLines.poDraftId, draft.id), eq(poDraftLines.tenantId, tenantId)));
  console.log(`Draft has ${lines.length} lines`);

  // 4. Force-pick the customer + items via PoDraftService
  const draftService = new PoDraftService(db, tenantId);
  console.log('\nPicking customer...');
  await draftService.update(uploadId, { customerId: customer.id });

  console.log('Picking items + setting rates per line...');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const targetItem = itemRows[i % itemRows.length]!;
    await draftService.updateLine(uploadId, line.id, {
      matchedItemId: targetItem.id,
      // Force a known rate so the approve has valid data even if no price list exists
      rate: 50.0,
      recordAlias: true,
    });
    console.log(
      `  Line ${i + 1}: "${line.rawDescription}" → ${targetItem.name} @ ₹50`,
    );
  }

  // 5. Verify the alias was recorded
  const aliases = await db
    .select()
    .from(customerSkuAliases)
    .where(
      and(
        eq(customerSkuAliases.tenantId, tenantId),
        eq(customerSkuAliases.customerId, customer.id),
      ),
    );
  console.log(
    `\nCustomer aliases recorded: ${aliases.length} (${aliases.map((a) => a.aliasText).join(', ')})`,
  );

  // 6. Approve!
  console.log('\nApproving draft...');
  const result = await draftService.approve(uploadId, userId);
  console.log(`Approve returned: invoice ${result.invoiceNumber} (${result.invoiceId})`);

  // 7. Verify the invoice exists
  const [invoice] = await db
    .select()
    .from(salesInvoices)
    .where(and(eq(salesInvoices.id, result.invoiceId), eq(salesInvoices.tenantId, tenantId)))
    .limit(1);
  if (!invoice) throw new Error('Invoice was not created');
  console.log('\n── sales_invoices ───────────────────────────');
  console.log({
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    customerId: invoice.customerId,
    invoiceDate: invoice.invoiceDate,
    dueDate: invoice.dueDate,
    subtotal: invoice.subtotal,
    taxAmount: invoice.taxAmount,
    totalAmount: invoice.totalAmount,
  });

  // Verify draft is now linked to the invoice
  const [updatedDraft] = await db
    .select()
    .from(poDrafts)
    .where(and(eq(poDrafts.id, draft.id), eq(poDrafts.tenantId, tenantId)))
    .limit(1);
  console.log('\n── po_drafts (after approve) ───────────────');
  console.log({
    reviewStatus: updatedDraft?.reviewStatus,
    approvedInvoiceId: updatedDraft?.approvedInvoiceId,
    approvedAt: updatedDraft?.approvedAt,
  });

  // 8. Cleanup
  console.log('\nCleaning up...');
  // Delete the invoice (lines cascade) — also clean up GL postings if any
  await pool.query('DELETE FROM journal_lines WHERE journal_entry_id IN (SELECT id FROM journal_entries WHERE source_id = $1)', [result.invoiceId]);
  await pool.query('DELETE FROM journal_entries WHERE source_id = $1', [result.invoiceId]);
  await pool.query('DELETE FROM sales_invoice_items WHERE invoice_id = $1', [result.invoiceId]);
  await pool.query('UPDATE po_drafts SET approved_invoice_id = NULL WHERE id = $1', [draft.id]);
  await pool.query('DELETE FROM sales_invoices WHERE id = $1', [result.invoiceId]);
  // Delete aliases we created
  for (const a of aliases) {
    await pool.query('DELETE FROM customer_sku_aliases WHERE id = $1', [a.id]);
  }
  // Delete upload (cascades to draft + lines)
  await pool.query('DELETE FROM po_uploads WHERE id = $1', [uploadId]);
  console.log('Cleanup done.');

  await pool.end();
}

main().catch((err) => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});
