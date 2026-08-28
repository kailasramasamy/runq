/**
 * The stock side of a sale to a farmer.
 *
 * A sale used to book money only, which was quietly right for bulk milk and
 * quietly wrong for everything else. Milk sold at a VMCC comes off that node's
 * availability, so the day's consignment to the plant is smaller and the PP
 * receipt — the only inbound to raw-milk stock — is already net of the sale.
 * The netting happens upstream and a ledger row would double-count it.
 *
 * That holds only while the centre actually collected the type it sold. Sell
 * 80 L of A2 at a centre that pours none and there is no pool to net against:
 * the milk came off plant stock and nothing books it out. So raw milk posts
 * exactly the litres the node did NOT collect — see [uncoveredLitres].
 *
 * A product has no upstream netting at all. It leaves the warehouse it was
 * stocked in, at weighted-average cost, and unlike raw milk it was capitalised
 * on the way in — so it also owes a COGS entry, which the caller posts from the
 * value returned here.
 */

import { and, eq } from 'drizzle-orm';
import { items, mpGlSettings, mpRawMilkItems, stockLedger, warehouses } from '@runq/db';
import type { MpFarmerSaleRow } from '@runq/db';
import { ConflictError } from '../../utils/errors';
import { StockLedgerService } from '../inventory/stock-ledger.service';
import { BatchSuggestService } from '../manufacturing/batch-suggest.service';
import { allocateFefo } from '../manufacturing/production-backflush';

// Drizzle's tx type differs from the top-level client; both expose the same
// surface these helpers use.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = any;

const SOURCE = 'mp_farmer_sale';
const SOURCE_REVERSAL = 'mp_farmer_sale_reversal';

/** Litres, at the precision the qty column stores them. */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * How much of a bulk-milk sale comes off plant stock rather than off the
 * centre's own collection.
 *
 * The node's pour (or receipt) total for the day covers its sales first: those
 * litres simply never reach the tanker, and the plant receives less. Whatever
 * the collection cannot cover was carried out of the plant's tank instead, and
 * that is the only part the inventory ledger should see.
 *
 * [soldBefore] is the other live sales for the same node/date/shift/type, so a
 * farmer who buys twice in one day is measured against the day's collection
 * once rather than twice.
 *
 * Caveat worth knowing: a pour keyed AFTER the sale retroactively covers litres
 * already posted as uncovered, and the plant is then relieved twice. Editing
 * the sale re-derives it. Recomputing on every pour entry would put this
 * calculation in the hot path of the app's most-used screen to fix a case that
 * corrects itself.
 */
export function uncoveredLitres(soldBefore: number, qty: number, collected: number): number {
  const beyond = soldBefore + qty - collected;
  if (beyond <= 0) return 0;
  return round3(Math.min(beyond, qty));
}

/** What [postSaleStock] needs that only the sale's own service can know. */
export interface SaleStockContext {
  /** Litres of this milk type the node collected that day/shift. Raw milk only. */
  collected: number;
  /** Litres of this milk type already sold at that node/date/shift, excluding
   *  this sale. Raw milk only. */
  soldBefore: number;
  userId?: string;
}

/**
 * Draw a sale out of stock. Returns the value drawn, which is the COGS the
 * caller must post — always 0 for raw milk, which is never capitalised.
 *
 * Silent no-ops (nothing to relieve, so nothing to say): a bulk-milk sale the
 * node's own collection covers, a milk type with no `mp_raw_milk_items`
 * mapping, an unconfigured raw-milk warehouse, a product that isn't
 * inventoried. A shortfall is NOT silent — it throws before posting anything.
 */
export async function postSaleStock(
  tx: Tx, tenantId: string, sale: MpFarmerSaleRow, ctx: SaleStockContext,
): Promise<number> {
  const plan = sale.kind === 'raw_milk'
    ? await rawMilkPlan(tx, tenantId, sale, ctx)
    : await productPlan(tx, tenantId, sale);
  if (!plan) return 0;

  const pool = await new BatchSuggestService(tx, tenantId).suggestInTx(tx, plan.itemId, plan.warehouseId);
  const source = {
    itemId: plan.itemId, itemName: plan.itemName,
    tracksBatches: plan.tracksBatches, available: pool,
  };
  const { batches, allocated } = allocateFefo(plan.qty, [source]);
  if (allocated + 1e-6 < plan.qty) {
    throw new ConflictError(
      `Only ${round3(allocated)} ${sale.unit} of ${plan.itemName} in stock — `
      + `this sale needs ${round3(plan.qty)}.`,
    );
  }

  const ledger = new StockLedgerService(tenantId);
  // Backdated sales are normal — an operator hands milk over at the gate and
  // writes it up days later — so the movement is dated to the sale, not to now.
  const movedAt = new Date(`${sale.saleDate}T00:00:00Z`);
  let value = 0;
  for (const b of batches) {
    await ledger.recordMovement(tx, {
      itemId: b.itemId, warehouseId: plan.warehouseId, batchNo: b.batchNo,
      movementType: 'delivery', sourceType: SOURCE, sourceId: sale.id,
      qtyDelta: -b.qty, unitCost: b.unitCost, movedAt, postedBy: ctx.userId ?? null,
    });
    value += b.qty * b.unitCost;
  }
  return plan.postCogs ? round2(value) : 0;
}

/**
 * Put back everything a sale drew, keyed by source rather than by a stored
 * ledger id — one sale can span several batches, and one column cannot hold
 * them. Returns the value restored, for the caller's COGS contra.
 */
export async function reverseSaleStock(
  tx: Tx, tenantId: string, sale: MpFarmerSaleRow, userId?: string,
): Promise<number> {
  const rows = await tx.select({
    itemId: stockLedger.itemId, warehouseId: stockLedger.warehouseId,
    batchNo: stockLedger.batchNo, qtyOut: stockLedger.qtyOut, unitCost: stockLedger.unitCost,
  }).from(stockLedger).where(and(
    eq(stockLedger.tenantId, tenantId),
    eq(stockLedger.sourceType, SOURCE),
    eq(stockLedger.sourceId, sale.id),
  ));
  if (!rows.length) return 0;

  const ledger = new StockLedgerService(tenantId);
  let value = 0;
  for (const r of rows) {
    const qty = Number(r.qtyOut ?? 0);
    if (qty <= 0) continue;
    const unitCost = Number(r.unitCost ?? 0);
    await ledger.recordMovement(tx, {
      itemId: r.itemId, warehouseId: r.warehouseId, batchNo: r.batchNo,
      movementType: 'reversal', sourceType: SOURCE_REVERSAL, sourceId: sale.id,
      qtyDelta: qty, unitCost, movedAt: new Date(), postedBy: userId ?? null,
    });
    value += qty * unitCost;
  }
  // Only a capitalised item owes a COGS contra; raw milk never had one.
  return sale.kind === 'raw_milk' ? 0 : round2(value);
}

interface DrawPlan {
  itemId: string; itemName: string; warehouseId: string;
  qty: number; tracksBatches: boolean; postCogs: boolean;
}

/** The plant-stock half of a bulk-milk sale, or null when the centre's own
 *  collection already covered it. */
async function rawMilkPlan(
  tx: Tx, tenantId: string, sale: MpFarmerSaleRow, ctx: SaleStockContext,
): Promise<DrawPlan | null> {
  const qty = uncoveredLitres(ctx.soldBefore, Number(sale.qty), ctx.collected);
  if (qty <= 0 || !sale.milkType) return null;
  const [settings] = await tx.select({ wh: mpGlSettings.rawMilkWarehouseId })
    .from(mpGlSettings).where(eq(mpGlSettings.tenantId, tenantId));
  if (!settings?.wh) return null;
  const [map] = await tx.select({ itemId: mpRawMilkItems.itemId, name: items.name,
    tracksBatches: items.trackBatches, trackInventory: items.trackInventory })
    .from(mpRawMilkItems)
    .innerJoin(items, eq(items.id, mpRawMilkItems.itemId))
    .where(and(eq(mpRawMilkItems.tenantId, tenantId), eq(mpRawMilkItems.milkType, sale.milkType)));
  if (!map?.trackInventory) return null;
  // Raw milk is deliberately outside the GL — the PP receipt posts no journal
  // entry, so crediting an inventory asset on the way out would invent a
  // balance that was never debited.
  return {
    itemId: map.itemId, itemName: map.name, warehouseId: settings.wh,
    qty, tracksBatches: map.tracksBatches, postCogs: false,
  };
}

/** A product leaves the tenant's default warehouse — Dhenu has no per-centre
 *  store, and the plant warehouse is where the counter stock sits. */
async function productPlan(
  tx: Tx, tenantId: string, sale: MpFarmerSaleRow,
): Promise<DrawPlan | null> {
  if (!sale.itemId) return null;
  const [item] = await tx.select({
    name: items.name, tracksBatches: items.trackBatches, trackInventory: items.trackInventory,
  }).from(items).where(and(eq(items.tenantId, tenantId), eq(items.id, sale.itemId))).limit(1);
  // A service or a non-stocked SKU has nothing to relieve.
  if (!item?.trackInventory) return null;
  const [wh] = await tx.select({ id: warehouses.id }).from(warehouses)
    .where(and(eq(warehouses.tenantId, tenantId), eq(warehouses.isDefault, true))).limit(1);
  if (!wh) return null;
  return {
    itemId: sale.itemId, itemName: item.name, warehouseId: wh.id,
    qty: Number(sale.qty), tracksBatches: item.tracksBatches, postCogs: true,
  };
}
