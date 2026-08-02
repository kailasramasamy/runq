/**
 * Manufacturing — unplanned production entry ("Record Production").
 *
 * When the plant manager is away, technicians make product without a work
 * order. This service lets them state what came out; the inputs are
 * backflushed from the BOM, allocated FEFO, and the whole run posts as one
 * work order flagged `entry_mode = 'unplanned'`.
 *
 * Deliberately reuses the WO engine end to end (consume → output → complete →
 * close) rather than posting stock directly: costing, the stock ledger, GL and
 * every manufacturing report stay single-sourced. The only thing this adds is
 * the backflush and the FEFO allocation the manager would otherwise do by hand.
 *
 * Spec: docs/manufacturing-plan.md §5.6.
 */

import { and, eq, sql } from 'drizzle-orm';
import { boms, bomLines, items, warehouses, workOrders } from '@runq/db';
import type { Db } from '@runq/db';
import { NotFoundError, ConflictError, UnprocessableError } from '../../utils/errors';
import { WorkOrderService } from './wo.service';
import { WoConsumptionService } from './consumption.service';
import { WoOutputService } from './output.service';
import { WoLifecycleService } from './wo-lifecycle.service';
import { BatchSuggestService } from './batch-suggest.service';
import {
  allocateFefo,
  applyOverrides,
  computeRequiredQty,
  findOverdrawnBatches,
  findShortages,
  roundQty,
} from './production-backflush';
import type {
  ProductionAllocation,
  ProductionPreview,
  SuggestedBatch,
  WorkOrderWithDetail,
} from '@runq/types';
import type { ProductionPreviewInput, RecordProductionInput } from '@runq/validators';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = any;

const MAX_WO_NUMBER_ATTEMPTS = 5;

interface ResolvedBom {
  id: string;
  bomCode: string;
  name: string;
  version: number;
  outputItemId: string;
  outputItemName: string;
  outputQty: number;
  outputUom: string;
  outputTracksBatches: boolean;
}

interface BomInputLine {
  bomLineId: string;
  inputItemId: string;
  inputItemName: string;
  qtyPerOutput: number;
  inputUom: string;
  scrapPct: number;
  isOptional: boolean;
  tracksBatches: boolean;
}

export interface RecordProductionResult {
  data: WorkOrderWithDetail;
  warnings: string[];
}

export class ProductionEntryService {
  private readonly woService: WorkOrderService;
  private readonly consumption: WoConsumptionService;
  private readonly output: WoOutputService;
  private readonly lifecycle: WoLifecycleService;
  private readonly batchSuggest: BatchSuggestService;

  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {
    this.woService = new WorkOrderService(db, tenantId);
    this.consumption = new WoConsumptionService(db, tenantId);
    this.output = new WoOutputService(db, tenantId);
    this.lifecycle = new WoLifecycleService(db, tenantId);
    this.batchSuggest = new BatchSuggestService(db, tenantId);
  }

  /** What the run would consume, without posting anything. */
  async preview(input: ProductionPreviewInput): Promise<ProductionPreview> {
    return this.buildPreview(this.db, input);
  }

  /**
   * Post the run. Everything — WO row, consumption, output, close — happens in
   * one transaction, so a failure part-way never leaves stock consumed without
   * finished goods to show for it.
   */
  async record(input: RecordProductionInput, userId?: string): Promise<RecordProductionResult> {
    if (input.idempotencyKey) {
      const existing = await this.findByIdempotencyKey(input.idempotencyKey);
      if (existing) return { data: existing, warnings: [] };
    }

    const warnings: string[] = [];
    let woId = '';

    // The WO number is allocated inside the transaction, so a same-day
    // collision aborts it — retry the whole run rather than a bare insert.
    for (let attempt = 0; attempt < MAX_WO_NUMBER_ATTEMPTS; attempt++) {
      try {
        woId = await this.db.transaction((tx: Tx) => this.postRun(tx, input, warnings, userId));
        break;
      } catch (err) {
        if (!this.isDuplicateKey(err)) throw err;
        // Two devices replaying the same queued entry: the loser of the race
        // reads back the winner's WO rather than posting the run twice.
        if (input.idempotencyKey) {
          const existing = await this.findByIdempotencyKey(input.idempotencyKey);
          if (existing) return { data: existing, warnings: [] };
        }
        if (attempt === MAX_WO_NUMBER_ATTEMPTS - 1) throw err;
        warnings.length = 0;
      }
    }

    return { data: await this.woService.getById(woId), warnings };
  }

  // ─── Posting ────────────────────────────────────────────────────────────

  private async postRun(
    tx: Tx,
    input: RecordProductionInput,
    warnings: string[],
    userId?: string,
  ): Promise<string> {
    // Recomputed inside the transaction so the allocation reflects stock as it
    // is at posting time, not as it was when the technician opened the screen.
    const preview = await this.buildPreview(tx, input);
    if (preview.shortages.length > 0) throw this.shortageError(preview.shortages);
    if (preview.outputTracksBatches && !input.expiryDate) {
      throw new UnprocessableError(
        `${preview.outputItemName} tracks batches — an expiry date is required`,
      );
    }

    const producedOn = input.producedOn ?? new Date().toISOString().slice(0, 10);
    const woId = await this.insertWo(tx, preview, input, producedOn, userId);

    await this.lifecycle.startInTx(tx, woId);
    await this.postConsumption(tx, woId, preview, userId);

    await this.output.recordInTx(
      tx,
      woId,
      {
        outputItemId: preview.outputItemId,
        batchNo: input.batchNo ?? null,
        warehouseId: preview.warehouseId,
        qty: preview.producedQty,
        uom: preview.outputUom,
        expiryDate: input.expiryDate ?? null,
        notes: input.notes ?? null,
        idempotencyKey: null,
      },
      userId,
    );

    await this.lifecycle.completeInTx(tx, woId);
    // Yield variance is zero by construction here — planned qty *is* what the
    // technician says was produced, so there is no plan to deviate from. Input
    // overrides move the unit cost instead, which costing picks up. Passed
    // unacknowledged anyway so any future variance surfaces as a warning;
    // close posts regardless, it never blocks on variance.
    await this.lifecycle.closeInTx(tx, woId, { varianceAcknowledged: false }, warnings, userId);

    return woId;
  }

  /** One consumption row per allocated batch — a split draw posts as two rows. */
  private async postConsumption(
    tx: Tx,
    woId: string,
    preview: ProductionPreview,
    userId?: string,
  ): Promise<void> {
    for (const alloc of preview.allocations) {
      for (const batch of alloc.batches) {
        await this.consumption.recordInTx(
          tx,
          woId,
          {
            bomLineId: alloc.bomLineId,
            inputItemId: alloc.inputItemId,
            batchNo: batch.batchNo,
            warehouseId: preview.warehouseId,
            qty: batch.qty,
            uom: alloc.uom,
            notes: null,
            idempotencyKey: null,
          },
          userId,
        );
      }
    }
  }

  private async insertWo(
    tx: Tx,
    preview: ProductionPreview,
    input: RecordProductionInput,
    producedOn: string,
    userId?: string,
  ): Promise<string> {
    const [row] = await tx
      .insert(workOrders)
      .values({
        tenantId: this.tenantId,
        woNumber: await this.nextWoNumber(tx, producedOn),
        bomId: preview.bomId,
        bomVersion: preview.bomVersion,
        plannedQty: String(preview.producedQty),
        warehouseId: preview.warehouseId,
        shift: input.shift ?? null,
        scheduledFor: producedOn,
        status: 'draft',
        entryMode: 'unplanned',
        idempotencyKey: input.idempotencyKey ?? null,
        createdBy: userId ?? null,
      })
      .returning();
    return row!.id as string;
  }

  // ─── Preview construction ───────────────────────────────────────────────

  private async buildPreview(
    exec: Tx,
    input: ProductionPreviewInput | RecordProductionInput,
  ): Promise<ProductionPreview> {
    const bom = await this.resolveBom(exec, input.bomId ?? null, input.outputItemId ?? null);
    const lines = await this.loadBomLines(exec, bom.id);
    const warehouseName = await this.loadWarehouseName(exec, input.warehouseId);

    if (bom.outputQty <= 0) {
      throw new ConflictError(`BOM ${bom.bomCode} has no output qty — cannot backflush`);
    }
    const runs = input.producedQty / bom.outputQty;

    const { allocations, availableByItem, tracksBatchesByItem } =
      await this.buildAllocations(exec, lines, runs, input.warehouseId);

    const finalAllocations = input.lines?.length
      ? applyOverrides(allocations, input.lines, availableByItem, tracksBatchesByItem)
      : allocations;

    const shortages = [
      ...findShortages(finalAllocations),
      ...findOverdrawnBatches(finalAllocations, availableByItem),
    ];

    return {
      bomId: bom.id,
      bomVersion: bom.version,
      bomCode: bom.bomCode,
      bomName: bom.name,
      outputItemId: bom.outputItemId,
      outputItemName: bom.outputItemName,
      outputUom: bom.outputUom,
      outputTracksBatches: bom.outputTracksBatches,
      runs: Math.round(runs * 10000) / 10000,
      producedQty: roundQty(input.producedQty),
      warehouseId: input.warehouseId,
      warehouseName,
      allocations: finalAllocations,
      shortages,
      estimatedInputValue: this.estimateInputValue(finalAllocations),
    };
  }

  /** FEFO-allocate every BOM input, keeping the raw availability for override checks. */
  private async buildAllocations(
    exec: Tx,
    lines: readonly BomInputLine[],
    runs: number,
    warehouseId: string,
  ): Promise<{
    allocations: ProductionAllocation[];
    availableByItem: Map<string, SuggestedBatch[]>;
    tracksBatchesByItem: Map<string, boolean>;
  }> {
    const availableByItem = new Map<string, SuggestedBatch[]>();
    const tracksBatchesByItem = new Map<string, boolean>();
    const allocations: ProductionAllocation[] = [];

    for (const line of lines) {
      const available = await this.batchSuggest.suggestInTx(exec, line.inputItemId, warehouseId);
      availableByItem.set(line.inputItemId, available);
      tracksBatchesByItem.set(line.inputItemId, line.tracksBatches);

      const requiredQty = computeRequiredQty(line.qtyPerOutput, runs, line.scrapPct);
      const { batches } = allocateFefo(requiredQty, available, line.tracksBatches);

      allocations.push({
        bomLineId: line.bomLineId,
        inputItemId: line.inputItemId,
        inputItemName: line.inputItemName,
        uom: line.inputUom,
        requiredQty,
        availableQty: roundQty(available.reduce((sum, b) => sum + b.availableQty, 0)),
        isOptional: line.isOptional,
        batches,
      });
    }

    return { allocations, availableByItem, tracksBatchesByItem };
  }

  private estimateInputValue(allocations: readonly ProductionAllocation[]): number {
    const total = allocations.reduce(
      (sum, alloc) =>
        sum + alloc.batches.reduce((s, b) => s + b.qty * b.unitCost, 0),
      0,
    );
    return Math.round(total * 100) / 100;
  }

  // ─── Loads ──────────────────────────────────────────────────────────────

  private async resolveBom(
    exec: Tx,
    bomId: string | null,
    outputItemId: string | null,
  ): Promise<ResolvedBom> {
    const match = bomId
      ? eq(boms.id, bomId)
      : eq(boms.outputItemId, outputItemId!);

    const [row] = await exec
      .select({ bom: boms, itemName: items.name, trackBatches: items.trackBatches })
      .from(boms)
      .innerJoin(items, eq(items.id, boms.outputItemId))
      .where(and(eq(boms.tenantId, this.tenantId), eq(boms.isActive, true), match))
      .limit(1);

    if (!row) {
      throw new NotFoundError(
        bomId ? 'Active BOM' : 'Active BOM for this product',
      );
    }

    return {
      id: row.bom.id,
      bomCode: row.bom.bomCode,
      name: row.bom.name,
      version: row.bom.version,
      outputItemId: row.bom.outputItemId,
      outputItemName: row.itemName,
      outputQty: Number(row.bom.outputQty),
      outputUom: row.bom.outputUom,
      outputTracksBatches: row.trackBatches ?? false,
    };
  }

  private async loadBomLines(exec: Tx, bomId: string): Promise<BomInputLine[]> {
    const rows = await exec
      .select({ line: bomLines, itemName: items.name, trackBatches: items.trackBatches })
      .from(bomLines)
      .innerJoin(items, eq(items.id, bomLines.inputItemId))
      .where(and(eq(bomLines.bomId, bomId), eq(bomLines.tenantId, this.tenantId)))
      .orderBy(bomLines.lineNo);

    if (rows.length === 0) {
      throw new ConflictError('BOM has no input lines — nothing to backflush');
    }

    return rows.map((r: { line: typeof bomLines.$inferSelect; itemName: string; trackBatches: boolean | null }) => ({
      bomLineId: r.line.id,
      inputItemId: r.line.inputItemId,
      inputItemName: r.itemName,
      qtyPerOutput: Number(r.line.qtyPerOutput),
      inputUom: r.line.inputUom,
      scrapPct: Number(r.line.scrapPct),
      isOptional: r.line.isOptional,
      tracksBatches: r.trackBatches ?? false,
    }));
  }

  private async loadWarehouseName(exec: Tx, warehouseId: string): Promise<string> {
    const [row] = await exec
      .select({ name: warehouses.name })
      .from(warehouses)
      .where(and(eq(warehouses.id, warehouseId), eq(warehouses.tenantId, this.tenantId)))
      .limit(1);
    if (!row) throw new NotFoundError('Warehouse');
    return row.name as string;
  }

  private async findByIdempotencyKey(key: string): Promise<WorkOrderWithDetail | null> {
    const [row] = await this.db
      .select({ id: workOrders.id })
      .from(workOrders)
      .where(and(eq(workOrders.tenantId, this.tenantId), eq(workOrders.idempotencyKey, key)))
      .limit(1);
    return row ? this.woService.getById(row.id) : null;
  }

  /** Mirrors WorkOrderService.nextWoNumber, but transaction-scoped. */
  private async nextWoNumber(exec: Tx, producedOn: string): Promise<string> {
    const prefix = `WO-${producedOn.replace(/-/g, '')}-`;
    const [row] = await exec
      .select({
        maxN: sql<number | null>`MAX(
          CASE
            WHEN ${workOrders.woNumber} ~ ('^' || ${prefix} || '[0-9]+$')
            THEN substring(${workOrders.woNumber} from char_length(${prefix}) + 1)::int
            ELSE NULL
          END
        )`,
      })
      .from(workOrders)
      .where(
        and(
          eq(workOrders.tenantId, this.tenantId),
          sql`${workOrders.woNumber} ILIKE ${prefix + '%'}`,
        ),
      );
    return `${prefix}${String((row?.maxN ?? 0) + 1).padStart(4, '0')}`;
  }

  // ─── Errors ─────────────────────────────────────────────────────────────

  private shortageError(shortages: ProductionPreview['shortages']): UnprocessableError {
    const summary = shortages
      .map((s) => `${s.inputItemName} (short ${s.shortQty} ${s.uom})`)
      .join(', ');
    return new UnprocessableError(`Not enough stock to record this run — ${summary}`, {
      shortages,
    });
  }

  private isDuplicateKey(err: unknown): boolean {
    const code =
      (err as { code?: string })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
    return code === '23505';
  }
}
