/**
 * Manufacturing Phase 2 — Batch suggestion service (FEFO).
 *
 * Surfaces available batches for a given item + warehouse, sorted by
 * earliest expiry (FEFO). Expiry dates are sourced from GRN lines (RM /
 * packing), WO output rows (FG used as input in downstream WOs) and reclaim
 * lines (material recovered from torn-down FG — short-dated by definition, so
 * it has to sort ahead of fresh stock or it spoils in the tank).
 *
 * Plan: docs/manufacturing-plan.md §5.3 + delivery.service.ts FEFO pattern.
 */

import { sql } from 'drizzle-orm';
import type { Db } from '@runq/db';
import type { SuggestedBatch } from '@runq/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = any;

export class BatchSuggestService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async suggest(
    inputItemId: string,
    warehouseId: string,
    requiredQty?: number,
  ): Promise<SuggestedBatch[]> {
    return this.querySuggestions(this.db, inputItemId, warehouseId, requiredQty);
  }

  /** Same query callable inside a transaction (for use by close flow). */
  async suggestInTx(
    tx: Tx,
    inputItemId: string,
    warehouseId: string,
  ): Promise<SuggestedBatch[]> {
    return this.querySuggestions(tx, inputItemId, warehouseId, undefined);
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  private async querySuggestions(
    db: Tx,
    inputItemId: string,
    warehouseId: string,
    requiredQty: number | undefined,
  ): Promise<SuggestedBatch[]> {
    const qtyFilter = requiredQty != null && requiredQty > 0
      ? sql`AND soh.qty >= ${requiredQty}`
      : sql``;

    const result = await db.execute(sql`
      WITH batch_expiry AS (
        SELECT batch_no, MIN(expiry_date) AS expiry_date
        FROM inventory_grn_lines
        WHERE tenant_id = ${this.tenantId}
          AND item_id = ${inputItemId}
          AND batch_no IS NOT NULL
          AND expiry_date IS NOT NULL
        GROUP BY batch_no
        UNION ALL
        SELECT batch_no, expiry_date
        FROM wo_output
        WHERE tenant_id = ${this.tenantId}
          AND output_item_id = ${inputItemId}
          AND expiry_date IS NOT NULL
        UNION ALL
        SELECT recovered_batch_no AS batch_no, expiry_date
        FROM mfg_reclaim_lines
        WHERE tenant_id = ${this.tenantId}
          AND recovered_item_id = ${inputItemId}
          AND recovered_batch_no IS NOT NULL
          AND expiry_date IS NOT NULL
      ),
      min_expiry AS (
        SELECT batch_no, MIN(expiry_date) AS expiry_date
        FROM batch_expiry
        GROUP BY batch_no
      ),
      -- Stock nobody typed an expiry for. Raw milk posts straight to the
      -- ledger against its procurement consignment, so it reaches FEFO with
      -- no date at all and sorts last — the freshest can ahead of milk that
      -- is about to turn. Where the item declares a shelf life, count it from
      -- the first inbound movement's business date: an MP receipt stamps that
      -- with the collection date, so the clock starts when the milk was
      -- collected. A typed date still wins (see the COALESCE below).
      derived_expiry AS (
        SELECT sl.batch_no,
               (MIN(sl.moved_at)::date + i.shelf_life_days::int) AS expiry_date
        FROM stock_ledger sl
        JOIN items i ON i.id = sl.item_id AND i.tenant_id = sl.tenant_id
        WHERE sl.tenant_id = ${this.tenantId}
          AND sl.item_id = ${inputItemId}
          AND sl.batch_no IS NOT NULL
          AND sl.qty_in > 0
          AND i.shelf_life_days IS NOT NULL
        GROUP BY sl.batch_no, i.shelf_life_days
      )
      SELECT
        soh.batch_no,
        soh.qty::float   AS available_qty,
        soh.avg_cost::float AS unit_cost,
        soh.last_movement_at,
        COALESCE(me.expiry_date, de.expiry_date) AS expiry_date
      FROM stock_on_hand soh
      LEFT JOIN min_expiry me ON me.batch_no = soh.batch_no
      LEFT JOIN derived_expiry de ON de.batch_no = soh.batch_no
      WHERE soh.tenant_id = ${this.tenantId}
        AND soh.item_id = ${inputItemId}
        AND soh.warehouse_id = ${warehouseId}
        AND soh.qty > 0
        ${qtyFilter}
      ORDER BY COALESCE(me.expiry_date, de.expiry_date) ASC NULLS LAST,
               soh.last_movement_at ASC
    `);

    type Row = {
      batch_no: string;
      available_qty: number;
      unit_cost: number;
      last_movement_at: string | Date | null;
      expiry_date: string | null;
    };

    const rows = (result as unknown as { rows: Row[] }).rows;
    return rows.map((r) => ({
      batchNo: r.batch_no,
      availableQty: Number(r.available_qty),
      unitCost: Number(r.unit_cost),
      expiryDate: r.expiry_date ?? null,
      lastMovementAt: r.last_movement_at
        ? new Date(r.last_movement_at).toISOString()
        : null,
    }));
  }
}
