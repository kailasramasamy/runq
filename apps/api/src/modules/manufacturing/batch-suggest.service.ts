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
      )
      SELECT
        soh.batch_no,
        soh.qty::float   AS available_qty,
        soh.avg_cost::float AS unit_cost,
        me.expiry_date
      FROM stock_on_hand soh
      LEFT JOIN min_expiry me ON me.batch_no = soh.batch_no
      WHERE soh.tenant_id = ${this.tenantId}
        AND soh.item_id = ${inputItemId}
        AND soh.warehouse_id = ${warehouseId}
        AND soh.qty > 0
        ${qtyFilter}
      ORDER BY me.expiry_date ASC NULLS LAST, soh.last_movement_at ASC
    `);

    type Row = {
      batch_no: string;
      available_qty: number;
      unit_cost: number;
      expiry_date: string | null;
    };

    const rows = (result as unknown as { rows: Row[] }).rows;
    return rows.map((r) => ({
      batchNo: r.batch_no,
      availableQty: Number(r.available_qty),
      unitCost: Number(r.unit_cost),
      expiryDate: r.expiry_date ?? null,
    }));
  }
}
