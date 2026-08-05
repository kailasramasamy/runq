import { sql } from 'drizzle-orm';
import type { Db } from '@runq/db';
import type {
  InventoryAnalyticsFilter, InventoryPerformanceFilter,
  AbcClass, VelocityBand, StockRiskLevel,
} from '@runq/validators';
import {
  batchExpiryCte, consumptionCte, onHandCte, warehouseFilter,
  type QueryResult, num,
} from './analytics-sql';

/**
 * Inventory analytics — the decision layer above the operational reports.
 *
 * Reports say "here is what you hold"; this says "here is how it is
 * performing and what is about to go wrong". Read-only, derived live from
 * stock_ledger + stock_on_hand. No snapshots, no materialised views: SME
 * ledgers are small enough that a live scan beats the staleness risk.
 *
 * Forecasting lives next door in analytics-forecast.service.ts.
 */

/**
 * Days-of-cover cut-offs for the velocity bands. Chosen against how an SME
 * actually restocks: under a month of cover is fast-moving and needs
 * watching, over a quarter is capital sitting still.
 */
const FAST_MAX_COVER_DAYS = 30;
const MEDIUM_MAX_COVER_DAYS = 90;

/** Pareto cut-offs on cumulative consumption value. */
const A_CLASS_SHARE = 0.8;
const B_CLASS_SHARE = 0.95;

export interface SkuPerformance {
  itemId: string;
  itemName: string;
  itemSku: string | null;
  itemUnit: string | null;
  category: string | null;
  onHandQty: number;
  onHandValue: number;
  consumedQty: number;
  consumedValue: number;
  /** Units per day, over the SKU's active span inside the window. */
  runRate: number;
  /** On-hand ÷ run rate. Null when the SKU has no demand to divide by. */
  daysOfCover: number | null;
  /** Annualised consumption value ÷ average inventory value held. */
  turnover: number | null;
  velocity: VelocityBand;
  abcClass: AbcClass;
  /** False when the SKU has too little history to judge — UI must say so. */
  hasEnoughHistory: boolean;
  lastMovementAt: string | null;
}

/** Below this many days of movement history, predictions are not offered. */
export const MIN_HISTORY_DAYS = 14;

export class InventoryAnalyticsService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  /**
   * Headline scorecard. One round trip — every tile on the hero row comes
   * from this so the numbers can never disagree with each other.
   */
  async health(filter: InventoryAnalyticsFilter) {
    const { warehouseId, window } = filter;
    const result = await this.db.execute(sql`
      WITH on_hand AS (${onHandCte(this.tenantId, warehouseId)}),
      consumption AS (${consumptionCte(this.tenantId, window, warehouseId)}),
      batch_expiry AS (${batchExpiryCte(this.tenantId)}),
      -- Value of stock whose batch expires inside the next 30 days. Stock
      -- with no batch/expiry recorded simply never joins, which is correct:
      -- we cannot claim it is at risk.
      expiring AS (
        SELECT COALESCE(SUM(soh.value), 0) AS value
        FROM stock_on_hand soh
        INNER JOIN batch_expiry be
          ON be.item_id = soh.item_id AND be.batch_no = soh.batch_no
        WHERE soh.tenant_id = ${this.tenantId}
          AND soh.qty > 0
          AND be.expiry_date >= CURRENT_DATE
          AND be.expiry_date <= CURRENT_DATE + interval '30 days'
          ${warehouseFilter('soh', warehouseId)}
      ),
      -- Below-reorder and out-of-stock, using the same effective reorder
      -- level as ReorderService.alerts(): per-warehouse rule wins, else the
      -- item default.
      reorder AS (
        SELECT
          i.id AS item_id,
          COALESCE(o.qty, 0) AS on_hand,
          COALESCE(MIN(rr.reorder_level), MIN(i.reorder_level)) AS reorder_level
        FROM items i
        LEFT JOIN on_hand o ON o.item_id = i.id
        LEFT JOIN inventory_reorder_rules rr
          ON rr.tenant_id = ${this.tenantId} AND rr.item_id = i.id
        WHERE i.tenant_id = ${this.tenantId} AND i.is_active = TRUE
        GROUP BY i.id, o.qty
      ),
      -- A SKU is only "out" if it has traded before; never-stocked items
      -- are not a stockout, they are just absent from your catalogue.
      traded AS (
        SELECT DISTINCT item_id FROM stock_ledger WHERE tenant_id = ${this.tenantId}
      )
      SELECT
        (SELECT COALESCE(SUM(value), 0) FROM on_hand)::text          AS total_value,
        (SELECT COALESCE(SUM(qty), 0) FROM on_hand)::text            AS total_qty,
        (SELECT COUNT(*) FROM on_hand WHERE qty > 0)::int            AS sku_in_stock,
        (SELECT COALESCE(SUM(value_out), 0) FROM consumption)::text  AS consumed_value,
        (SELECT value FROM expiring)::text                           AS expiring_value,
        (SELECT COUNT(*) FROM reorder r
           WHERE r.reorder_level IS NOT NULL
             AND r.on_hand <= r.reorder_level AND r.on_hand > 0)::int AS below_reorder,
        (SELECT COUNT(*) FROM reorder r
           INNER JOIN traded t ON t.item_id = r.item_id
           WHERE r.on_hand <= 0)::int                                AS out_of_stock,
        -- Dead = holds value, no demand movement in the window at all.
        (SELECT COALESCE(SUM(o.value), 0) FROM on_hand o
           LEFT JOIN consumption c ON c.item_id = o.item_id
           WHERE c.item_id IS NULL AND o.qty > 0)::text              AS dead_value,
        (SELECT COUNT(*) FROM on_hand o
           LEFT JOIN consumption c ON c.item_id = o.item_id
           WHERE c.item_id IS NULL AND o.qty > 0)::int               AS dead_sku
    `) as unknown as QueryResult<{
      total_value: string; total_qty: string; sku_in_stock: number;
      consumed_value: string; expiring_value: string;
      below_reorder: number; out_of_stock: number;
      dead_value: string; dead_sku: number;
    }>;

    const r = result.rows[0]!;
    const totalValue = num(r.total_value);
    const consumedValue = num(r.consumed_value);
    const deadValue = num(r.dead_value);

    // Turnover: annualise the window's cost-of-goods-issued, then divide by
    // the value actually held. Closing value stands in for average held —
    // with no historical snapshots it is the honest approximation, and it
    // is the same basis a CA would use off a closing balance sheet.
    const annualised = window > 0 ? consumedValue * (365 / window) : 0;
    const turnover = totalValue > 0 ? annualised / totalValue : null;

    return {
      windowDays: window,
      totalValue,
      totalQty: num(r.total_qty),
      skuInStock: r.sku_in_stock,
      consumedValue,
      /** Times the whole inventory turns over per year. */
      turnover,
      /** Days it takes to sell through what is currently held. */
      daysOnHand: turnover && turnover > 0 ? 365 / turnover : null,
      expiringValue: num(r.expiring_value),
      belowReorder: r.below_reorder,
      outOfStock: r.out_of_stock,
      deadValue,
      deadSkuCount: r.dead_sku,
      deadValuePct: totalValue > 0 ? (deadValue / totalValue) * 100 : 0,
    };
  }

  /**
   * Per-SKU performance: consumption, run-rate, cover, turnover, velocity
   * band and ABC class. This is the table behind the Pareto chart, the
   * velocity donut, and the fast/slow mover lists.
   */
  async performance(filter: InventoryPerformanceFilter): Promise<SkuPerformance[]> {
    const { warehouseId, window, limit } = filter;
    const result = await this.db.execute(sql`
      WITH on_hand AS (${onHandCte(this.tenantId, warehouseId)}),
      consumption AS (${consumptionCte(this.tenantId, window, warehouseId)})
      SELECT
        i.id AS item_id, i.name AS item_name, i.sku AS item_sku, i.unit AS item_unit,
        COALESCE(p.name, c.name) AS category,
        COALESCE(o.qty, 0)::text            AS on_hand_qty,
        COALESCE(o.value, 0)::text          AS on_hand_value,
        COALESCE(cs.qty_out, 0)::text       AS consumed_qty,
        COALESCE(cs.value_out, 0)::text     AS consumed_value,
        COALESCE(cs.active_days, 0)::text   AS active_days,
        o.last_movement_at::text            AS last_movement_at
      FROM items i
      LEFT JOIN on_hand o     ON o.item_id = i.id
      LEFT JOIN consumption cs ON cs.item_id = i.id
      LEFT JOIN categories c  ON c.id = i.category_id
      LEFT JOIN categories p  ON p.id = c.parent_id
      WHERE i.tenant_id = ${this.tenantId}
        AND i.is_active = TRUE
        -- Only SKUs that either hold stock or moved: never-traded catalogue
        -- entries would flood the charts with zero rows.
        AND (COALESCE(o.qty, 0) <> 0 OR cs.item_id IS NOT NULL)
      ORDER BY COALESCE(cs.value_out, 0) DESC, COALESCE(o.value, 0) DESC
      LIMIT ${limit}
    `) as unknown as QueryResult<{
      item_id: string; item_name: string; item_sku: string | null;
      item_unit: string | null; category: string | null;
      on_hand_qty: string; on_hand_value: string;
      consumed_qty: string; consumed_value: string; active_days: string;
      last_movement_at: string | null;
    }>;

    const rows = result.rows.map((r) => this.toPerformance(r, window));
    return this.assignAbc(rows);
  }

  /** Row → metrics. Kept separate so performance() stays readable. */
  private toPerformance(
    r: {
      item_id: string; item_name: string; item_sku: string | null;
      item_unit: string | null; category: string | null;
      on_hand_qty: string; on_hand_value: string;
      consumed_qty: string; consumed_value: string; active_days: string;
      last_movement_at: string | null;
    },
    window: number,
  ): SkuPerformance {
    const onHandQty = num(r.on_hand_qty);
    const onHandValue = num(r.on_hand_value);
    const consumedQty = num(r.consumed_qty);
    const consumedValue = num(r.consumed_value);
    const activeDays = num(r.active_days);

    const runRate = activeDays > 0 ? consumedQty / activeDays : 0;
    const daysOfCover = runRate > 0 ? onHandQty / runRate : null;
    const annualised = window > 0 ? consumedValue * (365 / window) : 0;
    const turnover = onHandValue > 0 ? annualised / onHandValue : null;

    let velocity: VelocityBand;
    if (consumedQty <= 0) velocity = 'dead';
    else if (daysOfCover === null) velocity = 'fast';
    else if (daysOfCover <= FAST_MAX_COVER_DAYS) velocity = 'fast';
    else if (daysOfCover <= MEDIUM_MAX_COVER_DAYS) velocity = 'medium';
    else velocity = 'slow';

    return {
      itemId: r.item_id,
      itemName: r.item_name,
      itemSku: r.item_sku,
      itemUnit: r.item_unit,
      category: r.category,
      onHandQty,
      onHandValue,
      consumedQty,
      consumedValue,
      runRate,
      daysOfCover,
      turnover,
      velocity,
      abcClass: 'C',
      hasEnoughHistory: activeDays >= MIN_HISTORY_DAYS,
      lastMovementAt: r.last_movement_at,
    };
  }

  /**
   * Pareto: sort by consumption value, walk the cumulative share, and label
   * the SKUs carrying the first 80% as A, up to 95% as B, the tail as C.
   * Rows arrive already sorted by value, so one pass does it.
   */
  private assignAbc(rows: SkuPerformance[]): SkuPerformance[] {
    const total = rows.reduce((s, r) => s + r.consumedValue, 0);
    if (total <= 0) return rows;
    let cumulative = 0;
    return rows.map((r) => {
      cumulative += r.consumedValue;
      const share = cumulative / total;
      const abcClass: AbcClass =
        share <= A_CLASS_SHARE ? 'A' : share <= B_CLASS_SHARE ? 'B' : 'C';
      return { ...r, abcClass };
    });
  }

  /**
   * Stock at risk: what is out now, what is about to be, and which SKUs
   * keep going out. Feeds the low-stock / OOS section.
   */
  async stockRisk(filter: InventoryAnalyticsFilter) {
    const { warehouseId, window } = filter;
    const result = await this.db.execute(sql`
      WITH on_hand AS (${onHandCte(this.tenantId, warehouseId)}),
      consumption AS (${consumptionCte(this.tenantId, window, warehouseId)}),
      traded AS (
        SELECT item_id, MAX(moved_at) AS last_moved_at
        FROM stock_ledger
        WHERE tenant_id = ${this.tenantId}
        GROUP BY item_id
      ),
      -- How often each SKU hit zero in the window. Every ledger row carries
      -- the running qty after it, so a row landing on <= 0 is a stockout
      -- event without needing to replay history.
      stockouts AS (
        SELECT sl.item_id, COUNT(*) AS times_out
        FROM stock_ledger sl
        WHERE sl.tenant_id = ${this.tenantId}
          AND sl.moved_at >= NOW() - (${window} || ' days')::interval
          AND sl.running_qty <= 0
          AND sl.qty_out > 0
          ${warehouseFilter('sl', warehouseId)}
        GROUP BY sl.item_id
      )
      SELECT
        i.id AS item_id, i.name AS item_name, i.sku AS item_sku, i.unit AS item_unit,
        COALESCE(o.qty, 0)::text          AS on_hand,
        COALESCE(o.value, 0)::text        AS on_hand_value,
        COALESCE(MIN(rr.reorder_level), MIN(i.reorder_level))::text AS reorder_level,
        COALESCE(MIN(rr.reorder_qty), MIN(i.reorder_qty))::text     AS reorder_qty,
        MIN(rr.lead_time_days)            AS lead_time_days,
        COALESCE(MAX(cs.qty_out), 0)::text     AS consumed_qty,
        COALESCE(MAX(cs.active_days), 0)::text AS active_days,
        COALESCE(MAX(so.times_out), 0)::int    AS times_out,
        MAX(t.last_moved_at)::text        AS last_moved_at,
        (t.item_id IS NOT NULL)           AS has_traded
      FROM items i
      LEFT JOIN on_hand o      ON o.item_id = i.id
      LEFT JOIN consumption cs ON cs.item_id = i.id
      LEFT JOIN traded t       ON t.item_id = i.id
      LEFT JOIN stockouts so   ON so.item_id = i.id
      LEFT JOIN inventory_reorder_rules rr
        ON rr.tenant_id = ${this.tenantId} AND rr.item_id = i.id
      WHERE i.tenant_id = ${this.tenantId}
        AND i.is_active = TRUE
        AND t.item_id IS NOT NULL
      GROUP BY i.id, i.name, i.sku, i.unit, o.qty, o.value, t.item_id
      ORDER BY COALESCE(o.qty, 0) ASC, COALESCE(MAX(cs.qty_out), 0) DESC
    `) as unknown as QueryResult<{
      item_id: string; item_name: string; item_sku: string | null;
      item_unit: string | null;
      on_hand: string; on_hand_value: string;
      reorder_level: string | null; reorder_qty: string | null;
      lead_time_days: number | null;
      consumed_qty: string; active_days: string;
      times_out: number; last_moved_at: string | null;
    }>;

    const rows = result.rows.map((r) => {
      const onHand = num(r.on_hand);
      const reorderLevel = r.reorder_level === null ? null : num(r.reorder_level);
      const activeDays = num(r.active_days);
      const runRate = activeDays > 0 ? num(r.consumed_qty) / activeDays : 0;
      const ratio = reorderLevel && reorderLevel > 0 ? onHand / reorderLevel : null;

      let level: StockRiskLevel;
      if (onHand <= 0) level = 'out';
      else if (ratio === null) level = 'ok';
      else if (ratio <= 0.5) level = 'critical';
      else if (ratio <= 1) level = 'warning';
      else level = 'ok';

      return {
        itemId: r.item_id,
        itemName: r.item_name,
        itemSku: r.item_sku,
        itemUnit: r.item_unit,
        onHand,
        onHandValue: num(r.on_hand_value),
        reorderLevel,
        reorderQty: r.reorder_qty === null ? null : num(r.reorder_qty),
        leadTimeDays: r.lead_time_days,
        runRate,
        /** Demand that would have flowed while out of stock — the ask price
         *  of the stockout, in units. Only meaningful once out. */
        estimatedLostQty: onHand <= 0 ? runRate * this.daysSince(r.last_moved_at) : 0,
        daysOut: onHand <= 0 ? this.daysSince(r.last_moved_at) : 0,
        timesOutInWindow: r.times_out,
        level,
        shortBy: reorderLevel ? Math.max(0, reorderLevel - onHand) : 0,
      };
    });

    return {
      windowDays: window,
      outOfStock: rows.filter((r) => r.level === 'out'),
      critical: rows.filter((r) => r.level === 'critical'),
      warning: rows.filter((r) => r.level === 'warning'),
      /** SKUs that ran dry more than once — a reorder-level problem, not
       *  a one-off. Sorted worst-first for the repeat-offender chart. */
      repeatOffenders: rows
        .filter((r) => r.timesOutInWindow > 1)
        .sort((a, b) => b.timesOutInWindow - a.timesOutInWindow)
        .slice(0, 10),
    };
  }

  /** Whole days between a timestamp and now; 0 when unknown. */
  private daysSince(ts: string | null): number {
    if (!ts) return 0;
    const then = new Date(ts).getTime();
    if (!Number.isFinite(then)) return 0;
    return Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
  }
}
