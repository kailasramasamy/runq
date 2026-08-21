/**
 * Manufacturing — reversing a *closed* work order.
 *
 * `WoLifecycleService.cancelWithReversal` deliberately refuses closed WOs: at
 * close the output has entered stock and the run has been costed, so unwinding
 * it is a different job from abandoning a run in progress. This service does
 * that job, and it is what "correct a recorded production" is built on —
 * inputs go back on the shelf, the output batch comes off it, and the close JE
 * (when one was posted) is flipped.
 *
 * The WO lands in `cancelled` rather than back in `draft`: the stock ledger
 * rows that reference it stay meaningful, reports already exclude cancelled
 * runs, and the corrected figures are re-entered as a fresh run.
 */

import { and, eq, sql, inArray } from 'drizzle-orm';
import { workOrders, woConsumption, woOutput, items, boms } from '@runq/db';
import type { Db } from '@runq/db';
import { NotFoundError, ConflictError } from '../../utils/errors';
import { WorkOrderService } from './wo.service';
import { StockLedgerService } from '../inventory/stock-ledger.service';
import { ManufacturingGlPoster } from './gl-poster';
import { consumedByClass } from './costing.service';
import type { WorkOrderWithDetail } from '@runq/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = any;

type ConsumptionRow = typeof woConsumption.$inferSelect;
type OutputRow = typeof woOutput.$inferSelect;

/**
 * Put consumed inputs back on the shelf at the cost they left at. Shared with
 * `cancelWithReversal`, which unwinds the same rows for a run abandoned before
 * close.
 */
export async function restoreConsumedInputs(
  ledger: StockLedgerService,
  tx: Tx,
  rows: ConsumptionRow[],
  userId?: string,
): Promise<void> {
  for (const row of rows) {
    await ledger.recordMovement(tx, {
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
}

export class WoReversalService {
  private readonly ledger: StockLedgerService;
  private readonly woService: WorkOrderService;

  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {
    this.ledger = new StockLedgerService(tenantId);
    this.woService = new WorkOrderService(db, tenantId);
  }

  async reverseClosed(
    id: string,
    reason: string | null,
    userId?: string,
  ): Promise<WorkOrderWithDetail> {
    await this.db.transaction(async (tx: Tx) => {
      const wo = await this.loadWo(tx, id);
      if (wo.status !== 'closed') {
        throw new ConflictError(`Only a closed run can be reversed (current: ${wo.status})`);
      }

      const [consumptionRows, outputRows] = await Promise.all([
        tx.select().from(woConsumption)
          .where(and(eq(woConsumption.woId, id), eq(woConsumption.tenantId, this.tenantId))) as Promise<ConsumptionRow[]>,
        tx.select().from(woOutput)
          .where(and(eq(woOutput.woId, id), eq(woOutput.tenantId, this.tenantId))) as Promise<OutputRow[]>,
      ]);

      // Refuse before touching anything: once the output has been sold, issued
      // to another run or adjusted away, taking it back off the shelf would
      // either fail deep in the ledger or drive that batch negative.
      await this.assertOutputUntouched(tx, outputRows);
      await this.reverseOutputMovements(tx, outputRows, userId);
      await restoreConsumedInputs(this.ledger, tx, consumptionRows, userId);
      await this.reverseCloseJe(tx, wo, consumptionRows, outputRows, reason, userId);

      // Output rows are kept, not deleted: the reversal ledger entries point at
      // them by source_line_id, and reports filter on WO status anyway.
      await tx
        .update(workOrders)
        .set({
          status: 'cancelled',
          cancelledAt: new Date(),
          cancelledReason: reason ?? 'Reversed for correction',
          outputQty: '0',
          consumedValue: '0',
          outputValue: '0',
          yieldVariance: '0',
          updatedAt: new Date(),
        })
        .where(and(eq(workOrders.id, id), eq(workOrders.tenantId, this.tenantId)));
    });
    return this.woService.getById(id);
  }

  /** Take the produced batch back off the shelf. Mirrors the close posting. */
  private async reverseOutputMovements(
    tx: Tx,
    rows: OutputRow[],
    userId?: string,
  ): Promise<void> {
    const tracksMap = await this.loadTrackBatchesMap(tx, rows.map((r) => r.outputItemId));
    for (const row of rows) {
      await this.ledger.recordMovement(tx, {
        itemId: row.outputItemId,
        warehouseId: row.warehouseId,
        batchNo: tracksMap.get(row.outputItemId) ? row.batchNo : null,
        movementType: 'reversal',
        sourceType: 'work_order_reversal',
        sourceId: row.id,
        sourceLineId: row.id,
        qtyDelta: -Number(row.qty),
        unitCost: Number(row.unitCost),
        movedAt: new Date(),
        postedBy: userId ?? null,
      });
    }
  }

  /**
   * Every produced unit must still be sitting where it was put. Checked up
   * front so the operator gets "this batch has already moved on" instead of
   * the ledger's generic insufficient-stock error three writes later — and so
   * an item flagged `allowNegativeStock` can't quietly go negative.
   */
  private async assertOutputUntouched(tx: Tx, rows: OutputRow[]): Promise<void> {
    const tracksMap = await this.loadTrackBatchesMap(tx, rows.map((r) => r.outputItemId));
    for (const row of rows) {
      const batchKey = tracksMap.get(row.outputItemId) ? (row.batchNo ?? '') : '';
      const result = await tx.execute(sql`
        SELECT qty::text AS qty FROM stock_on_hand
        WHERE tenant_id = ${this.tenantId}
          AND item_id = ${row.outputItemId}
          AND warehouse_id = ${row.warehouseId}
          AND batch_no = ${batchKey}
      `);
      const onHand = Number(
        (result as unknown as { rows: Array<{ qty: string }> }).rows[0]?.qty ?? 0,
      );
      // Epsilon: on-hand is numeric(18,3) and qty came back through the same
      // rounding, so an exact compare would trip on the last decimal place.
      if (onHand + 1e-6 < Number(row.qty)) {
        const label = batchKey ? `Batch ${batchKey}` : 'The output';
        throw new ConflictError(
          `${label} has already moved on (${onHand} on hand, ${Number(row.qty)} produced). ` +
            'Reverse the sale, issue or adjustment that used it first.',
        );
      }
    }
  }

  /**
   * Flip the close JE. Under v1 actual costing output value equals consumed
   * value and `postClose` writes nothing, so `je_id` is usually null and this
   * is a no-op — it earns its keep once standard costing lands.
   */
  private async reverseCloseJe(
    tx: Tx,
    wo: typeof workOrders.$inferSelect,
    consumptionRows: ConsumptionRow[],
    outputRows: OutputRow[],
    reason: string | null,
    userId?: string,
  ): Promise<void> {
    if (!wo.jeId) return;
    const itemClassMap = await this.loadItemClasses(tx, consumptionRows.map((c) => c.inputItemId));
    const consumption = consumptionRows.map((c) => ({
      itemClass: itemClassMap.get(c.inputItemId) ?? null,
      value: Number(c.value),
    }));
    const [bom] = await tx
      .select({ name: boms.name })
      .from(boms)
      .where(and(eq(boms.id, wo.bomId), eq(boms.tenantId, this.tenantId)))
      .limit(1);
    const poster = new ManufacturingGlPoster(tx, this.tenantId, userId);
    await poster.reverseClose({
      date: new Date().toISOString().slice(0, 10),
      woId: wo.id,
      woNumber: wo.woNumber,
      bomName: bom?.name ?? '',
      outputValue: outputRows.reduce((sum, o) => sum + Number(o.value), 0),
      consumedValue: consumption.reduce((sum, c) => sum + c.value, 0),
      consumedValueByClass: consumedByClass(consumption),
      reason: reason ?? 'correction',
    });
  }

  private async loadWo(tx: Tx, woId: string) {
    const [wo] = await tx
      .select()
      .from(workOrders)
      .where(and(eq(workOrders.id, woId), eq(workOrders.tenantId, this.tenantId)))
      .limit(1);
    if (!wo) throw new NotFoundError('WorkOrder');
    return wo as typeof workOrders.$inferSelect;
  }

  private async loadItemClasses(tx: Tx, itemIds: string[]): Promise<Map<string, string | null>> {
    const ids = [...new Set(itemIds)];
    if (ids.length === 0) return new Map();
    const rows = await tx
      .select({ id: items.id, itemClass: items.itemClass })
      .from(items)
      .where(and(eq(items.tenantId, this.tenantId), inArray(items.id, ids)));
    return new Map(rows.map((r: { id: string; itemClass: string | null }) => [r.id, r.itemClass]));
  }

  private async loadTrackBatchesMap(tx: Tx, itemIds: string[]): Promise<Map<string, boolean>> {
    const ids = [...new Set(itemIds)];
    if (ids.length === 0) return new Map();
    const rows = await tx
      .select({ id: items.id, trackBatches: items.trackBatches })
      .from(items)
      .where(and(eq(items.tenantId, this.tenantId), inArray(items.id, ids)));
    return new Map(rows.map((r: { id: string; trackBatches: boolean }) => [r.id, r.trackBatches]));
  }
}
