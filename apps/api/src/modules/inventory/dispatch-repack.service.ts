/**
 * Making finished goods at the moment they are dispatched.
 *
 * Some SKUs differ only by their label. A dairy makes one vat of A2 paneer and
 * decides on the loading bay whether it ships as the mass-market brand or the
 * A2 brand; a pack exists as neither until someone applies a label to it.
 * Stocking both SKUs means forecasting that split at production time, which is
 * a guess, and the guess is what makes on-hand figures untrustworthy.
 *
 * So the branded SKUs hold no standing stock. Only the unlabelled pool item is
 * counted. When a delivery line for a branded SKU can't be covered, this
 * service posts an unplanned work order against its `allow_auto_repack` BOM —
 * drawing the pool FEFO, consuming the label — and hands the produced batch
 * back for the line to ship.
 *
 * It runs inside the dispatch transaction, so a repack that can't be sourced
 * takes the whole delivery down with it rather than leaving pool stock consumed
 * with nothing shipped.
 *
 * See migration 0186 and DeliveryNoteService.dispatch.
 */

import { and, eq, sql } from 'drizzle-orm';
import { boms, items, woOutput } from '@runq/db';
import type { Db } from '@runq/db';
import { ConflictError, UnprocessableError } from '../../utils/errors';
import { ProductionEntryService } from '../manufacturing/production-entry.service';
import {
  earliestExpiry,
  needsRepack,
  repackShortageMessage,
  roundQty,
} from './dispatch-repack.logic';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = any;

/** The BOM that turns a pool item into this branded SKU. */
interface RepackBom {
  bomId: string;
  bomName: string;
  skuName: string;
  skuTracksBatches: boolean;
}

export interface RepackOutcome {
  woId: string;
  /**
   * Batch the repack produced — the line ships this. Null when the SKU doesn't
   * track batches, because the ledger rejects a batch_no on such an item.
   */
  batchNo: string | null;
  qty: number;
  bomName: string;
  /** Non-fatal notes raised by the WO close (variance, rounding). */
  warnings: string[];
}

export class DispatchRepackService {
  private readonly production: ProductionEntryService;

  constructor(
    db: Db,
    private readonly tenantId: string,
  ) {
    this.production = new ProductionEntryService(db, tenantId);
  }

  /**
   * Make good a delivery line that stock can't cover, if its SKU is repackable.
   *
   * Returns null when the line needs nothing — no repack BOM, a batch already
   * pinned, or enough on hand. A null return is not a refusal: the caller
   * carries on and the ledger raises its usual insufficient-stock error if the
   * line really is short.
   */
  async topUpInTx(
    tx: Tx,
    line: { itemId: string; batchNo: string | null; qty: number },
    warehouseId: string,
    context: { dnNo: string; dispatchDate: string },
    userId?: string,
  ): Promise<RepackOutcome | null> {
    const bom = await this.findRepackBom(tx, line.itemId);
    const onHandQty = bom ? await this.onHand(tx, line.itemId, warehouseId) : 0;
    const decision = needsRepack({
      qty: line.qty,
      batchNo: line.batchNo,
      onHandQty,
      hasRepackBom: bom !== null,
    });
    if (!decision || !bom) return null;

    return this.runRepack(tx, bom, roundQty(line.qty), warehouseId, context, userId);
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  private async runRepack(
    tx: Tx,
    bom: RepackBom,
    qty: number,
    warehouseId: string,
    context: { dnNo: string; dispatchDate: string },
    userId?: string,
  ): Promise<RepackOutcome> {
    // Previewed first, purely to learn which pool batches the run will draw and
    // therefore what expiry the pack inherits. recordInTx re-derives the
    // allocation itself against the same transaction, so the two agree.
    const preview = await this.production.previewInTx(tx, {
      bomId: bom.bomId,
      producedQty: qty,
      warehouseId,
    });
    if (preview.shortages.length > 0) {
      throw new UnprocessableError(
        repackShortageMessage(bom.skuName, qty, preview.shortages),
        { shortages: preview.shortages },
      );
    }

    const expiryDate = earliestExpiry(preview.allocations);
    if (bom.skuTracksBatches && !expiryDate) {
      throw new ConflictError(
        `${bom.skuName} tracks expiry, but no pool batch behind ${bom.bomName} carries an expiry date — set one on the pool stock before dispatching.`,
      );
    }

    const warnings: string[] = [];
    const woId = await this.production.recordInTx(
      tx,
      {
        bomId: bom.bomId,
        producedQty: qty,
        warehouseId,
        // Left to the WO to number, rather than reusing the pool batch number:
        // uq_wo_output_batch is (tenant, item, batch), so a pool batch repacked
        // into the same SKU twice would collide. What was drawn from where
        // stays recorded in wo_consumption, which is the genealogy that matters.
        batchNo: null,
        expiryDate,
        producedOn: context.dispatchDate,
        notes: `Repacked on dispatch for ${context.dnNo}`,
      },
      warnings,
      userId,
    );

    return {
      woId,
      batchNo: bom.skuTracksBatches ? await this.producedBatchNo(tx, woId) : null,
      qty,
      bomName: bom.bomName,
      warnings,
    };
  }

  /** The active repack recipe for a SKU, or null if it isn't made on demand. */
  private async findRepackBom(tx: Tx, itemId: string): Promise<RepackBom | null> {
    const [row] = await tx
      .select({
        bomId: boms.id,
        bomName: boms.name,
        skuName: items.name,
        skuTracksBatches: items.trackBatches,
      })
      .from(boms)
      .innerJoin(items, eq(items.id, boms.outputItemId))
      .where(and(
        eq(boms.tenantId, this.tenantId),
        eq(boms.outputItemId, itemId),
        eq(boms.isActive, true),
        eq(boms.allowAutoRepack, true),
      ))
      .limit(1);
    return row ?? null;
  }

  /** Branded stock on hand across every batch in the warehouse. */
  private async onHand(tx: Tx, itemId: string, warehouseId: string): Promise<number> {
    const result = await tx.execute(sql`
      SELECT COALESCE(SUM(qty), 0)::float AS qty
      FROM stock_on_hand
      WHERE tenant_id = ${this.tenantId}
        AND item_id = ${itemId}
        AND warehouse_id = ${warehouseId}
    `);
    const row = (result as unknown as { rows: Array<{ qty: number }> }).rows[0];
    return Number(row?.qty ?? 0);
  }

  private async producedBatchNo(tx: Tx, woId: string): Promise<string> {
    const [row] = await tx
      .select({ batchNo: woOutput.batchNo })
      .from(woOutput)
      .where(and(eq(woOutput.tenantId, this.tenantId), eq(woOutput.woId, woId)))
      .limit(1);
    // recordInTx posts exactly one output row and would have thrown otherwise.
    return row!.batchNo as string;
  }
}
