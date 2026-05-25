import { sql } from 'drizzle-orm';
import type { Db } from '@runq/db';

export class InventoryDashboardService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  async kpis() {
    const today = new Date().toISOString().slice(0, 10);
    const result = await this.db.execute(sql`
      WITH on_hand AS (
        SELECT SUM(value) AS total_value,
               COUNT(*) FILTER (WHERE qty > 0) AS active_rows,
               COUNT(DISTINCT item_id) FILTER (WHERE qty > 0) AS active_items
        FROM stock_on_hand WHERE tenant_id = ${this.tenantId}
      ),
      warehouses_active AS (
        SELECT COUNT(*)::int AS cnt FROM warehouses
        WHERE tenant_id = ${this.tenantId} AND is_active = TRUE AND deleted_at IS NULL
      ),
      low_stock AS (
        SELECT COUNT(*)::int AS cnt FROM (
          SELECT soh.item_id
          FROM stock_on_hand soh
          INNER JOIN items i ON i.id = soh.item_id
          WHERE soh.tenant_id = ${this.tenantId}
            AND i.reorder_level IS NOT NULL
          GROUP BY soh.item_id, i.reorder_level
          HAVING SUM(soh.qty) <= i.reorder_level
        ) x
      ),
      expiring_soon AS (
        SELECT COUNT(*)::int AS cnt FROM (
          SELECT DISTINCT soh.item_id, soh.batch_no
          FROM stock_on_hand soh
          INNER JOIN inventory_grn_lines gl
            ON gl.tenant_id = soh.tenant_id
           AND gl.item_id = soh.item_id
           AND gl.batch_no = soh.batch_no
          WHERE soh.tenant_id = ${this.tenantId}
            AND soh.qty > 0
            AND gl.expiry_date IS NOT NULL
            AND gl.expiry_date <= CURRENT_DATE + INTERVAL '30 days'
            AND gl.expiry_date >= CURRENT_DATE
        ) x
      ),
      dead_stock AS (
        SELECT COUNT(*)::int AS cnt FROM (
          SELECT soh.item_id, soh.warehouse_id, soh.batch_no,
                 MAX(sl.moved_at) AS last_at
          FROM stock_on_hand soh
          LEFT JOIN stock_ledger sl
            ON sl.tenant_id = soh.tenant_id
           AND sl.item_id = soh.item_id
           AND sl.warehouse_id = soh.warehouse_id
           AND COALESCE(sl.batch_no, '') = soh.batch_no
          WHERE soh.tenant_id = ${this.tenantId} AND soh.qty > 0
          GROUP BY soh.item_id, soh.warehouse_id, soh.batch_no
          HAVING MAX(sl.moved_at) IS NULL
             OR (CURRENT_DATE - MAX(sl.moved_at)::date) >= 90
        ) x
      ),
      today_grns AS (
        SELECT COUNT(*)::int AS cnt FROM inventory_grns
        WHERE tenant_id = ${this.tenantId}
          AND received_date = ${today} AND status = 'posted'
      ),
      today_dns AS (
        SELECT COUNT(*)::int AS cnt FROM delivery_notes
        WHERE tenant_id = ${this.tenantId}
          AND dispatch_date = ${today} AND status = 'dispatched'
      ),
      month_in AS (
        SELECT COALESCE(SUM(qty_in * unit_cost), 0) AS v FROM stock_ledger
        WHERE tenant_id = ${this.tenantId}
          AND moved_at >= date_trunc('month', CURRENT_DATE)
      ),
      month_out AS (
        SELECT COALESCE(SUM(qty_out * unit_cost), 0) AS v FROM stock_ledger
        WHERE tenant_id = ${this.tenantId}
          AND moved_at >= date_trunc('month', CURRENT_DATE)
      ),
      in_transit AS (
        SELECT COUNT(*)::int AS cnt FROM inventory_transfers
        WHERE tenant_id = ${this.tenantId} AND status = 'in_transit'
      ),
      -- Total receipt value posted today. Used on the mobile redesign's
      -- Home + Moves hub "Today In" tile alongside the count above.
      today_grns_value AS (
        SELECT COALESCE(SUM(total_value), 0) AS v FROM inventory_grns
        WHERE tenant_id = ${this.tenantId}
          AND received_date = ${today} AND status = 'posted'
      ),
      -- Total dispatched value posted today (DN status 'dispatched').
      today_dns_value AS (
        SELECT COALESCE(SUM(total_value), 0) AS v FROM delivery_notes
        WHERE tenant_id = ${this.tenantId}
          AND dispatch_date = ${today} AND status = 'dispatched'
      ),
      -- Adjustments awaiting approval. Drives the "Pending" badge on the
      -- Moves hub and the warning chip on Home.
      pending_adj AS (
        SELECT COUNT(*)::int AS cnt FROM inventory_adjustments
        WHERE tenant_id = ${this.tenantId} AND status = 'pending_approval'
      )
      SELECT
        COALESCE((SELECT total_value FROM on_hand), 0)::text AS total_value,
        COALESCE((SELECT active_rows FROM on_hand), 0)::int AS active_rows,
        COALESCE((SELECT active_items FROM on_hand), 0)::int AS active_items,
        (SELECT cnt FROM warehouses_active) AS warehouse_count,
        (SELECT cnt FROM low_stock) AS low_stock,
        (SELECT cnt FROM expiring_soon) AS expiring_soon,
        (SELECT cnt FROM dead_stock) AS dead_stock,
        (SELECT cnt FROM today_grns) AS today_grns,
        (SELECT cnt FROM today_dns) AS today_dns,
        (SELECT v FROM month_in)::text AS month_in_value,
        (SELECT v FROM month_out)::text AS month_out_value,
        (SELECT cnt FROM in_transit) AS in_transit_transfers,
        (SELECT v FROM today_grns_value)::text AS today_grns_value,
        (SELECT v FROM today_dns_value)::text AS today_dns_value,
        (SELECT cnt FROM pending_adj) AS pending_adj
    `);
    const row = (result as unknown as {
      rows: Array<{
        total_value: string; active_rows: number; active_items: number;
        warehouse_count: number; low_stock: number; expiring_soon: number;
        dead_stock: number; today_grns: number; today_dns: number;
        month_in_value: string; month_out_value: string; in_transit_transfers: number;
        today_grns_value: string; today_dns_value: string; pending_adj: number;
      }>;
    }).rows[0]!;
    return {
      totalValue: Number(row.total_value ?? 0),
      activeRows: row.active_rows ?? 0,
      activeItems: row.active_items ?? 0,
      warehouseCount: row.warehouse_count ?? 0,
      lowStockCount: row.low_stock ?? 0,
      expiringSoonCount: row.expiring_soon ?? 0,
      deadStockCount: row.dead_stock ?? 0,
      todayGrns: row.today_grns ?? 0,
      todayDeliveries: row.today_dns ?? 0,
      monthInValue: Number(row.month_in_value ?? 0),
      monthOutValue: Number(row.month_out_value ?? 0),
      inTransitTransfers: row.in_transit_transfers ?? 0,
      todayGrnsValue: Number(row.today_grns_value ?? 0),
      todayDnsValue: Number(row.today_dns_value ?? 0),
      pendingAdjustments: row.pending_adj ?? 0,
    };
  }

  /** Recent activity feed — last N ledger movements with labels. */
  async recentActivity(limit = 8) {
    const result = await this.db.execute(sql`
      SELECT
        sl.id,
        sl.movement_type::text AS movement_type,
        sl.source_type,
        sl.source_id,
        sl.qty_in::text AS qty_in,
        sl.qty_out::text AS qty_out,
        sl.moved_at,
        i.name AS item_name,
        i.sku AS item_sku,
        i.unit AS item_unit,
        w.name AS warehouse_name
      FROM stock_ledger sl
      INNER JOIN items i ON i.id = sl.item_id
      INNER JOIN warehouses w ON w.id = sl.warehouse_id
      WHERE sl.tenant_id = ${this.tenantId}
      ORDER BY sl.moved_at DESC, sl.posted_at DESC
      LIMIT ${limit}
    `);
    return (result as unknown as {
      rows: Array<{
        id: string; movement_type: string; source_type: string; source_id: string;
        qty_in: string; qty_out: string; moved_at: string;
        item_name: string; item_sku: string | null; item_unit: string | null;
        warehouse_name: string;
      }>;
    }).rows.map((r) => ({
      id: r.id,
      movementType: r.movement_type,
      sourceType: r.source_type,
      sourceId: r.source_id,
      qtyIn: Number(r.qty_in),
      qtyOut: Number(r.qty_out),
      movedAt: r.moved_at,
      itemName: r.item_name,
      itemSku: r.item_sku,
      itemUnit: r.item_unit,
      warehouseName: r.warehouse_name,
    }));
  }

  /** Per-warehouse value breakdown for the dashboard pie/chart. */
  async warehouseBreakdown() {
    const result = await this.db.execute(sql`
      SELECT
        w.id, w.name, w.code,
        COALESCE(SUM(soh.value), 0)::text AS total_value,
        COUNT(DISTINCT soh.item_id) FILTER (WHERE soh.qty > 0)::int AS item_count
      FROM warehouses w
      LEFT JOIN stock_on_hand soh
        ON soh.warehouse_id = w.id AND soh.tenant_id = w.tenant_id
      WHERE w.tenant_id = ${this.tenantId}
        AND w.is_active = TRUE AND w.deleted_at IS NULL
      GROUP BY w.id, w.name, w.code
      ORDER BY total_value DESC
    `);
    return (result as unknown as {
      rows: Array<{ id: string; name: string; code: string; total_value: string; item_count: number }>;
    }).rows.map((r) => ({
      id: r.id, name: r.name, code: r.code,
      totalValue: Number(r.total_value), itemCount: r.item_count,
    }));
  }
}
