/**
 * Inventory reports — pure read-only SQL aggregations over the existing
 * stock_ledger + stock_on_hand + masters tables. Designed for SME
 * volumes; no materialised views in v1.
 */

import { sql } from 'drizzle-orm';
import type { Db } from '@runq/db';
import { writeOffReasonSchema } from '@runq/validators';
import type {
  StockSummaryFilter, ValuationFilter, AgeingFilter,
  MovementSummaryFilter, DeadStockFilter, WriteOffFilter,
} from '@runq/validators';

interface QueryResult<T> { rows: T[] }

export class ReportsService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  /** Per-item totals across warehouses + batches. */
  async stockSummary(filter: StockSummaryFilter) {
    const whCond = filter.warehouseId
      ? sql`AND soh.warehouse_id = ${filter.warehouseId}`
      : sql``;
    // Two filter shapes: explicit categoryId (UUID), or the legacy
    // category-name string resolved via a scalar subquery on categories.
    // Items no longer carries the denormalized name (migration 0113).
    const catCond = filter.categoryId
      ? sql`AND i.category_id = ${filter.categoryId}`
      : filter.category
        ? sql`AND i.category_id = (
            SELECT id FROM categories
            WHERE tenant_id = ${this.tenantId} AND parent_id IS NULL AND name = ${filter.category}
            LIMIT 1
          )`
        : sql``;
    // Category display string comes off the joined tree — leaf rows show
    // parent.name; root rows show their own name. Mirrors the toItem()
    // derivation in masters/item.service.ts.
    const result = await this.db.execute(sql`
      SELECT
        i.id AS item_id,
        i.name AS item_name,
        i.sku AS item_sku,
        i.unit AS item_unit,
        i.item_class AS item_class,
        COALESCE(p.name, c.name) AS category,
        SUM(soh.qty)::text AS total_qty,
        SUM(soh.value)::text AS total_value,
        COUNT(DISTINCT soh.warehouse_id)::int AS wh_count,
        COUNT(DISTINCT NULLIF(soh.batch_no, ''))::int AS batch_count
      FROM stock_on_hand soh
      INNER JOIN items i ON i.id = soh.item_id
      LEFT JOIN categories c ON c.id = i.category_id
      LEFT JOIN categories p ON p.id = c.parent_id
      WHERE soh.tenant_id = ${this.tenantId}
        AND soh.qty <> 0
        ${whCond}
        ${catCond}
      GROUP BY i.id, i.name, i.sku, i.unit, i.item_class, COALESCE(p.name, c.name)
      ORDER BY SUM(soh.value) DESC NULLS LAST, i.name ASC
    `) as unknown as QueryResult<{
      item_id: string; item_name: string; item_sku: string | null;
      item_unit: string | null; item_class: string | null; category: string | null;
      total_qty: string; total_value: string;
      wh_count: number; batch_count: number;
    }>;
    return result.rows.map((r) => ({
      itemId: r.item_id,
      itemName: r.item_name,
      itemSku: r.item_sku,
      itemUnit: r.item_unit,
      itemClass: r.item_class,
      category: r.category,
      totalQty: Number(r.total_qty ?? 0),
      totalValue: Number(r.total_value ?? 0),
      warehouseCount: r.wh_count,
      batchCount: r.batch_count,
    }));
  }

  /**
   * As-of-date valuation. For each (item, warehouse, batch), uses the
   * latest ledger row whose moved_at ≤ asOf. running_qty and running_value
   * are denormalised on the ledger so this is a single scan + DISTINCT ON.
   */
  async valuation(filter: ValuationFilter) {
    const asOf = filter.asOf ?? new Date().toISOString().slice(0, 10);
    const whCond = filter.warehouseId
      ? sql`AND sl.warehouse_id = ${filter.warehouseId}`
      : sql``;
    const result = await this.db.execute(sql`
      WITH latest AS (
        SELECT DISTINCT ON (sl.item_id, sl.warehouse_id, COALESCE(sl.batch_no, ''))
          sl.item_id, sl.warehouse_id, COALESCE(sl.batch_no, '') AS batch_no,
          sl.running_qty, sl.running_value, sl.unit_cost, sl.moved_at
        FROM stock_ledger sl
        WHERE sl.tenant_id = ${this.tenantId}
          AND sl.moved_at <= ${asOf}::date + interval '1 day' - interval '1 second'
          ${whCond}
        ORDER BY sl.item_id, sl.warehouse_id, COALESCE(sl.batch_no, ''),
                 sl.moved_at DESC, sl.posted_at DESC
      )
      SELECT
        l.item_id, l.warehouse_id, l.batch_no,
        l.running_qty::text AS qty,
        l.running_value::text AS value,
        l.unit_cost::text AS avg_cost,
        i.name AS item_name, i.sku AS item_sku, i.unit AS item_unit,
        COALESCE(p.name, c.name) AS category,
        w.name AS warehouse_name
      FROM latest l
      INNER JOIN items i ON i.id = l.item_id
      LEFT JOIN categories c ON c.id = i.category_id
      LEFT JOIN categories p ON p.id = c.parent_id
      INNER JOIN warehouses w ON w.id = l.warehouse_id
      WHERE l.running_qty > 0
      ORDER BY l.running_value DESC NULLS LAST, i.name ASC
    `) as unknown as QueryResult<{
      item_id: string; warehouse_id: string; batch_no: string;
      qty: string; value: string; avg_cost: string;
      item_name: string; item_sku: string | null; item_unit: string | null;
      category: string | null; warehouse_name: string;
    }>;
    const rows = result.rows.map((r) => ({
      itemId: r.item_id,
      warehouseId: r.warehouse_id,
      batchNo: r.batch_no,
      qty: Number(r.qty ?? 0),
      value: Number(r.value ?? 0),
      avgCost: Number(r.avg_cost ?? 0),
      itemName: r.item_name,
      itemSku: r.item_sku,
      itemUnit: r.item_unit,
      category: r.category,
      warehouseName: r.warehouse_name,
    }));
    return {
      asOf,
      total: rows.reduce((s, r) => s + r.value, 0),
      rows,
    };
  }

  /**
   * Stock ageing — for each (item, warehouse, batch), find the most recent
   * inbound movement that the current on-hand cannot pre-date (i.e. when
   * the *currently held* qty was last replenished). Bucket the on-hand by
   * how old that movement is. Pragmatic FIFO-ish proxy that avoids cohort
   * tracking; accurate for items without partial-batch carryover.
   */
  async ageing(filter: AgeingFilter) {
    const whCond = filter.warehouseId
      ? sql`AND soh.warehouse_id = ${filter.warehouseId}`
      : sql``;
    const result = await this.db.execute(sql`
      WITH last_inbound AS (
        SELECT DISTINCT ON (item_id, warehouse_id, COALESCE(batch_no, ''))
          item_id, warehouse_id, COALESCE(batch_no, '') AS batch_no, moved_at
        FROM stock_ledger
        WHERE tenant_id = ${this.tenantId}
          AND qty_in > 0
        ORDER BY item_id, warehouse_id, COALESCE(batch_no, ''), moved_at DESC
      )
      SELECT
        soh.item_id, soh.warehouse_id, soh.batch_no,
        soh.qty::text AS qty, soh.value::text AS value,
        i.name AS item_name, i.sku AS item_sku, i.unit AS item_unit,
        w.name AS warehouse_name,
        li.moved_at::date AS last_inbound_date,
        (CURRENT_DATE - li.moved_at::date) AS age_days
      FROM stock_on_hand soh
      INNER JOIN items i ON i.id = soh.item_id
      INNER JOIN warehouses w ON w.id = soh.warehouse_id
      LEFT JOIN last_inbound li
        ON li.item_id = soh.item_id
       AND li.warehouse_id = soh.warehouse_id
       AND li.batch_no = soh.batch_no
      WHERE soh.tenant_id = ${this.tenantId}
        AND soh.qty > 0
        ${whCond}
      ORDER BY age_days DESC NULLS FIRST, soh.value DESC
    `) as unknown as QueryResult<{
      item_id: string; warehouse_id: string; batch_no: string;
      qty: string; value: string;
      item_name: string; item_sku: string | null; item_unit: string | null;
      warehouse_name: string;
      last_inbound_date: string | null; age_days: number | null;
    }>;

    type Row = {
      itemId: string; warehouseId: string; batchNo: string;
      qty: number; value: number; itemName: string;
      itemSku: string | null; itemUnit: string | null; warehouseName: string;
      lastInboundDate: string | null; ageDays: number | null; bucket: string;
    };
    const buckets = ['0-30', '31-60', '61-90', '91-180', '180+'] as const;
    function bucketFor(days: number | null): string {
      if (days == null) return '180+';
      if (days <= 30) return '0-30';
      if (days <= 60) return '31-60';
      if (days <= 90) return '61-90';
      if (days <= 180) return '91-180';
      return '180+';
    }

    const rows: Row[] = result.rows.map((r) => ({
      itemId: r.item_id,
      warehouseId: r.warehouse_id,
      batchNo: r.batch_no,
      qty: Number(r.qty ?? 0),
      value: Number(r.value ?? 0),
      itemName: r.item_name,
      itemSku: r.item_sku,
      itemUnit: r.item_unit,
      warehouseName: r.warehouse_name,
      lastInboundDate: r.last_inbound_date,
      ageDays: r.age_days,
      bucket: bucketFor(r.age_days),
    }));
    const totals: Record<string, { qty: number; value: number; count: number }> =
      Object.fromEntries(buckets.map((b) => [b, { qty: 0, value: 0, count: 0 }]));
    for (const r of rows) {
      totals[r.bucket]!.qty += r.qty;
      totals[r.bucket]!.value += r.value;
      totals[r.bucket]!.count += 1;
    }
    return { rows, totals, buckets };
  }

  /** Per-period IN / OUT totals across all items + warehouses. */
  async movementSummary(filter: MovementSummaryFilter) {
    const from = filter.from ?? new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    const to = filter.to ?? new Date().toISOString().slice(0, 10);
    const whCond = filter.warehouseId
      ? sql`AND warehouse_id = ${filter.warehouseId}`
      : sql``;
    // truncTo is enum-validated upstream to one of these three literals, so
    // inlining via sql.raw is safe and gets PG to match the GROUP BY
    // expression to the SELECT (parameter binding does not match here).
    const truncExpr = sql.raw(`date_trunc('${filter.groupBy}', moved_at)`);
    const result = await this.db.execute(sql`
      SELECT
        ${truncExpr}::date AS period,
        SUM(qty_in)::text AS qty_in,
        SUM(qty_out)::text AS qty_out,
        SUM(qty_in * unit_cost)::text AS value_in,
        SUM(qty_out * unit_cost)::text AS value_out,
        COUNT(*)::int AS movements
      FROM stock_ledger
      WHERE tenant_id = ${this.tenantId}
        AND moved_at >= ${from}::date
        AND moved_at < (${to}::date + interval '1 day')
        ${whCond}
      GROUP BY ${truncExpr}
      ORDER BY period ASC
    `) as unknown as QueryResult<{
      period: string; qty_in: string; qty_out: string;
      value_in: string; value_out: string; movements: number;
    }>;
    return {
      from, to, groupBy: filter.groupBy,
      rows: result.rows.map((r) => ({
        period: r.period,
        qtyIn: Number(r.qty_in ?? 0),
        qtyOut: Number(r.qty_out ?? 0),
        valueIn: Number(r.value_in ?? 0),
        valueOut: Number(r.value_out ?? 0),
        movements: r.movements,
      })),
    };
  }


  /**
   * Daily write-off register — what was lost each day and what it cost.
   *
   * Reads posted adjustments rather than the ledger so every row carries its
   * reason and its backlink to the run that caused it. Only outbound lines
   * count: a `found` gain on the same document is not a loss and would net
   * the day's figure down misleadingly.
   *
   * Qty and value are reported as positive magnitudes — this is a loss
   * register, the sign is implied. Value can legitimately be 0: stock the GL
   * never capitalised (MP raw milk, expensed at cycle lock) still has litres
   * worth reporting.
   */
  async writeOffs(filter: WriteOffFilter) {
    const from = filter.from ?? new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    const to = filter.to ?? new Date().toISOString().slice(0, 10);
    const result = await this.db.execute(sql`
      SELECT
        a.adjustment_date::text          AS date,
        a.adj_no                         AS adj_no,
        a.reason                         AS reason,
        i.name                           AS item_name,
        i.sku                            AS item_sku,
        i.unit                           AS uom,
        l.batch_no                       AS batch_no,
        w.name                           AS warehouse_name,
        wo.wo_number                     AS wo_number,
        (-l.qty_delta)::text             AS qty,
        (-l.value_delta)::text           AS value
      FROM inventory_adjustment_lines l
      JOIN inventory_adjustments a ON a.id = l.adjustment_id
      JOIN items i                ON i.id = l.item_id
      JOIN warehouses w           ON w.id = a.warehouse_id
      LEFT JOIN work_orders wo    ON wo.id = a.source_wo_id
      WHERE a.tenant_id = ${this.tenantId}
        AND a.status = 'posted'
        AND l.qty_delta < 0
        AND a.reason IN (${sql.join(
          writeOffReasonSchema.options.map((r) => sql`${r}`), sql`, `,
        )})
        AND a.adjustment_date >= ${from}::date
        AND a.adjustment_date <= ${to}::date
        ${filter.reason ? sql`AND a.reason = ${filter.reason}` : sql``}
        ${filter.warehouseId ? sql`AND a.warehouse_id = ${filter.warehouseId}` : sql``}
        ${filter.itemId ? sql`AND l.item_id = ${filter.itemId}` : sql``}
      ORDER BY a.adjustment_date DESC, a.adj_no ASC
    `) as unknown as QueryResult<WriteOffRow>;

    return { from, to, ...groupWriteOffsByDay(result.rows) };
  }

  /** Items with on-hand > 0 but no movement in the last N days. */
  async deadStock(filter: DeadStockFilter) {
    const whCond = filter.warehouseId
      ? sql`AND soh.warehouse_id = ${filter.warehouseId}`
      : sql``;
    const result = await this.db.execute(sql`
      WITH last_movement AS (
        SELECT item_id, warehouse_id, COALESCE(batch_no, '') AS batch_no,
               MAX(moved_at) AS last_at
        FROM stock_ledger
        WHERE tenant_id = ${this.tenantId}
        GROUP BY item_id, warehouse_id, COALESCE(batch_no, '')
      )
      SELECT
        soh.item_id, soh.warehouse_id, soh.batch_no,
        soh.qty::text AS qty, soh.value::text AS value,
        i.name AS item_name, i.sku AS item_sku, i.unit AS item_unit,
        w.name AS warehouse_name,
        lm.last_at::date AS last_movement_date,
        (CURRENT_DATE - lm.last_at::date) AS days_since
      FROM stock_on_hand soh
      INNER JOIN items i ON i.id = soh.item_id
      INNER JOIN warehouses w ON w.id = soh.warehouse_id
      LEFT JOIN last_movement lm
        ON lm.item_id = soh.item_id
       AND lm.warehouse_id = soh.warehouse_id
       AND lm.batch_no = soh.batch_no
      WHERE soh.tenant_id = ${this.tenantId}
        AND soh.qty > 0
        AND (lm.last_at IS NULL OR (CURRENT_DATE - lm.last_at::date) >= ${filter.daysSinceMovement})
        ${whCond}
      ORDER BY days_since DESC NULLS FIRST, soh.value DESC
    `) as unknown as QueryResult<{
      item_id: string; warehouse_id: string; batch_no: string;
      qty: string; value: string;
      item_name: string; item_sku: string | null; item_unit: string | null;
      warehouse_name: string;
      last_movement_date: string | null; days_since: number | null;
    }>;
    return result.rows.map((r) => ({
      itemId: r.item_id,
      warehouseId: r.warehouse_id,
      batchNo: r.batch_no,
      qty: Number(r.qty ?? 0),
      value: Number(r.value ?? 0),
      itemName: r.item_name,
      itemSku: r.item_sku,
      itemUnit: r.item_unit,
      warehouseName: r.warehouse_name,
      lastMovementDate: r.last_movement_date,
      daysSinceMovement: r.days_since,
    }));
  }
}

interface WriteOffRow {
  date: string; adj_no: string; reason: string;
  item_name: string; item_sku: string; uom: string;
  batch_no: string | null; warehouse_name: string; wo_number: string | null;
  qty: string; value: string;
}

/** Detail rows into day buckets with subtotals, plus a period total. */
function groupWriteOffsByDay(rows: WriteOffRow[]) {
  const days = new Map<string, { date: string; qty: number; value: number; lines: object[] }>();
  let totalValue = 0;
  let totalQty = 0;

  for (const r of rows) {
    const qty = Number(r.qty ?? 0);
    const value = Number(r.value ?? 0);
    const day = days.get(r.date) ?? { date: r.date, qty: 0, value: 0, lines: [] };
    day.qty += qty;
    day.value += value;
    day.lines.push({
      adjNo: r.adj_no,
      reason: r.reason,
      itemName: r.item_name,
      itemSku: r.item_sku,
      uom: r.uom,
      batchNo: r.batch_no,
      warehouseName: r.warehouse_name,
      woNumber: r.wo_number,
      qty,
      value,
    });
    days.set(r.date, day);
    totalQty += qty;
    totalValue += value;
  }

  return { days: [...days.values()], totalQty, totalValue };
}
