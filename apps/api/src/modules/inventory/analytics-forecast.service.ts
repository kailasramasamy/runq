import { sql } from 'drizzle-orm';
import type { Db } from '@runq/db';
import type { InventoryForecastFilter, InventoryTrendFilter } from '@runq/validators';
import {
  batchExpiryCte, consumptionCte, onHandCte, warehouseFilter,
  demandTypeFilter, type QueryResult, num,
} from './analytics-sql';
import { MIN_HISTORY_DAYS } from './analytics.service';

/**
 * Inventory forecasting — deliberately simple, deliberately explainable.
 *
 * Every number here is trailing run-rate arithmetic: units-per-day from the
 * ledger, divided into what is on hand. No smoothing model, no seasonality,
 * no fitted curve. That is a choice, not a shortcut — an SME stock ledger
 * rarely carries the history to fit anything richer, and a forecast the
 * owner cannot re-derive on paper is a forecast they will not act on.
 *
 * The honesty valve is `hasEnoughHistory`: under MIN_HISTORY_DAYS of
 * movement we return the SKU with null dates rather than a confident guess.
 */

/** Cover below this many days is flagged even without a reorder rule. */
const URGENT_COVER_DAYS = 7;

export class InventoryForecastService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  /**
   * Which SKUs run out, when, and when to reorder to beat the lead time.
   *
   * reorderBy = stockoutDate − leadTimeDays. If that date is already in the
   * past the order is late, and `isLate` says so — the single most
   * actionable flag on the page.
   */
  async stockoutForecast(filter: InventoryForecastFilter) {
    const { warehouseId, window, horizonDays } = filter;
    const result = await this.db.execute(sql`
      WITH on_hand AS (${onHandCte(this.tenantId, warehouseId)}),
      consumption AS (${consumptionCte(this.tenantId, window, warehouseId)})
      SELECT
        i.id AS item_id, i.name AS item_name, i.sku AS item_sku, i.unit AS item_unit,
        COALESCE(o.qty, 0)::text            AS on_hand,
        COALESCE(o.value, 0)::text          AS on_hand_value,
        COALESCE(cs.qty_out, 0)::text       AS consumed_qty,
        COALESCE(cs.active_days, 0)::text   AS active_days,
        COALESCE(MIN(rr.reorder_qty), MIN(i.reorder_qty))::text AS reorder_qty,
        MIN(rr.lead_time_days)              AS lead_time_days
      FROM items i
      INNER JOIN consumption cs ON cs.item_id = i.id
      LEFT JOIN on_hand o       ON o.item_id = i.id
      LEFT JOIN inventory_reorder_rules rr
        ON rr.tenant_id = ${this.tenantId} AND rr.item_id = i.id
      WHERE i.tenant_id = ${this.tenantId}
        AND i.is_active = TRUE
        AND cs.qty_out > 0
      GROUP BY i.id, i.name, i.sku, i.unit, o.qty, o.value, cs.qty_out, cs.active_days
    `) as unknown as QueryResult<{
      item_id: string; item_name: string; item_sku: string | null;
      item_unit: string | null;
      on_hand: string; on_hand_value: string;
      consumed_qty: string; active_days: string;
      reorder_qty: string | null; lead_time_days: number | null;
    }>;

    const today = new Date();
    const rows = result.rows.map((r) => {
      const onHand = num(r.on_hand);
      const activeDays = num(r.active_days);
      const runRate = activeDays > 0 ? num(r.consumed_qty) / activeDays : 0;
      const hasEnoughHistory = activeDays >= MIN_HISTORY_DAYS;
      const daysOfCover = runRate > 0 ? onHand / runRate : null;
      const leadTimeDays = r.lead_time_days;

      // Dates are only offered when the run-rate rests on real history.
      const stockoutDate =
        hasEnoughHistory && daysOfCover !== null
          ? this.addDays(today, Math.floor(daysOfCover))
          : null;
      const reorderByDate =
        stockoutDate && leadTimeDays !== null
          ? this.addDays(today, Math.floor(daysOfCover!) - leadTimeDays)
          : null;

      // Suggested qty: the configured reorder qty if there is one, else
      // enough to cover the lead time plus a week of buffer.
      const configuredQty = r.reorder_qty === null ? null : num(r.reorder_qty);
      const suggestedQty = configuredQty && configuredQty > 0
        ? configuredQty
        : runRate > 0
          ? Math.ceil(runRate * ((leadTimeDays ?? 7) + 7))
          : 0;

      return {
        itemId: r.item_id,
        itemName: r.item_name,
        itemSku: r.item_sku,
        itemUnit: r.item_unit,
        onHand,
        onHandValue: num(r.on_hand_value),
        runRate,
        daysOfCover,
        leadTimeDays,
        stockoutDate,
        reorderByDate,
        suggestedQty,
        hasEnoughHistory,
        /** Reorder-by has already passed — order today or accept the gap. */
        isLate: reorderByDate !== null && reorderByDate < this.iso(today),
        isUrgent: daysOfCover !== null && daysOfCover <= URGENT_COVER_DAYS,
      };
    });

    // Only what lands inside the horizon, soonest first. SKUs without
    // enough history ride along so the UI can show its own caveat rather
    // than silently dropping them.
    const inHorizon = rows.filter(
      (r) => r.daysOfCover !== null && r.daysOfCover <= horizonDays,
    );
    inHorizon.sort((a, b) => (a.daysOfCover ?? 0) - (b.daysOfCover ?? 0));

    return {
      windowDays: window,
      horizonDays,
      items: inHorizon,
      lateCount: inHorizon.filter((r) => r.isLate).length,
      urgentCount: inHorizon.filter((r) => r.isUrgent).length,
      unpredictableCount: inHorizon.filter((r) => !r.hasEnoughHistory).length,
    };
  }

  /**
   * Value at risk of expiring, bucketed by month. Straight from batch
   * expiry dates — no projection involved, this is a certainty unless the
   * stock moves. Pairs with the stockout forecast: one is money about to
   * be lost, the other is revenue about to be missed.
   */
  async expiryForecast(filter: InventoryForecastFilter) {
    const { warehouseId } = filter;
    const result = await this.db.execute(sql`
      WITH batch_expiry AS (${batchExpiryCte(this.tenantId)})
      SELECT
        TO_CHAR(DATE_TRUNC('month', be.expiry_date), 'YYYY-MM') AS month,
        COALESCE(SUM(soh.value), 0)::text AS value,
        COALESCE(SUM(soh.qty), 0)::text   AS qty,
        COUNT(DISTINCT soh.item_id)::int  AS sku_count,
        (be.expiry_date < CURRENT_DATE)   AS already_expired
      FROM stock_on_hand soh
      INNER JOIN batch_expiry be
        ON be.item_id = soh.item_id AND be.batch_no = soh.batch_no
      WHERE soh.tenant_id = ${this.tenantId}
        AND soh.qty > 0
        AND be.expiry_date <= CURRENT_DATE + interval '12 months'
        ${warehouseFilter('soh', warehouseId)}
      GROUP BY DATE_TRUNC('month', be.expiry_date), (be.expiry_date < CURRENT_DATE)
      ORDER BY 1 ASC
    `) as unknown as QueryResult<{
      month: string; value: string; qty: string;
      sku_count: number; already_expired: boolean;
    }>;

    const buckets = result.rows.map((r) => ({
      month: r.month,
      value: num(r.value),
      qty: num(r.qty),
      skuCount: r.sku_count,
      alreadyExpired: r.already_expired,
    }));

    return {
      buckets,
      totalAtRisk: buckets.reduce((s, b) => s + b.value, 0),
      alreadyExpiredValue: buckets
        .filter((b) => b.alreadyExpired)
        .reduce((s, b) => s + b.value, 0),
    };
  }

  /**
   * Time series for the trend charts: stock value at each bucket close,
   * plus inbound/outbound flow through the bucket.
   *
   * Closing value uses the last ledger row per (item, warehouse, batch) at
   * or before the bucket end — the same DISTINCT ON trick the valuation
   * report uses, so a point on this chart matches the valuation report run
   * for that date.
   */
  async trend(filter: InventoryTrendFilter) {
    const { warehouseId, months, bucket } = filter;
    const truncUnit = bucket === 'month' ? 'month' : 'week';
    const result = await this.db.execute(sql`
      WITH bounds AS (
        SELECT GENERATE_SERIES(
          DATE_TRUNC(${truncUnit}, NOW() - (${months} || ' months')::interval),
          DATE_TRUNC(${truncUnit}, NOW()),
          ('1 ' || ${truncUnit})::interval
        ) AS bucket_start
      ),
      periods AS (
        SELECT
          bucket_start,
          bucket_start + ('1 ' || ${truncUnit})::interval AS bucket_end
        FROM bounds
      ),
      -- Flow through each bucket, split by direction.
      flow AS (
        SELECT
          p.bucket_start,
          COALESCE(SUM(sl.qty_in  * sl.unit_cost), 0) AS in_value,
          COALESCE(SUM(sl.qty_out * sl.unit_cost), 0) AS out_value,
          COALESCE(SUM(sl.qty_in), 0)                 AS in_qty,
          COALESCE(SUM(sl.qty_out), 0)                AS out_qty
        FROM periods p
        LEFT JOIN stock_ledger sl
          ON sl.tenant_id = ${this.tenantId}
         AND sl.moved_at >= p.bucket_start
         AND sl.moved_at <  p.bucket_end
         ${warehouseFilter('sl', warehouseId)}
        GROUP BY p.bucket_start
      ),
      -- Closing stock value at each bucket end.
      closing AS (
        SELECT
          p.bucket_start,
          COALESCE((
            SELECT SUM(x.running_value)
            FROM (
              SELECT DISTINCT ON (sl.item_id, sl.warehouse_id, COALESCE(sl.batch_no, ''))
                sl.running_value
              FROM stock_ledger sl
              WHERE sl.tenant_id = ${this.tenantId}
                AND sl.moved_at < p.bucket_end
                ${warehouseFilter('sl', warehouseId)}
              ORDER BY sl.item_id, sl.warehouse_id, COALESCE(sl.batch_no, ''),
                       sl.moved_at DESC, sl.posted_at DESC
            ) x
          ), 0) AS close_value
        FROM periods p
      )
      SELECT
        TO_CHAR(f.bucket_start, 'YYYY-MM-DD') AS bucket,
        f.in_value::text  AS in_value,
        f.out_value::text AS out_value,
        f.in_qty::text    AS in_qty,
        f.out_qty::text   AS out_qty,
        c.close_value::text AS close_value
      FROM flow f
      INNER JOIN closing c ON c.bucket_start = f.bucket_start
      ORDER BY f.bucket_start ASC
    `) as unknown as QueryResult<{
      bucket: string; in_value: string; out_value: string;
      in_qty: string; out_qty: string; close_value: string;
    }>;

    return {
      bucket,
      points: result.rows.map((r) => ({
        bucket: r.bucket,
        inValue: num(r.in_value),
        outValue: num(r.out_value),
        inQty: num(r.in_qty),
        outQty: num(r.out_qty),
        closingValue: num(r.close_value),
      })),
    };
  }

  /**
   * Demand by month for one SKU — the drill-down behind a forecast row, so
   * the owner can see the run-rate's raw material before trusting it.
   */
  async itemDemand(itemId: string, months: number, warehouseId?: string) {
    const result = await this.db.execute(sql`
      SELECT
        TO_CHAR(DATE_TRUNC('month', sl.moved_at), 'YYYY-MM') AS month,
        SUM(sl.qty_out)::text AS qty
      FROM stock_ledger sl
      WHERE sl.tenant_id = ${this.tenantId}
        AND sl.item_id = ${itemId}
        AND sl.moved_at >= DATE_TRUNC('month', NOW() - (${months} || ' months')::interval)
        AND ${demandTypeFilter(warehouseId)}
        AND sl.qty_out > 0
        ${warehouseFilter('sl', warehouseId)}
      GROUP BY 1
      ORDER BY 1 ASC
    `) as unknown as QueryResult<{ month: string; qty: string }>;
    return result.rows.map((r) => ({ month: r.month, qty: num(r.qty) }));
  }

  private addDays(from: Date, days: number): string {
    const d = new Date(from.getTime());
    d.setDate(d.getDate() + days);
    return this.iso(d);
  }

  private iso(d: Date): string {
    return d.toISOString().slice(0, 10);
  }
}
