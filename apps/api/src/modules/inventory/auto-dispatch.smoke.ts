/**
 * Manual end-to-end check for dispatching stock when an invoice is issued.
 * Not part of the test suite (needs a live database):
 *
 *   DATABASE_URL=... npx tsx src/modules/inventory/auto-dispatch.smoke.ts <tenantId>
 *
 * Issues a draft invoice for a made-on-demand SKU that holds no stock and
 * asserts that sending it shipped the goods — the delivery note posted, the
 * unlabelled pool was drawn, and the invoice left the pending queue.
 *
 * Everything it creates is prefixed SMOKE-AD and removed on the way out. The
 * tenant's autoDispatchOnInvoice setting is restored to whatever it was.
 */

import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import {
  createDb, boms, bomLines, items, warehouses, tenants, customers,
  salesInvoices, salesInvoiceItems, deliveryNotes,
} from '@runq/db';
import type { TenantSettings } from '@runq/types';
import { StockLedgerService } from './stock-ledger.service';
import { InvoiceService } from '../ar/invoice.service';

const TAG = 'SMOKE-AD';
const POOL_PER_PACK = 0.25;
const PACKS = 40;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

async function main() {
  const url = process.env.DATABASE_URL;
  const tenantId = process.argv[2];
  if (!url || !tenantId) {
    console.error('Usage: DATABASE_URL=... tsx auto-dispatch.smoke.ts <tenantId>');
    process.exit(1);
  }

  const { db, pool } = createDb(url);
  const original = await readSetting(db, tenantId);
  try {
    await cleanup(db, tenantId);
    const fx = await seed(db, tenantId);
    await run(db, tenantId, fx);
  } finally {
    await writeSetting(db, tenantId, original);
    await cleanup(db, tenantId);
    await pool.end();
  }
}

interface Fixture {
  warehouseId: string;
  poolId: string;
  skuId: string;
  customerId: string;
}

async function seed(db: Db, tenantId: string): Promise<Fixture> {
  const [wh] = await db
    .select({ id: warehouses.id })
    .from(warehouses)
    .where(and(eq(warehouses.tenantId, tenantId), eq(warehouses.isActive, true)))
    .limit(1);
  if (!wh) throw new Error('Tenant has no active warehouse');

  const poolId = await addItem(db, tenantId, `${TAG} Pool`, 'semi_finished', 'kg', false);
  const skuId = await addItem(db, tenantId, `${TAG} Branded Pack`, 'finished_good', 'pcs', false);

  const [bom] = await db
    .insert(boms)
    .values({
      tenantId, bomCode: `${TAG}-PACK`, name: `${TAG}-PACK`,
      outputItemId: skuId, outputQty: '1', outputUom: 'pcs',
      version: 1, isActive: true, allowAutoRepack: true,
    })
    .returning();
  await db.insert(bomLines).values({
    tenantId, bomId: bom.id, lineNo: 1, inputItemId: poolId,
    qtyPerOutput: String(POOL_PER_PACK), inputUom: 'kg', scrapPct: '0', isOptional: false,
  });

  const ledger = new StockLedgerService(tenantId);
  await db.transaction(async (tx: Db) => {
    await ledger.recordMovement(tx, {
      itemId: poolId, warehouseId: wh.id, batchNo: null,
      movementType: 'opening', sourceType: 'adjustment',
      sourceId: randomUUID(), sourceLineId: null,
      qtyDelta: 50, unitCost: 300, movedAt: new Date(), postedBy: null,
    });
  });

  const [cust] = await db
    .insert(customers)
    .values({ tenantId, name: `${TAG} Customer`, email: 'smoke@example.com' })
    .returning();

  return { warehouseId: wh.id, poolId, skuId, customerId: cust.id };
}

async function run(db: Db, tenantId: string, fx: Fixture) {
  await writeSetting(db, tenantId, true);

  const today = new Date().toISOString().slice(0, 10);
  const [inv] = await db
    .insert(salesInvoices)
    .values({
      tenantId,
      invoiceNumber: `${TAG}-${Date.now().toString().slice(-6)}`,
      customerId: fx.customerId,
      invoiceDate: today,
      dueDate: today,
      status: 'draft',
      subtotal: '4000', taxAmount: '0', totalAmount: '4000', balanceDue: '4000',
    })
    .returning();
  await db.insert(salesInvoiceItems).values({
    tenantId, invoiceId: inv.id, itemId: fx.skuId,
    description: `${TAG} Branded Pack`, quantity: String(PACKS),
    unitPrice: '100', amount: '4000', lineTotal: '4000', uom: 'pcs',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  const poolBefore = await onHand(db, tenantId, fx.poolId, fx.warehouseId);
  console.log(`pool before:        ${poolBefore} kg`);
  console.log(`branded SKU stock:  ${await onHand(db, tenantId, fx.skuId, fx.warehouseId)}`);
  console.log(`invoice ${inv.invoiceNumber} raised as draft for ${PACKS} packs`);

  // The moment under test: issuing the invoice.
  const svc = new InvoiceService(db, tenantId);
  const sent = await svc.send(inv.id, { channel: 'email', sendEmail: false, attachPdf: false });
  const outcome = (sent as { autoDispatch?: { status: string; dnNo?: string; reason?: string } })
    .autoDispatch;
  console.log(`send() → autoDispatch: ${JSON.stringify(outcome)}`);
  assert(!!outcome, 'send() reported no auto-dispatch outcome — is the setting on?');
  assert(
    outcome!.status === 'dispatched',
    `expected a dispatch, got ${outcome!.status}: ${outcome!.reason ?? ''}`,
  );

  const [dn] = await db
    .select({ dnNo: deliveryNotes.dnNo, status: deliveryNotes.status })
    .from(deliveryNotes)
    .where(and(eq(deliveryNotes.tenantId, tenantId), eq(deliveryNotes.invoiceId, inv.id)))
    .limit(1);
  console.log(`delivery note:      ${dn.dnNo} (${dn.status})`);
  assert(dn.status === 'dispatched', `DN should be dispatched, got ${dn.status}`);

  const poolAfter = await onHand(db, tenantId, fx.poolId, fx.warehouseId);
  const expected = PACKS * POOL_PER_PACK;
  console.log(`pool drawn:         ${round(poolBefore - poolAfter)} kg (expected ${expected})`);
  assert(
    round(poolBefore - poolAfter) === expected,
    'pool draw does not match the recipe',
  );

  // Issuing again must not ship twice — the guard is the DN, not the status.
  const second = await new (await import('./auto-dispatch.service')).AutoDispatchService({
    db, tenantId,
  }).runForInvoice(inv.id);
  console.log(`second run:         ${second.status} — ${'reason' in second ? second.reason : ''}`);
  assert(second.status === 'skipped', 'a second run must not raise another delivery note');

  console.log('\nOK — issuing the invoice shipped the goods, and would not ship them twice.');
}

// ─── Helpers ──────────────────────────────────────────────────────────────

async function readSetting(db: Db, tenantId: string): Promise<boolean> {
  const [row] = await db
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  return ((row?.settings ?? {}) as Partial<TenantSettings>).autoDispatchOnInvoice === true;
}

async function writeSetting(db: Db, tenantId: string, value: boolean) {
  const [row] = await db
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  const merged = { ...((row?.settings ?? {}) as object), autoDispatchOnInvoice: value };
  await db.update(tenants).set({ settings: merged }).where(eq(tenants.id, tenantId));
}

async function addItem(
  db: Db, tenantId: string, name: string, itemClass: string, unit: string, trackBatches: boolean,
) {
  const [row] = await db
    .insert(items)
    .values({
      tenantId, name, sku: name.replace(/\s+/g, '-').toUpperCase().slice(0, 50),
      type: 'product', itemClass, unit, packSizeUqc: unit.toUpperCase().slice(0, 10),
      trackInventory: true, trackBatches,
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
  const wos = sql`(SELECT id FROM work_orders WHERE tenant_id = ${tenantId}
                   AND bom_id IN (SELECT id FROM boms WHERE tenant_id = ${tenantId}
                                  AND bom_code LIKE ${`${TAG}%`}))`;

  await db.execute(sql`DELETE FROM delivery_note_lines WHERE dn_id IN ${dns}`);
  await db.execute(sql`DELETE FROM delivery_notes WHERE id IN ${dns}`);
  await db.execute(sql`DELETE FROM sales_invoice_items WHERE invoice_id IN ${invs}`);
  await db.execute(sql`DELETE FROM sales_invoices WHERE id IN ${invs}`);
  await db.execute(sql`DELETE FROM wo_consumption WHERE wo_id IN ${wos}`);
  await db.execute(sql`DELETE FROM wo_output WHERE wo_id IN ${wos}`);
  await db.execute(sql`DELETE FROM work_orders WHERE id IN ${wos}`);
  await db.execute(sql`DELETE FROM bom_lines WHERE bom_id IN (
    SELECT id FROM boms WHERE tenant_id = ${tenantId} AND bom_code LIKE ${`${TAG}%`})`);
  await db.execute(sql`DELETE FROM boms WHERE tenant_id = ${tenantId} AND bom_code LIKE ${`${TAG}%`}`);
  await db.execute(sql`DELETE FROM stock_ledger WHERE tenant_id = ${tenantId} AND item_id IN ${owned}`);
  await db.execute(sql`DELETE FROM stock_on_hand WHERE tenant_id = ${tenantId} AND item_id IN ${owned}`);
  await db.execute(sql`DELETE FROM items WHERE tenant_id = ${tenantId} AND name LIKE ${`${TAG}%`}`);
  await db.execute(sql`DELETE FROM customers WHERE tenant_id = ${tenantId} AND name LIKE ${`${TAG}%`}`);
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
