import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '@runq/db';
import { reorderRules, items, warehouses } from '@runq/db';
import type { UpsertReorderRuleInput, ExpiryFilter } from '@runq/validators';

export class ReorderService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  /** All rules (item + warehouse + reorder fields), joined with names. */
  async list() {
    return this.db
      .select({
        r: reorderRules,
        itemName: items.name, itemSku: items.sku, warehouseName: warehouses.name,
      })
      .from(reorderRules)
      .innerJoin(items, eq(items.id, reorderRules.itemId))
      .innerJoin(warehouses, eq(warehouses.id, reorderRules.warehouseId))
      .where(eq(reorderRules.tenantId, this.tenantId));
  }

  async upsert(input: UpsertReorderRuleInput) {
    const result = await this.db.execute(sql`
      INSERT INTO inventory_reorder_rules (
        tenant_id, item_id, warehouse_id, reorder_level, reorder_qty, lead_time_days
      ) VALUES (
        ${this.tenantId}, ${input.itemId}, ${input.warehouseId},
        ${input.reorderLevel}, ${input.reorderQty}, ${input.leadTimeDays ?? null}
      )
      ON CONFLICT (tenant_id, item_id, warehouse_id) DO UPDATE SET
        reorder_level = EXCLUDED.reorder_level,
        reorder_qty = EXCLUDED.reorder_qty,
        lead_time_days = EXCLUDED.lead_time_days,
        updated_at = NOW()
      RETURNING *
    `);
    const rows = (result as unknown as { rows: unknown[] }).rows;
    return rows[0];
  }

  async remove(itemId: string, warehouseId: string) {
    await this.db
      .delete(reorderRules)
      .where(
        and(
          eq(reorderRules.tenantId, this.tenantId),
          eq(reorderRules.itemId, itemId),
          eq(reorderRules.warehouseId, warehouseId),
        ),
      );
    return { ok: true };
  }

  /**
   * Reorder alerts: rows where on-hand for (item, warehouse) is at or below
   * the effective reorder level. The effective level prefers the per-
   * warehouse rule, then falls back to the item-level reorder_level.
   */
  async alerts() {
    const result = await this.db.execute(sql`
      WITH on_hand AS (
        SELECT item_id, warehouse_id, SUM(qty) AS qty
        FROM stock_on_hand
        WHERE tenant_id = ${this.tenantId}
        GROUP BY item_id, warehouse_id
      ),
      effective AS (
        SELECT
          i.id AS item_id,
          w.id AS warehouse_id,
          i.name AS item_name,
          i.sku AS item_sku,
          i.unit AS item_unit,
          w.name AS warehouse_name,
          COALESCE(rr.reorder_level, i.reorder_level) AS reorder_level,
          COALESCE(rr.reorder_qty, i.reorder_qty) AS reorder_qty,
          rr.lead_time_days
        FROM items i
        CROSS JOIN warehouses w
        LEFT JOIN inventory_reorder_rules rr
          ON rr.tenant_id = i.tenant_id
         AND rr.item_id = i.id
         AND rr.warehouse_id = w.id
        WHERE i.tenant_id = ${this.tenantId}
          AND w.tenant_id = ${this.tenantId}
          AND i.is_active = TRUE
          AND w.is_active = TRUE
          AND COALESCE(rr.reorder_level, i.reorder_level) IS NOT NULL
      )
      SELECT
        e.item_id, e.warehouse_id, e.item_name, e.item_sku, e.item_unit,
        e.warehouse_name,
        e.reorder_level::text AS reorder_level,
        e.reorder_qty::text AS reorder_qty,
        e.lead_time_days,
        COALESCE(o.qty, 0)::text AS on_hand
      FROM effective e
      LEFT JOIN on_hand o
        ON o.item_id = e.item_id AND o.warehouse_id = e.warehouse_id
      WHERE COALESCE(o.qty, 0) <= e.reorder_level
      ORDER BY (COALESCE(o.qty, 0) / NULLIF(e.reorder_level, 0)) ASC, e.item_name ASC
    `);
    const rows = (result as unknown as {
      rows: Array<{
        item_id: string; warehouse_id: string; item_name: string; item_sku: string | null;
        item_unit: string | null; warehouse_name: string;
        reorder_level: string; reorder_qty: string; lead_time_days: number | null;
        on_hand: string;
      }>;
    }).rows;
    return rows.map((r) => ({
      itemId: r.item_id, warehouseId: r.warehouse_id,
      itemName: r.item_name, itemSku: r.item_sku, itemUnit: r.item_unit,
      warehouseName: r.warehouse_name,
      reorderLevel: Number(r.reorder_level),
      reorderQty: Number(r.reorder_qty),
      leadTimeDays: r.lead_time_days,
      onHand: Number(r.on_hand),
      shortBy: Math.max(0, Number(r.reorder_level) - Number(r.on_hand)),
    }));
  }

  /**
   * Batch expiry list — batches expiring within N days from any GRN that
   * brought them in. Joined back to current on-hand so we don't surface
   * batches that have already been fully dispatched.
   */
  async expiring(filter: ExpiryFilter) {
    const includeExpired = filter.includeExpired ?? false;
    const warehouseCond = filter.warehouseId
      ? sql`AND soh.warehouse_id = ${filter.warehouseId}`
      : sql``;
    const expiredCond = includeExpired
      ? sql``
      : sql`AND be.expiry_date >= CURRENT_DATE`;
    const result = await this.db.execute(sql`
      WITH batch_expiry AS (
        SELECT item_id, batch_no, MIN(expiry_date) AS expiry_date
        FROM inventory_grn_lines
        WHERE tenant_id = ${this.tenantId}
          AND batch_no IS NOT NULL
          AND expiry_date IS NOT NULL
        GROUP BY item_id, batch_no
      )
      SELECT
        soh.item_id, soh.warehouse_id, soh.batch_no,
        soh.qty::text AS qty, soh.value::text AS value,
        i.name AS item_name, i.sku AS item_sku, i.unit AS item_unit,
        w.name AS warehouse_name,
        be.expiry_date::text AS expiry_date,
        (be.expiry_date - CURRENT_DATE) AS days_to_expiry
      FROM stock_on_hand soh
      INNER JOIN batch_expiry be
        ON be.item_id = soh.item_id AND be.batch_no = soh.batch_no
      INNER JOIN items i ON i.id = soh.item_id
      INNER JOIN warehouses w ON w.id = soh.warehouse_id
      WHERE soh.tenant_id = ${this.tenantId}
        AND soh.qty > 0
        AND be.expiry_date <= CURRENT_DATE + (${filter.withinDays} || ' days')::interval
        ${expiredCond}
        ${warehouseCond}
      ORDER BY be.expiry_date ASC, soh.qty DESC
    `);
    const rows = (result as unknown as {
      rows: Array<{
        item_id: string; warehouse_id: string; batch_no: string;
        qty: string; value: string;
        item_name: string; item_sku: string | null; item_unit: string | null;
        warehouse_name: string; expiry_date: string; days_to_expiry: number;
      }>;
    }).rows;
    return rows.map((r) => ({
      itemId: r.item_id, warehouseId: r.warehouse_id, batchNo: r.batch_no,
      qty: Number(r.qty), value: Number(r.value),
      itemName: r.item_name, itemSku: r.item_sku, itemUnit: r.item_unit,
      warehouseName: r.warehouse_name,
      expiryDate: r.expiry_date,
      daysToExpiry: r.days_to_expiry,
    }));
  }
}
