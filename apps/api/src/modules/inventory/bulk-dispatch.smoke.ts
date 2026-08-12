/**
 * Manual end-to-end check for clearing the Awaiting-dispatch backlog.
 * Not part of the test suite (needs a live database):
 *
 *   DATABASE_URL=... npx tsx src/modules/inventory/bulk-dispatch.smoke.ts <tenantId>
 *
 * Seeds three issued invoices dated on three different past days, runs them
 * through AutoDispatchService.runForInvoices the way the bulk route does,
 * and asserts the three things the feature claims:
 *
 *   1. every invoice ships in one pass,
 *   2. each delivery note carries its own invoice's date, not today's —
 *      this is what `dateMode: 'invoice'` buys, and what puts the COGS
 *      entry in the month the goods were billed,
 *   3. a second pass ships nothing, because the DN is the guard.
 *
 * Everything it creates is prefixed SMOKE-BD and removed on the way out.
 * The tenant's autoDispatchOnInvoice setting is never touched — the whole
 * point of dispatchOne is that it runs without it.
 */

import { randomUUID } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  createDb, items, warehouses, customers,
  salesInvoices, salesInvoiceItems, deliveryNotes,
} from '@runq/db';
import { StockLedgerService } from './stock-ledger.service';
import { AutoDispatchService } from './auto-dispatch.service';

const TAG = 'SMOKE-BD';
const QTY_PER_INVOICE = 10;
const AGES = [45, 30, 15]; // days back, so each invoice lands in its own week

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

async function main() {
  const url = process.env.DATABASE_URL;
  const tenantId = process.argv[2];
  if (!url || !tenantId) {
    console.error('Usage: DATABASE_URL=... tsx bulk-dispatch.smoke.ts <tenantId>');
    process.exit(1);
  }

  const { db, pool } = createDb(url);
  try {
    await cleanup(db, tenantId);
    const fx = await seed(db, tenantId);
    await run(db, tenantId, fx);
  } finally {
    await cleanup(db, tenantId);
    await pool.end();
  }
}

interface Fixture {
  warehouseId: string;
  itemId: string;
  invoices: Array<{ id: string; number: string; date: string }>;
}

async function seed(db: Db, tenantId: string): Promise<Fixture> {
  const [wh] = await db
    .select({ id: warehouses.id })
    .from(warehouses)
    .where(and(eq(warehouses.tenantId, tenantId), eq(warehouses.isActive, true)))
    .limit(1);
  if (!wh) throw new Error('Tenant has no active warehouse');

  const itemId = await addItem(db, tenantId, `${TAG} Widget`);

  // Enough stock for all three, opened today: FEFO draws from what is on
  // hand now even for a backdated note, which is exactly the caveat the
  // confirm dialog warns about.
  const ledger = new StockLedgerService(tenantId);
  await db.transaction(async (tx: Db) => {
    await ledger.recordMovement(tx, {
      itemId, warehouseId: wh.id, batchNo: null,
      movementType: 'opening', sourceType: 'adjustment',
      sourceId: randomUUID(), sourceLineId: null,
      qtyDelta: QTY_PER_INVOICE * AGES.length, unitCost: 50,
      movedAt: new Date(), postedBy: null,
    });
  });

  // Borrows an existing customer rather than seeding one: the invoice is
  // what's under test, and a dev database whose customers table has drifted
  // from the schema shouldn't stop this from running.
  const [cust] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.tenantId, tenantId))
    .limit(1);
  if (!cust) throw new Error('Tenant has no customer to invoice');

  const invoices = [];
  for (const [i, age] of AGES.entries()) {
    const date = daysAgo(age);
    const number = `${TAG}-${Date.now().toString().slice(-6)}-${i}`;
    const [inv] = await db
      .insert(salesInvoices)
      .values({
        tenantId, invoiceNumber: number, customerId: cust.id,
        invoiceDate: date, dueDate: date,
        status: 'sent',
        subtotal: '1000', taxAmount: '0', totalAmount: '1000', balanceDue: '1000',
      })
      .returning();
    await db.insert(salesInvoiceItems).values({
      tenantId, invoiceId: inv.id, itemId,
      description: `${TAG} Widget`, quantity: String(QTY_PER_INVOICE),
      unitPrice: '100', amount: '1000', lineTotal: '1000', uom: 'pcs',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    invoices.push({ id: inv.id, number, date });
  }

  return { warehouseId: wh.id, itemId, invoices };
}

async function run(db: Db, tenantId: string, fx: Fixture) {
  const before = await onHand(db, tenantId, fx.itemId, fx.warehouseId);
  console.log(`stock before:       ${before}`);
  console.log(`invoices seeded:    ${fx.invoices.map((i) => `${i.number}@${i.date}`).join(', ')}`);

  const svc = new AutoDispatchService({ db, tenantId });
  const ids = fx.invoices.map((i) => i.id);

  // The moment under test — exactly what POST /sales-dispatch/bulk calls.
  const results = await svc.runForInvoices(ids, { dateMode: 'invoice' });
  for (const r of results) {
    const inv = fx.invoices.find((i) => i.id === r.invoiceId)!;
    const detail = 'reason' in r.outcome ? r.outcome.reason : (r.outcome as { dnNo: string }).dnNo;
    console.log(`  ${inv.number}: ${r.outcome.status} — ${detail}`);
  }
  assert(
    results.every((r) => r.outcome.status === 'dispatched'),
    'every seeded invoice should have shipped in one pass',
  );

  // Claim 2: the DN carries the invoice's date, not today's.
  const dns = await db
    .select({
      invoiceId: deliveryNotes.invoiceId,
      dnNo: deliveryNotes.dnNo,
      status: deliveryNotes.status,
      dispatchDate: deliveryNotes.dispatchDate,
    })
    .from(deliveryNotes)
    .where(and(eq(deliveryNotes.tenantId, tenantId), inArray(deliveryNotes.invoiceId, ids)));
  assert(dns.length === ids.length, `expected ${ids.length} delivery notes, got ${dns.length}`);
  for (const dn of dns) {
    const inv = fx.invoices.find((i) => i.id === dn.invoiceId)!;
    console.log(`  ${dn.dnNo}: ${dn.status} dated ${dn.dispatchDate} (invoice ${inv.date})`);
    assert(dn.status === 'dispatched', `${dn.dnNo} should be dispatched, got ${dn.status}`);
    assert(
      String(dn.dispatchDate) === inv.date,
      `${dn.dnNo} dated ${dn.dispatchDate}, expected the invoice date ${inv.date}`,
    );
  }

  const after = await onHand(db, tenantId, fx.itemId, fx.warehouseId);
  const drawn = round(before - after);
  console.log(`stock drawn:        ${drawn} (expected ${QTY_PER_INVOICE * AGES.length})`);
  assert(drawn === QTY_PER_INVOICE * AGES.length, 'stock drawn does not match what was shipped');

  // Claim 3: running again is a no-op, guarded on the delivery note.
  const second = await svc.runForInvoices(ids, { dateMode: 'invoice' });
  const statuses = second.map((r) => r.outcome.status);
  console.log(`second pass:        ${statuses.join(', ')}`);
  assert(
    statuses.every((s) => s === 'skipped'),
    'a second pass must not raise a second delivery note',
  );
  const afterSecond = await onHand(db, tenantId, fx.itemId, fx.warehouseId);
  assert(afterSecond === after, 'second pass moved stock — the DN guard did not hold');

  console.log('\nOK — the backlog cleared in one pass, each note dated to its own '
    + 'invoice, and a repeat run shipped nothing.');
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

async function addItem(db: Db, tenantId: string, name: string) {
  const [row] = await db
    .insert(items)
    .values({
      tenantId, name, sku: name.replace(/\s+/g, '-').toUpperCase().slice(0, 50),
      type: 'product', itemClass: 'finished_good', unit: 'pcs', packSizeUqc: 'PCS',
      trackInventory: true, trackBatches: false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    .returning();
  return row.id as string;
}

async function onHand(db: Db, tenantId: string, itemId: string, warehouseId: string) {
  const r = await db.execute(sql`
    SELECT COALESCE(SUM(qty), 0)::float AS qty FROM stock_on_hand
    WHERE tenant_id = ${tenantId} AND item_id = ${itemId} AND warehouse_id = ${warehouseId}
  `);
  return round(Number(r.rows[0]?.qty ?? 0));
}

async function cleanup(db: Db, tenantId: string) {
  const owned = sql`(SELECT id FROM items WHERE tenant_id = ${tenantId} AND name LIKE ${`${TAG}%`})`;
  const invs = sql`(SELECT id FROM sales_invoices WHERE tenant_id = ${tenantId}
                    AND invoice_number LIKE ${`${TAG}%`})`;
  const dns = sql`(SELECT id FROM delivery_notes WHERE tenant_id = ${tenantId}
                   AND invoice_id IN ${invs})`;

  await db.execute(sql`DELETE FROM journal_lines WHERE journal_entry_id IN (
    SELECT id FROM journal_entries WHERE tenant_id = ${tenantId}
    AND source_type = 'delivery_note' AND source_id IN ${dns})`);
  await db.execute(sql`DELETE FROM journal_entries WHERE tenant_id = ${tenantId}
    AND source_type = 'delivery_note' AND source_id IN ${dns}`);
  await db.execute(sql`DELETE FROM delivery_note_lines WHERE dn_id IN ${dns}`);
  await db.execute(sql`DELETE FROM delivery_notes WHERE id IN ${dns}`);
  await db.execute(sql`DELETE FROM sales_invoice_items WHERE invoice_id IN ${invs}`);
  await db.execute(sql`DELETE FROM sales_invoices WHERE id IN ${invs}`);
  await db.execute(sql`DELETE FROM stock_ledger WHERE tenant_id = ${tenantId} AND item_id IN ${owned}`);
  await db.execute(sql`DELETE FROM stock_on_hand WHERE tenant_id = ${tenantId} AND item_id IN ${owned}`);
  await db.execute(sql`DELETE FROM items WHERE tenant_id = ${tenantId} AND name LIKE ${`${TAG}%`}`);
  
}

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}

function assert(ok: boolean, message: string): asserts ok {
  if (!ok) throw new Error(`ASSERT: ${message}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
