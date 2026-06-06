import { and, asc, desc, eq, gte, lte, inArray, sql } from 'drizzle-orm';
import type { Db } from '@runq/db';
import {
  stockOnHand, stockLedger, items, warehouses, inventoryGrnLines,
} from '@runq/db';
import type { StockOnHandFilter, StockLedgerFilter } from '@runq/validators';
import { ITEM_CLASS_GROUP_MEMBERS } from '@runq/validators';
import { NotFoundError } from '../../utils/errors';

export class StockQueryService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  async onHand(filter: StockOnHandFilter) {
    const conds = [
      eq(stockOnHand.tenantId, this.tenantId),
      sql`${stockOnHand.qty} <> 0`,
    ];
    if (filter.warehouseId) conds.push(eq(stockOnHand.warehouseId, filter.warehouseId));
    if (filter.itemId) conds.push(eq(stockOnHand.itemId, filter.itemId));
    // Axis-1 grouping: tab strips on the mobile/web on-hand screens pass
    // a bucket like 'finished' or 'inputs'; we expand to the underlying
    // item_class values. 'all' falls through and applies no filter.
    if (filter.itemClassGroup && filter.itemClassGroup !== 'all') {
      const classes = ITEM_CLASS_GROUP_MEMBERS[filter.itemClassGroup];
      if (classes.length > 0) conds.push(inArray(items.itemClass, [...classes]));
    }

    const rows = await this.db
      .select({
        itemId: stockOnHand.itemId,
        warehouseId: stockOnHand.warehouseId,
        batchNo: stockOnHand.batchNo,
        qty: stockOnHand.qty,
        avgCost: stockOnHand.avgCost,
        value: stockOnHand.value,
        lastMovementAt: stockOnHand.lastMovementAt,
        itemName: items.name,
        itemSku: items.sku,
        itemUnit: items.unit,
        itemClass: items.itemClass,
        reorderLevel: items.reorderLevel,
        warehouseName: warehouses.name,
      })
      .from(stockOnHand)
      .innerJoin(items, eq(items.id, stockOnHand.itemId))
      .innerJoin(warehouses, eq(warehouses.id, stockOnHand.warehouseId))
      .where(and(...conds))
      .orderBy(asc(items.name), asc(warehouses.name));

    let filtered = rows;
    if (filter.lowOnly) {
      filtered = rows.filter((r) =>
        r.reorderLevel != null && Number(r.qty) <= Number(r.reorderLevel),
      );
    }
    // Per-batch expiry: keyed by `${itemId}|${batchNo}`. Pulled in a single
    // round-trip from GRN lines (the source of truth — stock_on_hand doesn't
    // store expiry). Empty when no batches are tracked, so the join is free
    // on non-perishable tenants.
    const expiryMap = await this.batchExpiryMap(
      filtered
        .filter((r) => r.batchNo)
        .map((r) => ({ itemId: r.itemId, batchNo: r.batchNo })),
    );
    return filtered.map((r) => ({
      ...r,
      qty: Number(r.qty),
      avgCost: Number(r.avgCost),
      value: Number(r.value),
      reorderLevel: r.reorderLevel ? Number(r.reorderLevel) : null,
      expiryDate: expiryMap.get(`${r.itemId}|${r.batchNo}`) ?? null,
    }));
  }

  /** Earliest expiry per (item, batch) across all GRN receipts that brought
   *  the batch in. Used by on-hand to surface a shelf-life column without a
   *  second round-trip per row. */
  private async batchExpiryMap(
    keys: Array<{ itemId: string; batchNo: string }>,
  ): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (keys.length === 0) return out;
    const itemIds = Array.from(new Set(keys.map((k) => k.itemId)));
    const batchNos = Array.from(new Set(keys.map((k) => k.batchNo)));
    const rows = await this.db
      .select({
        itemId: inventoryGrnLines.itemId,
        batchNo: inventoryGrnLines.batchNo,
        expiryDate: sql<string>`MIN(${inventoryGrnLines.expiryDate})::text`,
      })
      .from(inventoryGrnLines)
      .where(
        and(
          eq(inventoryGrnLines.tenantId, this.tenantId),
          inArray(inventoryGrnLines.itemId, itemIds),
          inArray(inventoryGrnLines.batchNo, batchNos),
          sql`${inventoryGrnLines.expiryDate} IS NOT NULL`,
        ),
      )
      .groupBy(inventoryGrnLines.itemId, inventoryGrnLines.batchNo);
    for (const r of rows) {
      if (r.itemId && r.batchNo && r.expiryDate) {
        out.set(`${r.itemId}|${r.batchNo}`, r.expiryDate);
      }
    }
    return out;
  }

  async ledger(filter: StockLedgerFilter) {
    const conds = [eq(stockLedger.tenantId, this.tenantId)];
    if (filter.itemId) conds.push(eq(stockLedger.itemId, filter.itemId));
    if (filter.warehouseId) conds.push(eq(stockLedger.warehouseId, filter.warehouseId));
    if (filter.movementType) conds.push(eq(stockLedger.movementType, filter.movementType));
    if (filter.from) conds.push(gte(stockLedger.movedAt, new Date(filter.from)));
    if (filter.to) conds.push(lte(stockLedger.movedAt, new Date(filter.to)));

    const offset = (filter.page - 1) * filter.limit;
    const rows = await this.db
      .select({
        ledger: stockLedger,
        itemName: items.name,
        itemSku: items.sku,
        warehouseName: warehouses.name,
      })
      .from(stockLedger)
      .innerJoin(items, eq(items.id, stockLedger.itemId))
      .innerJoin(warehouses, eq(warehouses.id, stockLedger.warehouseId))
      .where(and(...conds))
      .orderBy(desc(stockLedger.movedAt), desc(stockLedger.postedAt))
      .limit(filter.limit)
      .offset(offset);

    return rows.map((r) => ({
      ...r.ledger,
      qtyIn: Number(r.ledger.qtyIn),
      qtyOut: Number(r.ledger.qtyOut),
      unitCost: Number(r.ledger.unitCost),
      runningQty: Number(r.ledger.runningQty),
      runningValue: Number(r.ledger.runningValue),
      itemName: r.itemName,
      itemSku: r.itemSku,
      warehouseName: r.warehouseName,
    }));
  }

  /** Per-item stock view — used by item detail page. */
  async byItem(itemId: string) {
    const [item] = await this.db
      .select({ id: items.id, name: items.name, sku: items.sku, unit: items.unit })
      .from(items)
      .where(and(eq(items.id, itemId), eq(items.tenantId, this.tenantId)))
      .limit(1);
    if (!item) throw new NotFoundError('Item');

    const rows = await this.db
      .select({
        warehouseId: stockOnHand.warehouseId,
        batchNo: stockOnHand.batchNo,
        qty: stockOnHand.qty,
        avgCost: stockOnHand.avgCost,
        value: stockOnHand.value,
        lastMovementAt: stockOnHand.lastMovementAt,
        warehouseName: warehouses.name,
      })
      .from(stockOnHand)
      .innerJoin(warehouses, eq(warehouses.id, stockOnHand.warehouseId))
      .where(and(eq(stockOnHand.tenantId, this.tenantId), eq(stockOnHand.itemId, itemId)))
      .orderBy(asc(warehouses.name));

    return {
      item,
      onHand: rows.map((r) => ({
        ...r,
        qty: Number(r.qty),
        avgCost: Number(r.avgCost),
        value: Number(r.value),
      })),
    };
  }

  /** Barcode lookup for mobile scan. Returns the item or null. */
  async findByBarcode(code: string) {
    const [row] = await this.db
      .select()
      .from(items)
      .where(and(eq(items.tenantId, this.tenantId), eq(items.barcode, code)))
      .limit(1);
    return row ?? null;
  }
}
