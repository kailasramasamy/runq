import { and, asc, eq, sql } from 'drizzle-orm';
import type { Db } from '@runq/db';
import { warehouses, stockLedger } from '@runq/db';
import type { CreateWarehouseInput, UpdateWarehouseInput } from '@runq/validators';
import { ConflictError, NotFoundError } from '../../utils/errors';

export class WarehouseService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  async list() {
    return this.db
      .select()
      .from(warehouses)
      .where(and(eq(warehouses.tenantId, this.tenantId), sql`${warehouses.deletedAt} IS NULL`))
      .orderBy(asc(warehouses.name));
  }

  async get(id: string) {
    const [row] = await this.db
      .select()
      .from(warehouses)
      .where(and(eq(warehouses.id, id), eq(warehouses.tenantId, this.tenantId)))
      .limit(1);
    if (!row) throw new NotFoundError('Warehouse');
    return row;
  }

  async create(input: CreateWarehouseInput) {
    const [dup] = await this.db
      .select({ id: warehouses.id })
      .from(warehouses)
      .where(and(eq(warehouses.tenantId, this.tenantId), eq(warehouses.code, input.code)))
      .limit(1);
    if (dup) throw new ConflictError('Warehouse code already exists');

    return this.db.transaction(async (tx) => {
      if (input.isDefault) {
        await tx
          .update(warehouses)
          .set({ isDefault: false })
          .where(eq(warehouses.tenantId, this.tenantId));
      }
      const [row] = await tx
        .insert(warehouses)
        .values({
          tenantId: this.tenantId,
          code: input.code,
          name: input.name,
          type: input.type,
          address: input.address ?? null,
          isDefault: input.isDefault ?? false,
          isActive: input.isActive ?? true,
        })
        .returning();
      return row!;
    });
  }

  async update(id: string, input: UpdateWarehouseInput) {
    return this.db.transaction(async (tx) => {
      if (input.isDefault) {
        await tx
          .update(warehouses)
          .set({ isDefault: false })
          .where(eq(warehouses.tenantId, this.tenantId));
      }
      const [row] = await tx
        .update(warehouses)
        .set({ ...input, updatedAt: new Date() })
        .where(and(eq(warehouses.id, id), eq(warehouses.tenantId, this.tenantId)))
        .returning();
      if (!row) throw new NotFoundError('Warehouse');
      return row;
    });
  }

  /** Soft delete — blocked once any ledger row references the warehouse. */
  async remove(id: string) {
    const [used] = await this.db
      .select({ id: stockLedger.id })
      .from(stockLedger)
      .where(and(eq(stockLedger.tenantId, this.tenantId), eq(stockLedger.warehouseId, id)))
      .limit(1);
    if (used) throw new ConflictError('Warehouse has stock movements and cannot be deleted');

    const [row] = await this.db
      .update(warehouses)
      .set({ deletedAt: new Date(), isActive: false })
      .where(and(eq(warehouses.id, id), eq(warehouses.tenantId, this.tenantId)))
      .returning();
    if (!row) throw new NotFoundError('Warehouse');
    return row;
  }

  /** Quick on-hand summary used by the detail page. */
  async stockSummary(id: string) {
    await this.get(id);
    const result = await this.db.execute(sql`
      SELECT
        COUNT(DISTINCT soh.item_id)::int AS sku_count,
        COALESCE(SUM(soh.qty), 0)::text AS total_qty,
        COALESCE(SUM(soh.value), 0)::text AS total_value
      FROM stock_on_hand soh
      WHERE soh.tenant_id = ${this.tenantId}
        AND soh.warehouse_id = ${id}
        AND soh.qty <> 0
    `);
    const row = (result as unknown as { rows: Array<{ sku_count: number; total_qty: string; total_value: string }> }).rows[0];
    return {
      skuCount: row?.sku_count ?? 0,
      totalQty: Number(row?.total_qty ?? 0),
      totalValue: Number(row?.total_value ?? 0),
    };
  }
}
