import { and, asc, count, desc, eq } from 'drizzle-orm';
import type { Db } from '@runq/db';
import { inventorySerials, items, warehouses } from '@runq/db';
import type { SerialLookupFilter } from '@runq/validators';
import { NotFoundError } from '../../utils/errors';

/**
 * Minimal serial-tracking surface for Phase 3 — lookup by serial number
 * (warranty / RMA flow) and list-by-filters. Capture on GRN and
 * transition on DN dispatch land in Phase 4 alongside the mobile
 * scan-driven flows.
 */
export class SerialService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  /** Lookup-by-serial — case-insensitive on the way in. */
  async findBySerial(serialNo: string) {
    const [row] = await this.db
      .select({
        s: inventorySerials,
        itemName: items.name,
        itemSku: items.sku,
        warehouseName: warehouses.name,
      })
      .from(inventorySerials)
      .innerJoin(items, eq(items.id, inventorySerials.itemId))
      .leftJoin(warehouses, eq(warehouses.id, inventorySerials.currentWarehouseId))
      .where(
        and(
          eq(inventorySerials.tenantId, this.tenantId),
          eq(inventorySerials.serialNo, serialNo),
        ),
      )
      .limit(1);
    if (!row) throw new NotFoundError('Serial');
    return { ...row.s, itemName: row.itemName, itemSku: row.itemSku, warehouseName: row.warehouseName };
  }

  async list(filter: SerialLookupFilter) {
    const conds = [eq(inventorySerials.tenantId, this.tenantId)];
    if (filter.itemId) conds.push(eq(inventorySerials.itemId, filter.itemId));
    if (filter.status) conds.push(eq(inventorySerials.currentStatus, filter.status));
    if (filter.warehouseId) conds.push(eq(inventorySerials.currentWarehouseId, filter.warehouseId));

    const offset = (filter.page - 1) * filter.limit;
    const where = and(...conds)!;
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({
          s: inventorySerials,
          itemName: items.name,
          itemSku: items.sku,
          warehouseName: warehouses.name,
        })
        .from(inventorySerials)
        .innerJoin(items, eq(items.id, inventorySerials.itemId))
        .leftJoin(warehouses, eq(warehouses.id, inventorySerials.currentWarehouseId))
        .where(where)
        .orderBy(desc(inventorySerials.updatedAt), asc(inventorySerials.serialNo))
        .limit(filter.limit)
        .offset(offset),
      this.db.select({ total: count() }).from(inventorySerials).where(where),
    ]);

    return {
      data: rows.map((r) => ({
        ...r.s, itemName: r.itemName, itemSku: r.itemSku, warehouseName: r.warehouseName,
      })),
      page: filter.page,
      limit: filter.limit,
      total,
      totalPages: Math.ceil(total / filter.limit),
    };
  }
}
