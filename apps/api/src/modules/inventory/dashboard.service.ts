import { sql } from 'drizzle-orm';
import type { Db } from '@runq/db';
import { ITEM_CLASS_GROUP_MEMBERS, type ItemClassGroup } from '@runq/validators';
import { alertBaseCte } from './stock-alert.sql';
import { IST } from '../manufacturing/mfg-day.js';

export class InventoryDashboardService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  async kpis() {
    // Every "today"/"this month" window below is an IST calendar window, not a
    // server-clock one. See mfg-day.ts: a bare CURRENT_DATE is Asia/Kolkata
    // locally but UTC on Railway, where a 4am dispatch files under yesterday.
    const istToday = sql`(now() AT TIME ZONE ${IST})::date`;
    const istDay = sql`(sl.moved_at AT TIME ZONE ${IST})::date`;
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
      -- Low + out-of-stock share ONE definition with the alerts list (see
      -- stock-alert.sql). Counting them differently here is what made the
      -- hero tile disagree with the screen it links to: this used to ignore
      -- per-warehouse reorder rules and count per item rather than per
      -- item+warehouse.
      ${alertBaseCte(this.tenantId)},
      low_stock AS (
        SELECT COUNT(*)::int AS cnt FROM alert_base WHERE status = 'low'
      ),
      out_of_stock AS (
        SELECT COUNT(*)::int AS cnt FROM alert_base WHERE status = 'out'
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
      -- Today's movement, read off the ledger rather than off GRN and DN
      -- documents. Stock arrives from milk receipts, production output and
      -- adjustments too — a plant that never raises a GRN was reading a
      -- permanent "0 in" while the ledger showed lakhs moving. The count is
      -- distinct source documents, so one GRN of 20 lines counts once.
      today_in AS (
        SELECT COUNT(DISTINCT (sl.source_type, sl.source_id))::int AS cnt,
               COALESCE(SUM(sl.qty_in * sl.unit_cost), 0) AS v
        FROM stock_ledger sl
        WHERE sl.tenant_id = ${this.tenantId}
          AND sl.qty_in > 0 AND ${istDay} = ${istToday}
      ),
      today_out AS (
        SELECT COUNT(DISTINCT (sl.source_type, sl.source_id))::int AS cnt,
               COALESCE(SUM(sl.qty_out * sl.unit_cost), 0) AS v
        FROM stock_ledger sl
        WHERE sl.tenant_id = ${this.tenantId}
          AND sl.qty_out > 0 AND ${istDay} = ${istToday}
      ),
      month_in AS (
        SELECT COALESCE(SUM(sl.qty_in * sl.unit_cost), 0) AS v FROM stock_ledger sl
        WHERE sl.tenant_id = ${this.tenantId}
          AND ${istDay} >= date_trunc('month', ${istToday})
      ),
      month_out AS (
        SELECT COALESCE(SUM(sl.qty_out * sl.unit_cost), 0) AS v FROM stock_ledger sl
        WHERE sl.tenant_id = ${this.tenantId}
          AND ${istDay} >= date_trunc('month', ${istToday})
      ),
      in_transit AS (
        SELECT COUNT(*)::int AS cnt FROM inventory_transfers
        WHERE tenant_id = ${this.tenantId} AND status = 'in_transit'
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
        (SELECT cnt FROM out_of_stock) AS out_of_stock,
        (SELECT cnt FROM expiring_soon) AS expiring_soon,
        (SELECT cnt FROM dead_stock) AS dead_stock,
        (SELECT cnt FROM today_in) AS today_in_count,
        (SELECT cnt FROM today_out) AS today_out_count,
        (SELECT v FROM month_in)::text AS month_in_value,
        (SELECT v FROM month_out)::text AS month_out_value,
        (SELECT cnt FROM in_transit) AS in_transit_transfers,
        (SELECT v FROM today_in)::text AS today_in_value,
        (SELECT v FROM today_out)::text AS today_out_value,
        (SELECT cnt FROM pending_adj) AS pending_adj
    `);
    const row = (result as unknown as {
      rows: Array<{
        total_value: string; active_rows: number; active_items: number;
        warehouse_count: number; low_stock: number; out_of_stock: number;
        expiring_soon: number;
        dead_stock: number; today_in_count: number; today_out_count: number;
        month_in_value: string; month_out_value: string; in_transit_transfers: number;
        today_in_value: string; today_out_value: string; pending_adj: number;
      }>;
    }).rows[0]!;
    return {
      totalValue: Number(row.total_value ?? 0),
      activeRows: row.active_rows ?? 0,
      activeItems: row.active_items ?? 0,
      warehouseCount: row.warehouse_count ?? 0,
      lowStockCount: row.low_stock ?? 0,
      outOfStockCount: row.out_of_stock ?? 0,
      expiringSoonCount: row.expiring_soon ?? 0,
      deadStockCount: row.dead_stock ?? 0,
      todayInCount: row.today_in_count ?? 0,
      todayOutCount: row.today_out_count ?? 0,
      monthInValue: Number(row.month_in_value ?? 0),
      monthOutValue: Number(row.month_out_value ?? 0),
      inTransitTransfers: row.in_transit_transfers ?? 0,
      todayInValue: Number(row.today_in_value ?? 0),
      todayOutValue: Number(row.today_out_value ?? 0),
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

  /**
   * Stock highlights for the home screens — the N item lines in a class
   * bucket that moved most recently. Drives the "Finished goods" and "Raw
   * materials available" strips.
   *
   * Ordered by last movement rather than the item master's created_at: after
   * a production run the interesting rows are the goods that just landed, not
   * catalogue entries created months ago. Batches are collapsed to one row
   * per item so a 12-batch SKU doesn't crowd out the rest of the list.
   */
  async stockHighlights(group: ItemClassGroup, limit = 5) {
    const classes = ITEM_CLASS_GROUP_MEMBERS[group];
    const classFilter = group === 'all'
      ? sql`TRUE`
      : sql`i.item_class IN (${sql.join(classes.map((c) => sql`${c}`), sql`, `)})`;
    const result = await this.db.execute(sql`
      SELECT
        i.id, i.name, i.sku, i.unit, i.item_class::text AS item_class,
        i.reorder_level::text AS reorder_level,
        SUM(soh.qty)::text AS qty,
        SUM(soh.value)::text AS value,
        MAX(soh.last_movement_at) AS last_movement_at
      FROM stock_on_hand soh
      INNER JOIN items i ON i.id = soh.item_id
      WHERE soh.tenant_id = ${this.tenantId}
        AND soh.qty > 0
        AND ${classFilter}
      GROUP BY i.id, i.name, i.sku, i.unit, i.item_class, i.reorder_level
      ORDER BY MAX(soh.last_movement_at) DESC NULLS LAST
      LIMIT ${limit}
    `);
    return (result as unknown as {
      rows: Array<{
        id: string; name: string; sku: string | null; unit: string | null;
        item_class: string | null; reorder_level: string | null;
        qty: string; value: string; last_movement_at: string | null;
      }>;
    }).rows.map((r) => ({
      itemId: r.id,
      name: r.name,
      sku: r.sku,
      unit: r.unit,
      itemClass: r.item_class,
      qty: Number(r.qty),
      value: Number(r.value),
      reorderLevel: r.reorder_level === null ? null : Number(r.reorder_level),
      // pg hands back 'YYYY-MM-DD HH:MM:SS+05:30' for the aggregate. Node
      // parses that, but Safari and Dart's DateTime.parse are stricter about
      // the space separator — normalise to ISO so both clients agree.
      lastMovementAt: r.last_movement_at === null
        ? null
        : new Date(r.last_movement_at).toISOString(),
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
