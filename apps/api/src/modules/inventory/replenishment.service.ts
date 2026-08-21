import { sql } from 'drizzle-orm';
import type { Db } from '@runq/db';
import type {
  InventoryReplenishmentFilter, ServiceLevel, ApplyReplenishmentInput,
} from '@runq/validators';
import { SERVICE_LEVEL_Z } from '@runq/validators';
import {
  consumptionCte, demandStatsCte, onHandCte, type QueryResult, num,
} from './analytics-sql';

/**
 * Replenishment planning — what the reorder level SHOULD be.
 *
 * The operational alert list reads `reorder_level`, a number somebody had
 * to type. Most SMEs never type it, so their low-stock alerting is silent
 * no matter how thin stock gets. This service inverts that: derive the
 * reorder point from demand, its variability, and the vendor lead time,
 * then show it against whatever is currently configured so the gap is
 * visible and one tap away from being fixed.
 *
 * The formulas are the standard ones, deliberately — an owner should be
 * able to re-derive any number here on paper:
 *
 *   safety stock = Z(service level) × σ_daily × √lead time
 *   reorder point = (average daily demand × lead time) + safety stock
 *
 * σ_daily comes from `demandStatsCte`, which counts quiet days as real
 * zero-demand observations; without that the spread is meaningless.
 */

/** Below this many weekly observations, variability is noise, not signal. */
const MIN_WEEKS_FOR_SIGMA = 3;

export interface ReplenishmentRow {
  itemId: string;
  itemName: string;
  itemSku: string | null;
  itemUnit: string | null;
  onHand: number;
  /** Mean daily demand over the SKU's active span. */
  avgDailyDemand: number;
  /** Standard deviation of daily demand, quiet days included. */
  demandSd: number;
  leadTimeDays: number;
  /** True when no rule set a lead time and the default was assumed. */
  leadTimeAssumed: boolean;
  safetyStock: number;
  /** The computed reorder point. */
  suggestedReorderLevel: number;
  /** What is configured today, or null if nobody ever set one. */
  currentReorderLevel: number | null;
  /** suggested − current. Positive means today's level is too low. */
  gap: number | null;
  /** Suggested order quantity when the point is breached. */
  suggestedOrderQty: number;
  /** On-hand is already at or below the SUGGESTED point — act now. */
  breachesSuggested: boolean;
  /** Enough weekly observations to trust the variability term. */
  hasReliableSigma: boolean;
}

export class ReplenishmentService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  async suggestions(filter: InventoryReplenishmentFilter): Promise<{
    serviceLevel: number;
    z: number;
    defaultLeadTimeDays: number;
    rows: ReplenishmentRow[];
    /** Configured too low (or not at all) while stock is already short. */
    actionableCount: number;
    /** Have no reorder level configured at all. */
    unconfiguredCount: number;
  }> {
    const { warehouseId, window, serviceLevel, defaultLeadTimeDays } = filter;
    const z = SERVICE_LEVEL_Z[serviceLevel as ServiceLevel];

    const result = await this.db.execute(sql`
      WITH on_hand AS (${onHandCte(this.tenantId, warehouseId)}),
      consumption AS (${consumptionCte(this.tenantId, window, warehouseId)}),
      stats AS (${demandStatsCte(this.tenantId, window, warehouseId)})
      SELECT
        i.id AS item_id, i.name AS item_name, i.sku AS item_sku, i.unit AS item_unit,
        COALESCE(o.qty, 0)::text          AS on_hand,
        st.mean_daily::text               AS mean_daily,
        st.sd_daily::text                 AS sd_daily,
        st.weeks                          AS weeks,
        MIN(rr.lead_time_days)            AS lead_time_days,
        COALESCE(MIN(rr.reorder_level), MIN(i.reorder_level))::text AS reorder_level,
        COALESCE(MIN(rr.reorder_qty), MIN(i.reorder_qty))::text     AS reorder_qty
      FROM items i
      INNER JOIN stats st       ON st.item_id = i.id
      INNER JOIN consumption cs ON cs.item_id = i.id
      LEFT JOIN on_hand o       ON o.item_id = i.id
      LEFT JOIN inventory_reorder_rules rr
        ON rr.tenant_id = ${this.tenantId} AND rr.item_id = i.id
      WHERE i.tenant_id = ${this.tenantId}
        AND i.is_active = TRUE
        AND cs.qty_out > 0
      GROUP BY i.id, i.name, i.sku, i.unit, o.qty,
               st.mean_daily, st.sd_daily, st.weeks
    `) as unknown as QueryResult<{
      item_id: string; item_name: string; item_sku: string | null;
      item_unit: string | null;
      on_hand: string; mean_daily: string; sd_daily: string; weeks: number | null;
      lead_time_days: number | null;
      reorder_level: string | null; reorder_qty: string | null;
    }>;

    const rows = result.rows.map((r) => this.toRow(r, z, defaultLeadTimeDays));

    // Worst first: the biggest shortfall against the suggested point is the
    // one to act on, then everything else by how far the setting is off.
    rows.sort((a, b) => {
      if (a.breachesSuggested !== b.breachesSuggested) return a.breachesSuggested ? -1 : 1;
      return (b.gap ?? 0) - (a.gap ?? 0);
    });

    return {
      serviceLevel,
      z,
      defaultLeadTimeDays,
      rows,
      actionableCount: rows.filter((r) => r.breachesSuggested).length,
      unconfiguredCount: rows.filter((r) => r.currentReorderLevel === null).length,
    };
  }

  private toRow(
    r: {
      item_id: string; item_name: string; item_sku: string | null;
      item_unit: string | null;
      on_hand: string; mean_daily: string; sd_daily: string; weeks: number | null;
      lead_time_days: number | null;
      reorder_level: string | null; reorder_qty: string | null;
    },
    z: number,
    defaultLeadTimeDays: number,
  ): ReplenishmentRow {
    const onHand = num(r.on_hand);
    const avgDailyDemand = num(r.mean_daily);
    const demandSd = num(r.sd_daily);
    const weeks = r.weeks ?? 0;
    const hasReliableSigma = weeks >= MIN_WEEKS_FOR_SIGMA;

    const leadTimeAssumed = r.lead_time_days === null;
    const leadTimeDays = r.lead_time_days ?? defaultLeadTimeDays;

    // SS = Z × σ_daily × √LT. With too few observations to trust σ, fall
    // back to half a lead time of average demand — a plain, defensible
    // buffer rather than a statistical claim the data can't support.
    const safetyStock = hasReliableSigma
      ? z * demandSd * Math.sqrt(leadTimeDays)
      : avgDailyDemand * (leadTimeDays / 2);

    const suggestedReorderLevel = avgDailyDemand * leadTimeDays + safetyStock;
    const currentReorderLevel = r.reorder_level === null ? null : num(r.reorder_level);

    // Order back up to the reorder point plus another lead time of cover,
    // unless an explicit reorder qty is configured.
    const configuredQty = r.reorder_qty === null ? null : num(r.reorder_qty);
    const suggestedOrderQty = configuredQty && configuredQty > 0
      ? configuredQty
      : Math.max(0, Math.ceil(suggestedReorderLevel + avgDailyDemand * leadTimeDays - onHand));

    return {
      itemId: r.item_id,
      itemName: r.item_name,
      itemSku: r.item_sku,
      itemUnit: r.item_unit,
      onHand,
      avgDailyDemand,
      demandSd,
      leadTimeDays,
      leadTimeAssumed,
      safetyStock: this.round(safetyStock),
      suggestedReorderLevel: this.round(suggestedReorderLevel),
      currentReorderLevel,
      gap: currentReorderLevel === null
        ? null
        : this.round(suggestedReorderLevel - currentReorderLevel),
      suggestedOrderQty,
      breachesSuggested: onHand <= suggestedReorderLevel,
      hasReliableSigma,
    };
  }

  /** Stock is counted in whole-ish units; three decimals matches the ledger. */
  private round(v: number): number {
    return Math.round(v * 1000) / 1000;
  }

  /**
   * Write the computed reorder points onto items.reorder_level.
   *
   * The levels are recomputed here from the same inputs rather than accepted
   * from the caller, so a stale analytics page cannot persist stale numbers.
   *
   * Default mode is 'unconfigured': it only fills items nobody has set a
   * level for. Overwriting hand-typed thresholds in bulk is destructive and
   * has to be asked for explicitly.
   */
  async applySuggestions(input: ApplyReplenishmentInput): Promise<ApplyResult> {
    const { rows } = await this.suggestions(input);
    const selected = new Set(input.itemIds ?? []);

    const eligible = rows.filter((r) => {
      if (!input.includeThinHistory && !r.hasReliableSigma) return false;
      if (input.mode === 'selected') return selected.has(r.itemId);
      if (input.mode === 'unconfigured') return r.currentReorderLevel === null;
      return true;
    });

    // A suggested point of zero is not a threshold — it would fire only at
    // empty, which the out-of-stock alert already covers.
    const writable = eligible.filter((r) => r.suggestedReorderLevel > 0);

    const result: ApplyResult = {
      applied: 0,
      skippedZeroLevel: eligible.length - writable.length,
      thinHistoryApplied: writable.filter((r) => !r.hasReliableSigma).length,
      overwritten: writable.filter((r) => r.currentReorderLevel !== null).length,
      dryRun: input.dryRun,
      items: writable.map((r) => ({
        itemId: r.itemId,
        itemName: r.itemName,
        previousLevel: r.currentReorderLevel,
        newLevel: r.suggestedReorderLevel,
        newOrderQty: r.suggestedOrderQty > 0 ? r.suggestedOrderQty : null,
      })),
    };
    if (input.dryRun || writable.length === 0) return result;

    // One statement, so a partial failure can't leave half the catalogue
    // on new thresholds and half on old.
    const values = sql.join(
      writable.map((r) => sql`(
        ${r.itemId}::uuid,
        ${r.suggestedReorderLevel}::numeric,
        ${r.suggestedOrderQty > 0 ? r.suggestedOrderQty : null}::numeric
      )`),
      sql`, `,
    );
    await this.db.execute(sql`
      UPDATE items i
      SET reorder_level = v.level,
          reorder_qty = COALESCE(v.qty, i.reorder_qty),
          updated_at = NOW()
      FROM (VALUES ${values}) AS v(item_id, level, qty)
      WHERE i.id = v.item_id
        AND i.tenant_id = ${this.tenantId}
    `);
    result.applied = writable.length;
    return result;
  }
}

export interface ApplyResult {
  /** Rows actually written (0 on a dry run). */
  applied: number;
  /** Eligible but suggested level computed to zero, so left alone. */
  skippedZeroLevel: number;
  /** Of those written, how many rested on a thin-history fallback. */
  thinHistoryApplied: number;
  /** Of those written, how many replaced an existing hand-set level. */
  overwritten: number;
  dryRun: boolean;
  items: Array<{
    itemId: string;
    itemName: string;
    previousLevel: number | null;
    newLevel: number;
    newOrderQty: number | null;
  }>;
}
