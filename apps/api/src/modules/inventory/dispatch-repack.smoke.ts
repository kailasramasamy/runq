/**
 * Manual end-to-end check for making finished goods at dispatch.
 * Not part of the test suite (needs a live database):
 *
 *   DATABASE_URL=... npx tsx src/modules/inventory/dispatch-repack.smoke.ts <tenantId>
 *
 * Builds the chain a dairy actually runs — milk → a production run that yields
 * an unlabelled pool batch with an expiry → a delivery note for a branded SKU
 * that has never held a single unit of stock — then asserts the dispatch made
 * what it needed, inherited the pool's expiry, and left the books straight.
 *
 * Everything it creates is prefixed SMOKE-RPK and deleted on the way out, so it
 * is safe to re-run.
 */

import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import {
  createDb, boms, bomLines, items, warehouses, workOrders, woOutput, woConsumption,
  deliveryNotes, deliveryNoteLines,
} from '@runq/db';
import { DeliveryNoteService } from './delivery.service';
import { StockLedgerService } from './stock-ledger.service';
import { ProductionEntryService } from '../manufacturing/production-entry.service';

const TAG = 'SMOKE-RPK';
const POOL_PER_PACK = 0.2;   // kg of paneer in a 200g pack
const PACKS_ORDERED = 60;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

async function main() {
  const url = process.env.DATABASE_URL;
  const tenantId = process.argv[2];
  if (!url || !tenantId) {
    console.error('Usage: DATABASE_URL=... tsx dispatch-repack.smoke.ts <tenantId>');
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
  milkId: string;
  poolId: string;
  labelId: string;
  skuId: string;
  makeBomId: string;
  packBomId: string;
}

async function seed(db: Db, tenantId: string): Promise<Fixture> {
  const [wh] = await db
    .select({ id: warehouses.id })
    .from(warehouses)
    .where(eq(warehouses.tenantId, tenantId))
    .limit(1);
  if (!wh) throw new Error('Tenant has no warehouse');

  const milkId = await addItem(db, tenantId, `${TAG} Raw Milk`, 'raw_material', 'L', false);
  const poolId = await addItem(db, tenantId, `${TAG} Paneer Unlabelled`, 'semi_finished', 'kg', true);
  const labelId = await addItem(db, tenantId, `${TAG} Pouch 200g`, 'packaging', 'pcs', false);
  const skuId = await addItem(db, tenantId, `${TAG} Branded Paneer 200g`, 'finished_good', 'pcs', true);

  // Recipe 1: how the pool itself is made — this is what stamps a real expiry
  // onto the pool batch, which the repack later inherits.
  const makeBomId = await addBom(db, tenantId, `${TAG}-MAKE`, poolId, 1, 'kg', false, [
    { inputItemId: milkId, qtyPerOutput: 7, inputUom: 'L' },
  ]);
  // Recipe 2: pool + pouch → the branded pack, made only at dispatch.
  const packBomId = await addBom(db, tenantId, `${TAG}-PACK`, skuId, 1, 'pcs', true, [
    { inputItemId: poolId, qtyPerOutput: POOL_PER_PACK, inputUom: 'kg' },
    { inputItemId: labelId, qtyPerOutput: 1, inputUom: 'pcs' },
  ]);

  const ledger = new StockLedgerService(tenantId);
  await db.transaction(async (tx: Db) => {
    await ledger.recordMovement(tx, {
      itemId: milkId, warehouseId: wh.id, batchNo: null,
      movementType: 'opening', sourceType: 'adjustment',
      sourceId: randomUUID(), sourceLineId: null,
      qtyDelta: 500, unitCost: 40, movedAt: new Date(), postedBy: null,
    });
    await ledger.recordMovement(tx, {
      itemId: labelId, warehouseId: wh.id, batchNo: null,
      movementType: 'opening', sourceType: 'adjustment',
      sourceId: randomUUID(), sourceLineId: null,
      qtyDelta: 500, unitCost: 2, movedAt: new Date(), postedBy: null,
    });
  });

  return { warehouseId: wh.id, milkId, poolId, labelId, skuId, makeBomId, packBomId };
}

async function run(db: Db, tenantId: string, fx: Fixture) {
  const today = new Date().toISOString().slice(0, 10);
  const poolExpiry = addDays(today, 12);

  // ── The morning run: 20 kg of paneer, expiring in 12 days ────────────────
  const production = new ProductionEntryService(db, tenantId);
  await production.record({
    bomId: fx.makeBomId,
    producedQty: 20,
    warehouseId: fx.warehouseId,
    expiryDate: poolExpiry,
    producedOn: today,
  });
  const poolBefore = await onHand(db, tenantId, fx.poolId, fx.warehouseId);
  const skuBefore = await onHand(db, tenantId, fx.skuId, fx.warehouseId);
  console.log(`pool on hand after the run: ${poolBefore} kg (expiry ${poolExpiry})`);
  console.log(`branded SKU on hand:        ${skuBefore} — nothing, by design`);
  assert(poolBefore === 20, `expected 20 kg of pool, got ${poolBefore}`);
  assert(skuBefore === 0, `branded SKU should hold no stock, got ${skuBefore}`);

  // ── The order: 60 packs of a SKU that does not exist yet ─────────────────
  const dnSvc = new DeliveryNoteService({ db, tenantId });
  const dn = await dnSvc.create({
    warehouseId: fx.warehouseId,
    dispatchDate: today,
    lines: [{ itemId: fx.skuId, qty: PACKS_ORDERED, uom: 'pcs', batchNo: null }],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  console.log(`created ${dn.dnNo} for ${PACKS_ORDERED} packs with no stock behind it`);

  await dnSvc.dispatch(dn.id);
  console.log('dispatched');

  // ── What the books should now say ────────────────────────────────────────
  const poolAfter = await onHand(db, tenantId, fx.poolId, fx.warehouseId);
  const skuAfter = await onHand(db, tenantId, fx.skuId, fx.warehouseId);
  const expectedDraw = PACKS_ORDERED * POOL_PER_PACK;
  console.log(`pool drawn:  ${round(poolBefore - poolAfter)} kg (expected ${expectedDraw})`);
  console.log(`branded left: ${skuAfter} — made and shipped in one move`);
  assert(round(poolBefore - poolAfter) === expectedDraw, 'pool draw does not match the recipe');
  assert(skuAfter === 0, `branded stock should net to zero, got ${skuAfter}`);

  const [wo] = await db
    .select({ id: workOrders.id, woNumber: workOrders.woNumber, entryMode: workOrders.entryMode, status: workOrders.status })
    .from(workOrders)
    .where(and(eq(workOrders.tenantId, tenantId), eq(workOrders.bomId, fx.packBomId)))
    .limit(1);
  assert(!!wo, 'dispatch did not post a work order');
  console.log(`repack work order: ${wo.woNumber} (${wo.entryMode}, ${wo.status})`);
  assert(wo.entryMode === 'unplanned', `expected an unplanned WO, got ${wo.entryMode}`);
  assert(wo.status === 'closed', `expected a closed WO, got ${wo.status}`);

  const [out] = await db
    .select({ batchNo: woOutput.batchNo, expiryDate: woOutput.expiryDate, qty: woOutput.qty })
    .from(woOutput)
    .where(and(eq(woOutput.tenantId, tenantId), eq(woOutput.woId, wo.id)))
    .limit(1);
  console.log(`produced batch: ${out.batchNo} × ${out.qty}, expiry ${out.expiryDate}`);
  assert(
    out.expiryDate === poolExpiry,
    `pack should inherit the pool expiry ${poolExpiry}, got ${out.expiryDate}`,
  );

  const [dnLine] = await db
    .select({ batchNo: deliveryNoteLines.batchNo, unitCost: deliveryNoteLines.unitCost })
    .from(deliveryNoteLines)
    .where(eq(deliveryNoteLines.dnId, dn.id))
    .limit(1);
  console.log(`delivery line shipped batch ${dnLine.batchNo} at ${dnLine.unitCost}/pack`);
  assert(
    dnLine.batchNo === out.batchNo,
    `DN should ship the batch it just made (${out.batchNo}), got ${dnLine.batchNo}`,
  );
  assert(Number(dnLine.unitCost) > 0, 'COGS came out at zero — costing did not roll up');

  // Genealogy: which pool batch went out under this label.
  const consumed = await db
    .select({ itemId: woConsumption.inputItemId, batchNo: woConsumption.batchNo, qty: woConsumption.qty })
    .from(woConsumption)
    .where(and(eq(woConsumption.tenantId, tenantId), eq(woConsumption.woId, wo.id)));
  for (const c of consumed) {
    console.log(`  consumed ${c.qty} of ${c.itemId === fx.poolId ? 'pool' : 'pouches'} batch ${c.batchNo ?? '—'}`);
  }
  assert(consumed.length >= 2, 'expected both the pool and the pouch to be consumed');

  console.log('\nOK — a SKU with no stock shipped 60 packs, drew the pool, and kept its expiry.');
}

// ─── Fixture helpers ──────────────────────────────────────────────────────

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

async function addBom(
  db: Db, tenantId: string, bomCode: string, outputItemId: string,
  outputQty: number, outputUom: string, allowAutoRepack: boolean,
  lines: Array<{ inputItemId: string; qtyPerOutput: number; inputUom: string }>,
) {
  const [bom] = await db
    .insert(boms)
    .values({
      tenantId, bomCode, name: bomCode, outputItemId,
      outputQty: String(outputQty), outputUom, version: 1, isActive: true, allowAutoRepack,
    })
    .returning();
  await db.insert(bomLines).values(
    lines.map((l, i) => ({
      tenantId, bomId: bom.id, lineNo: i + 1,
      inputItemId: l.inputItemId, qtyPerOutput: String(l.qtyPerOutput),
      inputUom: l.inputUom, scrapPct: '0', isOptional: false,
    })),
  );
  return bom.id as string;
}

async function onHand(db: Db, tenantId: string, itemId: string, warehouseId: string) {
  const r = await db.execute(sql`
    SELECT COALESCE(SUM(qty), 0)::float AS qty FROM stock_on_hand
    WHERE tenant_id = ${tenantId} AND item_id = ${itemId} AND warehouse_id = ${warehouseId}
  `);
  return round(Number(r.rows[0]?.qty ?? 0));
}

/**
 * Deletes in FK order. Ledger and journal rows are removed by item/document so
 * a re-run starts from nothing.
 */
async function cleanup(db: Db, tenantId: string) {
  const owned = sql`(SELECT id FROM items WHERE tenant_id = ${tenantId} AND name LIKE ${`${TAG}%`})`;
  const dns = sql`(SELECT id FROM delivery_notes WHERE tenant_id = ${tenantId}
                   AND id IN (SELECT dn_id FROM delivery_note_lines WHERE item_id IN ${owned}))`;
  const wos = sql`(SELECT id FROM work_orders WHERE tenant_id = ${tenantId}
                   AND bom_id IN (SELECT id FROM boms WHERE tenant_id = ${tenantId}
                                  AND bom_code LIKE ${`${TAG}%`}))`;

  await db.execute(sql`DELETE FROM delivery_note_lines WHERE dn_id IN ${dns}`);
  await db.execute(sql`DELETE FROM delivery_notes WHERE id IN ${dns}`);
  await db.execute(sql`DELETE FROM wo_consumption WHERE wo_id IN ${wos}`);
  await db.execute(sql`DELETE FROM wo_output WHERE wo_id IN ${wos}`);
  await db.execute(sql`DELETE FROM work_orders WHERE id IN ${wos}`);
  await db.execute(sql`DELETE FROM bom_lines WHERE bom_id IN (
    SELECT id FROM boms WHERE tenant_id = ${tenantId} AND bom_code LIKE ${`${TAG}%`})`);
  await db.execute(sql`DELETE FROM boms WHERE tenant_id = ${tenantId} AND bom_code LIKE ${`${TAG}%`}`);
  await db.execute(sql`DELETE FROM stock_ledger WHERE tenant_id = ${tenantId} AND item_id IN ${owned}`);
  await db.execute(sql`DELETE FROM stock_on_hand WHERE tenant_id = ${tenantId} AND item_id IN ${owned}`);
  await db.execute(sql`DELETE FROM items WHERE tenant_id = ${tenantId} AND name LIKE ${`${TAG}%`}`);
}

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
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
