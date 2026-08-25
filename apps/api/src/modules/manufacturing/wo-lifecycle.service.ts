/**
 * Manufacturing Phase 2 — WO lifecycle transitions.
 *
 * start / complete / close / cancel-after-start.
 *
 * Separated from wo.service.ts to keep both files under 500 lines.
 * Uses WorkOrderService.getById for re-fetching to maintain consistent
 * denormalised-total + joined-name enrichment.
 *
 * Plan: docs/manufacturing-plan.md §5.2–5.3, §8.4–8.5.
 */

import { and, eq, sql, inArray } from 'drizzle-orm';
import { workOrders, woConsumption, woOutput, items, boms } from '@runq/db';
import type { Db } from '@runq/db';
import { NotFoundError, ConflictError, UnprocessableError } from '../../utils/errors';
import { WorkOrderService } from './wo.service';
import { StockLedgerService } from '../inventory/stock-ledger.service';
import { AdjustmentService } from '../inventory/adjustment.service';
import { ManufacturingGlPoster } from './gl-poster';
import { restoreConsumedInputs } from './wo-reversal.service';
import {
  assignOutputCosts,
  computePreview,
  consumedByClass,
  isHighVariance,
} from './costing.service';
import type { WorkOrderWithDetail } from '@runq/types';
import type { CloseWorkOrderInput, WastageInput } from '@runq/validators';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = any;

export interface CloseResult {
  data: WorkOrderWithDetail;
  warnings: string[];
}

export class WoLifecycleService {
  private readonly ledger: StockLedgerService;
  private readonly woService: WorkOrderService;

  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {
    this.ledger = new StockLedgerService(tenantId);
    this.woService = new WorkOrderService(db, tenantId);
  }

  async start(id: string, userId?: string): Promise<WorkOrderWithDetail> {
    await this.db.transaction((tx: Tx) => this.startInTx(tx, id));
    void userId;
    return this.woService.getById(id);
  }

  /** `start`, joining a caller's transaction — see WoConsumptionService.recordInTx. */
  async startInTx(tx: Tx, id: string): Promise<void> {
    const wo = await this.loadWo(tx, id);
    if (wo.status !== 'draft') {
      throw new ConflictError(`WO must be draft to start (current: ${wo.status})`);
    }
    await tx
      .update(workOrders)
      .set({ status: 'in_progress', startedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(workOrders.id, id), eq(workOrders.tenantId, this.tenantId)));
  }

  async complete(id: string, userId?: string): Promise<WorkOrderWithDetail> {
    await this.db.transaction((tx: Tx) => this.completeInTx(tx, id));
    void userId;
    return this.woService.getById(id);
  }

  /** `complete`, joining a caller's transaction. */
  async completeInTx(tx: Tx, id: string): Promise<void> {
    const wo = await this.loadWo(tx, id);
    if (wo.status !== 'in_progress') {
      throw new ConflictError(`WO must be in_progress to complete (current: ${wo.status})`);
    }
    const [outputCount] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(woOutput)
      .where(and(eq(woOutput.woId, id), eq(woOutput.tenantId, this.tenantId)));
    if ((outputCount?.n ?? 0) === 0) {
      throw new ConflictError('Cannot complete WO with zero output rows');
    }
    await tx
      .update(workOrders)
      .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(workOrders.id, id), eq(workOrders.tenantId, this.tenantId)));
  }

  async close(
    id: string,
    input: CloseWorkOrderInput,
    userId?: string,
  ): Promise<CloseResult> {
    const warnings: string[] = [];
    await this.db.transaction((tx: Tx) => this.closeInTx(tx, id, input, warnings, userId));
    return { data: await this.woService.getById(id), warnings };
  }

  /**
   * The close posting itself, joining a caller's transaction. Appends to
   * `warnings` rather than returning them, so the wrapper can surface them
   * after the transaction commits.
   */
  async closeInTx(
    tx: Tx,
    id: string,
    input: CloseWorkOrderInput,
    warnings: string[],
    userId?: string,
  ): Promise<void> {
    const wo = await this.loadWo(tx, id);
    if (wo.status !== 'completed') {
      throw new ConflictError(`WO must be completed to close (current: ${wo.status})`);
    }

    type ConsumptionRow = typeof woConsumption.$inferSelect;
    type OutputRow = typeof woOutput.$inferSelect;

    const [consumptionRows, outputRows] = await Promise.all([
      tx.select().from(woConsumption)
        .where(and(eq(woConsumption.woId, id), eq(woConsumption.tenantId, this.tenantId))) as Promise<ConsumptionRow[]>,
      tx.select().from(woOutput)
        .where(and(eq(woOutput.woId, id), eq(woOutput.tenantId, this.tenantId))) as Promise<OutputRow[]>,
    ]);

    if (outputRows.length === 0) {
      throw new ConflictError('Cannot close WO with zero output rows');
    }

    // Load item classes for each consumed item
    const itemIds = [...new Set(consumptionRows.map((c) => c.inputItemId))];
    const itemClassMap = await this.loadItemClasses(tx, itemIds);

    // Load output items' trackBatches flags. wo_output.batch_no is always
    // populated (production-lot identifier for traceability), but the
    // inventory ledger refuses batch_no for items that don't track batches.
    // Pass null at the ledger boundary when the item is non-batch.
    const outputItemIds = [...new Set(outputRows.map((o) => o.outputItemId))];
    const outputTracksMap = await this.loadTrackBatchesMap(tx, outputItemIds);

    const consumptionForCosting = consumptionRows.map((c) => ({
      itemClass: itemClassMap.get(c.inputItemId) ?? null,
      value: Number(c.value),
    }));
    const outputForCosting = outputRows.map((o) => ({
      qty: Number(o.qty),
    }));

    const consumedValue = consumptionForCosting.reduce((s: number, c: { value: number }) => s + c.value, 0);
    const costAssignment = assignOutputCosts(outputForCosting, consumedValue);

    // Back-fill unit_cost + value on each output row and create stock ledger entry
    for (let i = 0; i < outputRows.length; i++) {
      const row = outputRows[i]!;
      const cost = costAssignment.rows[i]!;

      await tx
        .update(woOutput)
        .set({
          unitCost: String(cost.unitCost),
          value: String(cost.value),
        })
        .where(eq(woOutput.id, row.id));

      const { ledgerId } = await this.ledger.recordMovement(tx, {
        itemId: row.outputItemId,
        warehouseId: row.warehouseId,
        batchNo: outputTracksMap.get(row.outputItemId) ? row.batchNo : null,
        movementType: 'production_in',
        sourceType: 'work_order',
        sourceId: id,
        sourceLineId: row.id,
        qtyDelta: Number(row.qty),
        unitCost: cost.unitCost,
        movedAt: new Date(),
        postedBy: userId ?? null,
      });

      await tx
        .update(woOutput)
        .set({ stockTxnId: ledgerId })
        .where(eq(woOutput.id, row.id));
    }

    // Costing preview for variance + warnings
    const preview = computePreview({
      woId: id,
      plannedQty: Number(wo.plannedQty),
      consumption: consumptionForCosting,
      output: outputForCosting,
    });

    if (!input.varianceAcknowledged && isHighVariance(preview.varianceQty, preview.expectedOutputQty)) {
      warnings.push(
        `High yield variance: actual ${preview.actualOutputQty} vs expected ${preview.expectedOutputQty} (${Math.abs(preview.varianceQty / preview.expectedOutputQty * 100).toFixed(1)}%). Re-submit with varianceAcknowledged=true to confirm.`,
      );
    }

    const outputValue = costAssignment.totalOutputValue;
    const bomRow = await this.loadBom(tx, wo.bomId);
    const consumedValueByClass = consumedByClass(consumptionForCosting);

    const today = new Date().toISOString().slice(0, 10);
    const poster = new ManufacturingGlPoster(tx, this.tenantId, userId);
    const jeId = await poster.postClose({
      date: today,
      woId: id,
      woNumber: wo.woNumber,
      bomName: bomRow?.name ?? '',
      outputValue,
      consumedValue,
      consumedValueByClass,
    });

    await tx
      .update(workOrders)
      .set({
        status: 'closed',
        closedAt: new Date(),
        jeId: jeId ?? null,
        outputValue: String(outputValue),
        consumedValue: String(consumedValue),
        yieldVariance: String(preview.varianceValue),
        updatedAt: new Date(),
      })
      .where(and(eq(workOrders.id, id), eq(workOrders.tenantId, this.tenantId)));

    if (jeId) {
      await tx.execute(sql`
        UPDATE stock_ledger SET journal_entry_id = ${jeId}
        WHERE tenant_id = ${this.tenantId}
          AND source_type = 'work_order'
          AND source_id = ${id}
      `);
    }

    if (input.wastage) {
      const fallbackWarehouse = consumptionRows[0]?.warehouseId;
      await this.postWastage(tx, id, wo.woNumber, today, input.wastage, fallbackWarehouse, userId);
    }
  }

  /**
   * Write off input material that never reached output, as a production_loss
   * adjustment linked back to this WO.
   *
   * Deliberately NOT booked as extra consumption: absorbing it into the
   * finished goods' unit cost is the textbook treatment for normal loss, but
   * it also makes the loss invisible, which is the opposite of what a wastage
   * register is for. It goes to 5104 Inventory Write-off instead, where the
   * daily report can price it.
   *
   * Posted inside the close transaction — if the write-off fails (no stock in
   * the batch, say) the whole close rolls back rather than leaving a closed WO
   * beside a stranded draft adjustment.
   */
  private async postWastage(
    tx: Tx,
    woId: string,
    woNumber: string,
    date: string,
    wastage: WastageInput,
    fallbackWarehouseId: string | undefined,
    userId?: string,
  ): Promise<void> {
    const warehouseId = wastage.warehouseId ?? fallbackWarehouseId;
    if (!warehouseId) {
      throw new ConflictError('Cannot record wastage: no warehouse on the run to draw it from');
    }

    const adjustments = new AdjustmentService({ db: this.db, tenantId: this.tenantId, userId });
    const adj = await adjustments.createInTx(tx, {
      warehouseId,
      reason: 'production_loss',
      adjustmentDate: date,
      notes: wastage.notes ?? `Wastage on ${woNumber}`,
      sourceWoId: woId,
      lines: await this.resolveWastageLines(tx, woId, warehouseId, wastage),
    });

    // Zero-cost stock (MP raw milk, already expensed at cycle lock) prices the
    // write-off at 0, and postAdjustment skips the JE for a zero delta — the
    // litres are still recorded, so the wastage register stays complete.
    await adjustments.postInTx(tx, adj.id);
  }

  /**
   * Spread each wasted quantity across the batches the run left behind.
   *
   * Called after consumption has posted, so `stock_on_hand` already reflects
   * the draw. The caller must not pick the batch: FEFO drains the oldest batch
   * outright for the run itself, so a write-off aimed at the first allocated
   * batch hits a zero balance — which is exactly what the plant hit.
   *
   * An explicit batchNo is honoured as-is, for wastage traced to one batch.
   */
  private async resolveWastageLines(
    tx: Tx,
    woId: string,
    warehouseId: string,
    wastage: WastageInput,
  ): Promise<Array<{ itemId: string; batchNo: string | null; qtyDelta: number; notes: string | null }>> {
    const tracksBatches = await this.loadTrackBatchesMap(tx, wastage.lines.map((l) => l.itemId));
    const lines = [];

    for (const l of wastage.lines) {
      const qty = Math.abs(l.qty);
      const notes = l.notes ?? null;
      if (l.batchNo || !tracksBatches.get(l.itemId)) {
        lines.push({ itemId: l.itemId, batchNo: l.batchNo ?? null, qtyDelta: -qty, notes });
        continue;
      }

      let left = qty;
      for (const b of await this.wastageBatches(tx, woId, l.itemId, warehouseId)) {
        if (left <= 0) break;
        const take = Math.min(left, b.qty);
        if (take <= 0) continue;
        lines.push({ itemId: l.itemId, batchNo: b.batchNo, qtyDelta: -take, notes });
        left -= take;
      }
      if (left > 1e-6) await this.throwWastageShortage(tx, l.itemId, qty, qty - left);
    }
    return lines;
  }

  /**
   * Batches to draw the wastage from, best candidate first.
   *
   * The batches this run consumed come first, most-recently-drawn first: the
   * run empties each batch in turn, so the remainder sits in the last one it
   * touched — that is the milk still in the tank when packing ended. Batches
   * the run never touched come after, oldest movement first, as a fallback for
   * wastage larger than the run's own leftovers.
   */
  private async wastageBatches(
    tx: Tx,
    woId: string,
    itemId: string,
    warehouseId: string,
  ): Promise<Array<{ batchNo: string; qty: number }>> {
    const result = await tx.execute(sql`
      SELECT soh.batch_no, soh.qty::float AS qty
      FROM stock_on_hand soh
      LEFT JOIN (
        SELECT batch_no, MAX(consumed_at) AS last_at
        FROM wo_consumption
        WHERE wo_id = ${woId} AND input_item_id = ${itemId} AND batch_no IS NOT NULL
        GROUP BY batch_no
      ) c ON c.batch_no = soh.batch_no
      WHERE soh.tenant_id = ${this.tenantId}
        AND soh.item_id = ${itemId}
        AND soh.warehouse_id = ${warehouseId}
        AND soh.qty > 0
        AND soh.batch_no IS NOT NULL AND soh.batch_no <> ''
      ORDER BY c.last_at DESC NULLS LAST, soh.last_movement_at ASC
    `);
    return (result as unknown as { rows: Array<{ batch_no: string; qty: number }> }).rows
      .map((r) => ({ batchNo: r.batch_no, qty: Number(r.qty) }));
  }

  /** Names the item and what the run actually left, so the floor can act on it. */
  private async throwWastageShortage(
    tx: Tx,
    itemId: string,
    requested: number,
    available: number,
  ): Promise<never> {
    const [item] = await tx
      .select({ name: items.name, unit: items.unit })
      .from(items)
      .where(and(eq(items.id, itemId), eq(items.tenantId, this.tenantId)))
      .limit(1);
    const uom = item?.unit ? ` ${item.unit}` : '';
    throw new UnprocessableError(
      `Cannot write off ${requested}${uom} of ${item?.name ?? 'this item'} — only ` +
      `${Number(available.toFixed(3))}${uom} is left after this run.`,
    );
  }

  async cancelWithReversal(
    id: string,
    reason: string | null,
    userId?: string,
  ): Promise<WorkOrderWithDetail> {
    await this.db.transaction(async (tx: Tx) => {
      const wo = await this.loadWo(tx, id);
      if (wo.status === 'closed' || wo.status === 'cancelled') {
        throw new ConflictError(`Cannot cancel WO in status: ${wo.status}`);
      }

      // Reverse all consumption stock movements
      type CRow = typeof woConsumption.$inferSelect;
      const consumptionRows = (await tx
        .select()
        .from(woConsumption)
        .where(and(eq(woConsumption.woId, id), eq(woConsumption.tenantId, this.tenantId)))) as CRow[];

      await restoreConsumedInputs(this.ledger, tx, consumptionRows, userId);

      // Delete output rows (no ledger entries pre-close)
      await tx.delete(woOutput)
        .where(and(eq(woOutput.woId, id), eq(woOutput.tenantId, this.tenantId)));

      await tx
        .update(workOrders)
        .set({
          status: 'cancelled',
          cancelledAt: new Date(),
          cancelledReason: reason ?? null,
          outputQty: '0',
          consumedValue: '0',
          outputValue: '0',
          yieldVariance: '0',
          updatedAt: new Date(),
        })
        .where(and(eq(workOrders.id, id), eq(workOrders.tenantId, this.tenantId)));
    });
    void userId;
    return this.woService.getById(id);
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  private async loadWo(tx: Tx, woId: string) {
    const [wo] = await tx
      .select()
      .from(workOrders)
      .where(and(eq(workOrders.id, woId), eq(workOrders.tenantId, this.tenantId)))
      .limit(1);
    if (!wo) throw new NotFoundError('WorkOrder');
    return wo as typeof workOrders.$inferSelect;
  }

  private async loadBom(tx: Tx, bomId: string) {
    const [bom] = await tx
      .select({ name: boms.name })
      .from(boms)
      .where(and(eq(boms.id, bomId), eq(boms.tenantId, this.tenantId)))
      .limit(1);
    return bom;
  }

  private async loadItemClasses(tx: Tx, itemIds: string[]): Promise<Map<string, string | null>> {
    if (itemIds.length === 0) return new Map();
    const rows = await tx
      .select({ id: items.id, itemClass: items.itemClass })
      .from(items)
      .where(and(eq(items.tenantId, this.tenantId), inArray(items.id, itemIds)));
    return new Map(rows.map((r: { id: string; itemClass: string | null }) => [r.id, r.itemClass]));
  }

  private async loadTrackBatchesMap(tx: Tx, itemIds: string[]): Promise<Map<string, boolean>> {
    if (itemIds.length === 0) return new Map();
    const rows = await tx
      .select({ id: items.id, trackBatches: items.trackBatches })
      .from(items)
      .where(and(eq(items.tenantId, this.tenantId), inArray(items.id, itemIds)));
    return new Map(rows.map((r: { id: string; trackBatches: boolean }) => [r.id, r.trackBatches]));
  }
}
