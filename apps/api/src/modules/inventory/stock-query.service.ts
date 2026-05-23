import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import type { Db } from '@runq/db';
import {
  stockOnHand, stockLedger, items, warehouses,
} from '@runq/db';
import type { StockOnHandFilter, StockLedgerFilter } from '@runq/validators';
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
    return filtered.map((r) => ({
      ...r,
      qty: Number(r.qty),
      avgCost: Number(r.avgCost),
      value: Number(r.value),
      reorderLevel: r.reorderLevel ? Number(r.reorderLevel) : null,
    }));
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
