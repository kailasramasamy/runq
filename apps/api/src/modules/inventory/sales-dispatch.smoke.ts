/**
 * Manual smoke check for the invoice → dispatch lane against a real database.
 * Not part of the test suite (needs live data); run it after schema changes:
 *
 *   DATABASE_URL=... npx tsx src/modules/inventory/sales-dispatch.smoke.ts <tenantId>
 */

import { eq } from 'drizzle-orm';
import { createDb, warehouses } from '@runq/db';
import { SalesDispatchService } from './sales-dispatch.service';

async function main() {
  const url = process.env.DATABASE_URL;
  const tenantId = process.argv[2];
  if (!url || !tenantId) {
    console.error('Usage: DATABASE_URL=... tsx sales-dispatch.smoke.ts <tenantId>');
    process.exit(1);
  }

  const { db, pool } = createDb(url);
  const svc = new SalesDispatchService({ db, tenantId });

  const queue = await svc.listPendingInvoices({ page: 1, limit: 5 });
  console.log(`pending invoices: ${queue.total}`);
  for (const row of queue.data) {
    console.log(`  ${row.invoiceNumber} ${row.customerName} — ` +
      `${row.stockableCount}/${row.lineCount} stockable, ${row.dispatchedCount} dispatched`);
  }

  const first = queue.data[0];
  if (first) {
    const [wh] = await db
      .select({ id: warehouses.id, name: warehouses.name })
      .from(warehouses)
      .where(eq(warehouses.tenantId, tenantId))
      .limit(1);

    const status = await svc.invoiceDispatchStatus(first.id);
    console.log(`status of ${first.invoiceNumber}: ${status.status} ` +
      `(${status.dispatchedLines}/${status.stockableLines} lines)`);

    if (wh) {
      const preview = await svc.previewInvoice(first.id, wh.id);
      console.log(`preview from ${wh.name}:`);
      for (const l of preview.lines) {
        console.log(`  [${l.resolution}] ${l.description} — remaining ${l.remainingQty}, ` +
          `on hand ${l.availableQty}, batch ${l.suggestedBatchNo ?? '—'}`);
      }
    }
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
