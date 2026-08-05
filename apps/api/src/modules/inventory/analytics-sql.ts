import { sql, type SQL } from 'drizzle-orm';

/**
 * Shared SQL vocabulary for the inventory analytics services.
 *
 * Everything here exists so `analytics.service.ts` and
 * `analytics-forecast.service.ts` agree on what "consumption" means. If the
 * two ever drifted, the performance page and the forecast page would quote
 * different run-rates for the same SKU — the fastest way to lose a user's
 * trust in the whole section.
 */

/**
 * Movement types that represent real demand leaving the business.
 *
 * `transfer_out` is deliberately absent: moving your own stock between your
 * own warehouses is not consumption, and counting it would double-count
 * (the matching transfer_in re-adds it) and inflate turnover for anyone
 * running a hub-and-spoke setup. It IS demand from a single warehouse's
 * point of view, so `demandTypes()` adds it back when scoped to one.
 *
 * `reversal` is absent too — it unwinds a cancelled document rather than
 * describing a real outflow.
 */
const TENANT_DEMAND_TYPES = [
  'delivery',
  'production_out',
  'adjustment_out',
  'reclaim_out',
  'stock_take_out',
] as const;

/** Demand movement types, widened with transfers when warehouse-scoped. */
export function demandTypes(warehouseId?: string): readonly string[] {
  return warehouseId ? [...TENANT_DEMAND_TYPES, 'transfer_out'] : TENANT_DEMAND_TYPES;
}

/**
 * `movement_type IN (...)` over the demand set.
 *
 * Built as an explicit joined list rather than `= ANY($1::text[])`: drizzle
 * binds a JS array as a row literal, which Postgres refuses to cast to
 * text[] ("cannot cast type record to text[]").
 */
export function demandTypeFilter(warehouseId?: string): SQL {
  const types = demandTypes(warehouseId).map((t) => sql`${t}`);
  return sql`sl.movement_type::text IN (${sql.join(types, sql`, `)})`;
}

/** Optional `AND <table>.warehouse_id = ...`, or nothing. */
export function warehouseFilter(alias: string, warehouseId?: string): SQL {
  if (!warehouseId) return sql``;
  return sql`AND ${sql.raw(alias)}.warehouse_id = ${warehouseId}`;
}

/**
 * Batch → earliest expiry date, sourced from the GRN lines that brought the
 * batch in. Mirrors ReorderService.expiring() so both agree on when a batch
 * dies. Exposed as a CTE body so callers can name it themselves.
 */
export function batchExpiryCte(tenantId: string): SQL {
  return sql`
    SELECT item_id, batch_no, MIN(expiry_date) AS expiry_date
    FROM inventory_grn_lines
    WHERE tenant_id = ${tenantId}
      AND batch_no IS NOT NULL
      AND expiry_date IS NOT NULL
    GROUP BY item_id, batch_no
  `;
}

/**
 * Per-item consumption over a trailing window.
 *
 * `active_days` is the span over which the SKU has been *available to sell*
 * inside the window — from whichever is later of (the window opening, the
 * SKU's first ever ledger movement) up to now. It is emphatically NOT
 * measured from the first sale: a SKU received 80 days ago that sold 200
 * units in one bulk delivery 40 days ago has depleted at 2.5/day, not
 * 5/day. Anchoring on the first sale would double its apparent run-rate
 * and predict a stockout twice as early as reality.
 *
 * The window floor is what stops the other error: a SKU first received 5
 * days ago that has sold 50 units runs at 10/day, not 50/90 = 0.55/day.
 * Judging new stock against the whole window buries genuine fast movers.
 */
export function consumptionCte(
  tenantId: string,
  windowDays: number,
  warehouseId?: string,
): SQL {
  return sql`
    WITH first_seen AS (
      SELECT sl.item_id, MIN(sl.moved_at) AS first_at
      FROM stock_ledger sl
      WHERE sl.tenant_id = ${tenantId}
        ${warehouseFilter('sl', warehouseId)}
      GROUP BY sl.item_id
    ),
    demand AS (
      SELECT
        sl.item_id,
        SUM(sl.qty_out)                AS qty_out,
        SUM(sl.qty_out * sl.unit_cost) AS value_out,
        COUNT(*)                       AS movement_count,
        MAX(sl.moved_at)               AS last_out_at
      FROM stock_ledger sl
      WHERE sl.tenant_id = ${tenantId}
        AND sl.moved_at >= NOW() - (${windowDays} || ' days')::interval
        AND ${demandTypeFilter(warehouseId)}
        AND sl.qty_out > 0
        ${warehouseFilter('sl', warehouseId)}
      GROUP BY sl.item_id
    )
    SELECT
      d.item_id, d.qty_out, d.value_out, d.movement_count, d.last_out_at,
      -- Left as a fraction on purpose. Rounding up cost a whole day on
      -- every SKU (a span of exactly 5.0 days became 6), which quietly
      -- deflated every run-rate; the raw span divides cleanly.
      GREATEST(
        1,
        LEAST(
          ${windowDays},
          EXTRACT(EPOCH FROM (
            NOW() - GREATEST(fs.first_at, NOW() - (${windowDays} || ' days')::interval)
          )) / 86400
        )
      )::numeric AS active_days
    FROM demand d
    INNER JOIN first_seen fs ON fs.item_id = d.item_id
  `;
}

/**
 * Per-item demand VARIABILITY, which safety stock and XYZ both need.
 *
 * Two things here are easy to get wrong and both are handled deliberately:
 *
 * 1. Zero-demand days must be counted. A SKU that sold 70 units on one day
 *    and nothing for six has a very different variability profile from one
 *    that sold 10 a day all week — but if you only aggregate the days that
 *    had movement, both look identical (a single mean of 70 vs 10 with no
 *    spread at all). So a day spine is generated per item and left-joined,
 *    turning quiet days into real zero observations.
 *
 * 2. Daily and weekly spreads answer different questions. Safety stock
 *    needs the DAILY sigma, because it is scaled by the square root of the
 *    lead time in days. XYZ classification uses the WEEKLY coefficient of
 *    variation, because daily buckets are so zero-inflated for a normal SME
 *    SKU that almost everything would classify as erratic.
 *
 * The spine starts at the SKU's first movement (clipped to the window), the
 * same anchor `consumptionCte` uses, so a new SKU is not penalised for the
 * weeks before it existed.
 */
export function demandStatsCte(
  tenantId: string,
  windowDays: number,
  warehouseId?: string,
): SQL {
  return sql`
    WITH first_seen AS (
      SELECT sl.item_id, MIN(sl.moved_at) AS first_at
      FROM stock_ledger sl
      WHERE sl.tenant_id = ${tenantId}
        ${warehouseFilter('sl', warehouseId)}
      GROUP BY sl.item_id
    ),
    daily_demand AS (
      SELECT sl.item_id, sl.moved_at::date AS d, SUM(sl.qty_out) AS qty
      FROM stock_ledger sl
      WHERE sl.tenant_id = ${tenantId}
        AND sl.moved_at >= NOW() - (${windowDays} || ' days')::interval
        AND ${demandTypeFilter(warehouseId)}
        AND sl.qty_out > 0
        ${warehouseFilter('sl', warehouseId)}
      GROUP BY sl.item_id, sl.moved_at::date
    ),
    item_span AS (
      SELECT
        dd.item_id,
        GREATEST(
          fs.first_at::date,
          (NOW() - (${windowDays} || ' days')::interval)::date
        ) AS from_d,
        NOW()::date AS to_d
      FROM (SELECT DISTINCT item_id FROM daily_demand) dd
      INNER JOIN first_seen fs ON fs.item_id = dd.item_id
    ),
    -- One row per (item, day) across the SKU's active span, quiet days
    -- included as zero.
    daily_full AS (
      SELECT s.item_id, gs::date AS d, COALESCE(dd.qty, 0) AS qty
      FROM item_span s
      CROSS JOIN LATERAL GENERATE_SERIES(s.from_d, s.to_d, '1 day') gs
      LEFT JOIN daily_demand dd ON dd.item_id = s.item_id AND dd.d = gs::date
    ),
    weekly_full AS (
      SELECT
        item_id,
        DATE_TRUNC('week', d) AS w,
        SUM(qty)              AS qty,
        COUNT(*)              AS days_in_week
      FROM daily_full
      GROUP BY item_id, DATE_TRUNC('week', d)
    ),
    -- COMPLETE weeks only. A span rarely starts on a Monday, so the first
    -- and last buckets hold a few days each; leaving them in makes a
    -- perfectly steady SKU look variable (a flat 10/day measured this way
    -- scored CV 0.45 against an X threshold of 0.5 — nearly misclassified
    -- on nothing but calendar alignment).
    weekly_stats AS (
      SELECT
        item_id,
        AVG(qty)                          AS mean_weekly,
        COALESCE(STDDEV_SAMP(qty), 0)     AS sd_weekly,
        COUNT(*)                          AS weeks
      FROM weekly_full
      WHERE days_in_week = 7
      GROUP BY item_id
    )
    SELECT
      df.item_id,
      AVG(df.qty)                      AS mean_daily,
      COALESCE(STDDEV_SAMP(df.qty), 0) AS sd_daily,
      COUNT(*)                         AS days,
      ws.mean_weekly,
      ws.sd_weekly,
      COALESCE(ws.weeks, 0)            AS weeks
    -- LEFT so a SKU with under a full week still returns its daily stats;
    -- the caller declines to classify it rather than losing the row.
    FROM daily_full df
    LEFT JOIN weekly_stats ws ON ws.item_id = df.item_id
    GROUP BY df.item_id, ws.mean_weekly, ws.sd_weekly, ws.weeks
  `;
}

/**
 * Average inventory value across the window, sampled at each week close.
 *
 * Turnover is defined against AVERAGE inventory held, not the closing
 * balance. Using closing punishes anyone who restocked just before the
 * period ended and flatters anyone who ran themselves dry — the exact
 * businesses whose turnover you most want to read correctly.
 *
 * Sampling weekly closes is the standard "average of period-end balances"
 * approximation. It costs one DISTINCT ON scan per sampled week, which is
 * fine at SME ledger sizes (13 samples on the default 90-day window).
 *
 * Samples start at the first ledger movement, not at the window opening.
 * Averaging in weeks before the business had any stock destroys the ratio:
 * on real dev data a tenant 7 days into the module averaged ₹3,675 against
 * a ₹27,150 closing balance — twelve empty weeks dragging it down — and
 * reported 54.69x turnover instead of ~7.9x.
 */
export function averageInventoryCte(
  tenantId: string,
  windowDays: number,
  warehouseId?: string,
): SQL {
  return sql`
    WITH span AS (
      SELECT GREATEST(
        DATE_TRUNC('week', NOW() - (${windowDays} || ' days')::interval),
        DATE_TRUNC('week', COALESCE(MIN(sl.moved_at), NOW()))
      ) AS from_wk
      FROM stock_ledger sl
      WHERE sl.tenant_id = ${tenantId}
        AND sl.moved_at >= NOW() - (${windowDays} || ' days')::interval
        ${warehouseFilter('sl', warehouseId)}
    ),
    samples AS (
      SELECT GENERATE_SERIES(
        (SELECT from_wk FROM span),
        DATE_TRUNC('week', NOW()),
        '1 week'::interval
      ) AS wk
    )
    SELECT COALESCE(AVG(v.value), 0) AS avg_value
    FROM samples s
    CROSS JOIN LATERAL (
      SELECT COALESCE(SUM(x.running_value), 0) AS value
      FROM (
        SELECT DISTINCT ON (sl.item_id, sl.warehouse_id, COALESCE(sl.batch_no, ''))
          sl.running_value
        FROM stock_ledger sl
        WHERE sl.tenant_id = ${tenantId}
          AND sl.moved_at < s.wk + '1 week'::interval
          ${warehouseFilter('sl', warehouseId)}
        ORDER BY sl.item_id, sl.warehouse_id, COALESCE(sl.batch_no, ''),
                 sl.moved_at DESC, sl.posted_at DESC
      ) x
    ) v
  `;
}

/** Current on-hand per item, warehouse-scoped when asked. */
export function onHandCte(tenantId: string, warehouseId?: string): SQL {
  return sql`
    SELECT
      soh.item_id,
      SUM(soh.qty)   AS qty,
      SUM(soh.value) AS value,
      MAX(soh.last_movement_at) AS last_movement_at
    FROM stock_on_hand soh
    WHERE soh.tenant_id = ${tenantId}
      ${warehouseFilter('soh', warehouseId)}
    GROUP BY soh.item_id
  `;
}

/** Rows shaped like `{ rows: T[] }`, which is what db.execute returns. */
export interface QueryResult<T> { rows: T[] }

/** Number(), but nulls and empty strings collapse to 0 instead of NaN. */
export function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
