/**
 * End-to-end check of the sales stock path against a real database, run
 * entirely inside a transaction that is rolled back — it seeds an item,
 * stock, an invoice, then dispatches and returns, and asserts the ledger and
 * on-hand land where they should. Nothing is persisted.
 *
 *   DATABASE_URL=... npx tsx src/modules/inventory/sales-return.smoke.ts <tenantId>
 */

import { eq, and, sql } from 'drizzle-orm';
import { createDb, warehouses, items, customers, salesInvoices, salesInvoiceItems } from '@runq/db';
import { SalesDispatchService } from './sales-dispatch.service';
import { SalesReturnService } from './sales-return.service';
import { DeliveryNoteService } from './delivery.service';
import { StockLedgerService } from './stock-ledger.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any;

const ROLLBACK = new Error('__rollback__');

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: ${JSON.stringify(actual)}` +
    (ok ? '' : ` (expected ${JSON.stringify(expected)})`));
  if (!ok) process.exitCode = 1;
}

async function seed(tx: AnyDb, tenantId: string, warehouseId: string) {
  const [item] = await tx.insert(items).values({
    tenantId, sku: `SMOKE-${Date.now()}`, name: 'Smoke Test Ghee',
    type: 'product', itemClass: 'finished_good', unit: 'NOS', packSizeUqc: 'NOS',
    trackInventory: true, trackBatches: false,
  }).returning();

  // 100 units on hand at ₹50 — the cost the dispatch must consume.
  await new StockLedgerService(tenantId).recordMovement(tx, {
    itemId: item.id, warehouseId, movementType: 'opening',
    sourceType: 'smoke', sourceId: item.id,
    qtyDelta: 100, unitCost: 50, movedAt: new Date(),
  });

  const [customer] = await tx.select().from(customers)
    .where(eq(customers.tenantId, tenantId)).limit(1);

  const [invoice] = await tx.insert(salesInvoices).values({
    tenantId, invoiceNumber: `SMOKE-${Date.now()}`, customerId: customer.id,
    invoiceDate: '2026-08-02', dueDate: '2026-08-30',
    subtotal: '4000', totalAmount: '4000', balanceDue: '4000', status: 'sent',
  }).returning();

  const [line] = await tx.insert(salesInvoiceItems).values({
    tenantId, invoiceId: invoice.id, itemId: item.id,
    description: 'Smoke Test Ghee', quantity: '40', unitPrice: '100', amount: '4000',
  }).returning();

  return { item, invoice, line };
}

async function onHand(tx: AnyDb, tenantId: string, itemId: string) {
  const r = await tx.execute(sql`
    SELECT qty::text AS qty, avg_cost::text AS avg_cost FROM stock_on_hand
    WHERE tenant_id = ${tenantId} AND item_id = ${itemId}
  `);
  const row = (r as unknown as { rows: Array<{ qty: string; avg_cost: string }> }).rows[0];
  return { qty: Number(row?.qty ?? 0), avgCost: Number(row?.avg_cost ?? 0) };
}

async function run(tx: AnyDb, tenantId: string, warehouseId: string) {
  const ctx = { db: tx, tenantId };
  const dispatchSvc = new SalesDispatchService(ctx);
  const dnSvc = new DeliveryNoteService(ctx);
  const returnSvc = new SalesReturnService(ctx);

  const { item, invoice, line } = await seed(tx, tenantId, warehouseId);
  check('opening stock', (await onHand(tx, tenantId, item.id)).qty, 100);

  // The invoice should now be waiting on the warehouse.
  const preview = await dispatchSvc.previewInvoice(invoice.id, warehouseId);
  const target = preview.lines.find((l) => l.invoiceLineId === line.id)!;
  check('line resolves via catalogue link', target.resolution, 'item');
  check('remaining to dispatch', target.remainingQty, 40);

  // Partial dispatch: send 25 of the 40 invoiced.
  const dn = await dispatchSvc.createFromInvoice(invoice.id, {
    warehouseId, dispatchDate: '2026-08-02',
    lines: [{ itemId: item.id, invoiceLineId: line.id, qty: 25 }],
  });
  await dnSvc.dispatch(dn.id);
  check('stock after partial dispatch', (await onHand(tx, tenantId, item.id)).qty, 75);
  check('invoice status', (await dispatchSvc.invoiceDispatchStatus(invoice.id)).status, 'partial');

  // Over-dispatch guard: 40 invoiced, 25 gone, asking for 20 must fail.
  let rejected = '';
  try {
    await dispatchSvc.createFromInvoice(invoice.id, {
      warehouseId, dispatchDate: '2026-08-02',
      lines: [{ itemId: item.id, invoiceLineId: line.id, qty: 20 }],
    });
  } catch (e) { rejected = (e as Error).message; }
  check('over-dispatch rejected', rejected.includes('15 left to dispatch'), true);

  // Return 10 of the 25 that went out.
  const returnable = await returnSvc.returnableLines(dn.id);
  check('returnable qty', returnable[0]!.returnableQty, 25);
  await returnSvc.create(dn.id, {
    returnDate: '2026-08-03', reason: 'Damaged in transit',
    lines: [{ dnLineId: returnable[0]!.id, qty: 10 }],
  });

  const after = await onHand(tx, tenantId, item.id);
  check('stock after return', after.qty, 85);
  // The return came back at the dispatch cost, so the average is untouched.
  check('avg cost unchanged by return', after.avgCost, 50);

  // A returned line owes goods again: 40 invoiced − (25 − 10) = 25 left.
  const post = await dispatchSvc.previewInvoice(invoice.id, warehouseId);
  check('remaining after return', post.lines.find((l) => l.invoiceLineId === line.id)!.remainingQty, 25);

  // Over-return guard.
  let returnRejected = '';
  try {
    await returnSvc.create(dn.id, {
      returnDate: '2026-08-03', reason: 'again',
      lines: [{ dnLineId: returnable[0]!.id, qty: 20 }],
    });
  } catch (e) { returnRejected = (e as Error).message; }
  check('over-return rejected', returnRejected.includes('15 left to return'), true);
}

async function main() {
  const url = process.env.DATABASE_URL;
  const tenantId = process.argv[2];
  if (!url || !tenantId) {
    console.error('Usage: DATABASE_URL=... tsx sales-return.smoke.ts <tenantId>');
    process.exit(1);
  }
  const { db, pool } = createDb(url);
  const [wh] = await db.select().from(warehouses)
    .where(and(eq(warehouses.tenantId, tenantId)))
    .limit(1);
  if (!wh) throw new Error('tenant has no warehouse');

  try {
    await db.transaction(async (tx) => {
      await run(tx as AnyDb, tenantId, wh.id);
      throw ROLLBACK;
    });
  } catch (e) {
    if (e !== ROLLBACK) throw e;
    console.log('\nrolled back — nothing persisted');
  }
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
