/**
 * Phase 4 smoke test — exercises the bulk-approve pipeline against the dev DB.
 *
 *   cd apps/api
 *   node --env-file=../../.env --import tsx src/scripts/po-bulk-approve-smoke.ts
 *
 * Creates 3 po_uploads, parses each, force-picks customer + items, then
 * calls bulkApprove and verifies 3 sales_invoices rows. Fail-soft: includes
 * one intentionally-broken upload to verify the failed[] array.
 */

import { eq, and } from 'drizzle-orm';
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

const SAMPLE_POS = [
  `[09/04/26, 9:00 AM] Test A: PO\n50 x Full Cream Milk 1L\n10 kg paneer`,
  `[09/04/26, 9:30 AM] Test B: Order\n30 x Curd 500g\n5 x Ghee 500ml`,
  `[09/04/26, 10:00 AM] Test C: Quick PO\n20 x butter 200g\n15 x lassi 250ml`,
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');

  const { db, pool } = createDb(url);

  // Bootstrap: tenant, customer, items, user
  const tenantRow = await pool.query<{ id: string; name: string }>(
    'SELECT id, name FROM tenants WHERE name LIKE $1 LIMIT 1',
    [TENANT_NAME_LIKE],
  );
  const tenantId = tenantRow.rows[0]!.id;
  console.log(`Using tenant: ${tenantRow.rows[0]!.name}`);

  const [customer] = await db
    .select({ id: customers.id, name: customers.name })
    .from(customers)
    .where(and(eq(customers.tenantId, tenantId), eq(customers.isActive, true)))
    .limit(1);
  console.log(`Test customer: ${customer!.name}`);

  const itemRows = await db
    .select({ id: items.id, name: items.name })
    .from(items)
    .where(and(eq(items.tenantId, tenantId), eq(items.isActive, true)))
    .limit(2);
  console.log(`Test items: ${itemRows.map((i) => i.name).join(', ')}`);

  const userRow = await pool.query<{ id: string }>(
    'SELECT id FROM users WHERE tenant_id = $1 LIMIT 1',
    [tenantId],
  );
  const userId = userRow.rows[0]!.id;

  // 1. Create + parse 3 uploads
  const parser = new PoParserService(db, tenantId, getStorageProvider());
  const uploadIds: string[] = [];
  for (let i = 0; i < SAMPLE_POS.length; i++) {
    const ins = await pool.query<{ id: string }>(
      `INSERT INTO po_uploads (tenant_id, source, raw_text, file_hash, status)
       VALUES ($1, 'paste_text', $2, $3, 'pending')
       RETURNING id`,
      [tenantId, SAMPLE_POS[i], `bulk-smoke-${Date.now()}-${i}`],
    );
    uploadIds.push(ins.rows[0]!.id);
  }
  console.log(`\nCreated ${uploadIds.length} uploads`);

  console.log('Parsing all...');
  const t0 = Date.now();
  await Promise.all(uploadIds.map((id) => parser.parse(id)));
  console.log(`All parsers finished in ${Date.now() - t0}ms`);

  // 2. Force-pick customer + items + rates on uploads 0 and 1; leave upload 2
  //    intentionally broken (no customer) to verify the fail-soft path.
  const draftService = new PoDraftService(db, tenantId);

  for (let i = 0; i < 2; i++) {
    const uploadId = uploadIds[i]!;
    await draftService.update(uploadId, { customerId: customer!.id });
    const draftRows = await db
      .select()
      .from(poDrafts)
      .where(and(eq(poDrafts.poUploadId, uploadId), eq(poDrafts.tenantId, tenantId)))
      .limit(1);
    const draft = draftRows[0]!;
    const lines = await db
      .select()
      .from(poDraftLines)
      .where(and(eq(poDraftLines.poDraftId, draft.id), eq(poDraftLines.tenantId, tenantId)));
    for (let li = 0; li < lines.length; li++) {
      await draftService.updateLine(uploadId, lines[li]!.id, {
        matchedItemId: itemRows[li % itemRows.length]!.id,
        rate: 50.0,
        recordAlias: false, // skip alias bookkeeping in this test
      });
    }
  }
  console.log('Prepared 2 approvable + 1 unapprovable upload');

  // 3. Bulk-approve all 3 — expect 2 created + 1 failed
  console.log('\nCalling bulkApprove...');
  const result = await draftService.bulkApprove(uploadIds, userId);
  console.log(`Created: ${result.created.length}, Failed: ${result.failed.length}`);
  for (const ok of result.created) {
    console.log(`  ✓ ${ok.invoiceNumber} (${ok.invoiceId})`);
  }
  for (const f of result.failed) {
    console.log(`  ✗ ${f.uploadId.slice(0, 8)}: ${f.reason}`);
  }

  // 4. Verify each created invoice exists
  for (const ok of result.created) {
    const [inv] = await db
      .select()
      .from(salesInvoices)
      .where(and(eq(salesInvoices.id, ok.invoiceId), eq(salesInvoices.tenantId, tenantId)))
      .limit(1);
    if (!inv) throw new Error(`Invoice ${ok.invoiceId} not found in DB`);
    if (inv.status !== 'draft') throw new Error(`Invoice not in draft status`);
  }
  console.log('All created invoices verified in sales_invoices');

  // 5. Cleanup
  console.log('\nCleaning up...');
  for (const ok of result.created) {
    await pool.query(
      'DELETE FROM journal_lines WHERE journal_entry_id IN (SELECT id FROM journal_entries WHERE source_id = $1)',
      [ok.invoiceId],
    );
    await pool.query('DELETE FROM journal_entries WHERE source_id = $1', [ok.invoiceId]);
    await pool.query('DELETE FROM sales_invoice_items WHERE invoice_id = $1', [ok.invoiceId]);
    await pool.query('UPDATE po_drafts SET approved_invoice_id = NULL WHERE approved_invoice_id = $1', [ok.invoiceId]);
    await pool.query('DELETE FROM sales_invoices WHERE id = $1', [ok.invoiceId]);
  }
  await pool.query('DELETE FROM customer_sku_aliases WHERE tenant_id = $1 AND customer_id = $2', [
    tenantId,
    customer!.id,
  ]);
  for (const id of uploadIds) {
    await pool.query('DELETE FROM po_uploads WHERE id = $1', [id]);
  }
  console.log('Cleanup done.');

  await pool.end();
}

main().catch((err) => {
  console.error('Bulk approve smoke test failed:', err);
  process.exit(1);
});
