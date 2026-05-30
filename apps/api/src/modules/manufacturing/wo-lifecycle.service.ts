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
import { NotFoundError, ConflictError } from '../../utils/errors';
import { WorkOrderService } from './wo.service';
import { StockLedgerService } from '../inventory/stock-ledger.service';
import { ManufacturingGlPoster } from './gl-poster';
import {
  assignOutputCosts,
  computePreview,
  consumedByClass,
  isHighVariance,
} from './costing.service';
import type { WorkOrderWithDetail } from '@runq/types';
import type { CloseWorkOrderInput } from '@runq/validators';

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
    await this.db.transaction(async (tx: Tx) => {
      const wo = await this.loadWo(tx, id);
      if (wo.status !== 'draft') {
        throw new ConflictError(`WO must be draft to start (current: ${wo.status})`);
      }
      await tx
        .update(workOrders)
        .set({ status: 'in_progress', startedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(workOrders.id, id), eq(workOrders.tenantId, this.tenantId)));
    });
    void userId;
    return this.woService.getById(id);
  }

  async complete(id: string, userId?: string): Promise<WorkOrderWithDetail> {
    await this.db.transaction(async (tx: Tx) => {
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
    });
    void userId;
    return this.woService.getById(id);
  }

  async close(
    id: string,
    input: CloseWorkOrderInput,
    userId?: string,
  ): Promise<CloseResult> {
    const warnings: string[] = [];

    await this.db.transaction(async (tx: Tx) => {
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
    });

    return { data: await this.woService.getById(id), warnings };
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

      for (const row of consumptionRows) {
        await this.ledger.recordMovement(tx, {
          itemId: row.inputItemId,
          warehouseId: row.warehouseId,
          batchNo: row.batchNo ?? null,
          movementType: 'reversal',
          sourceType: 'work_order_reversal',
          sourceId: row.id,
          qtyDelta: Number(row.qty),
          unitCost: Number(row.unitCost),
          movedAt: new Date(),
          postedBy: userId ?? null,
        });
      }

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
