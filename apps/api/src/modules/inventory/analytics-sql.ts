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
