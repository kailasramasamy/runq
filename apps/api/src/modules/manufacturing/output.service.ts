/**
 * Manufacturing Phase 2 — WO Output service.
 *
 * Handles recording and reversing output batches from a work order.
 * Stock ledger entries are created only at WO close (not here), so
 * reverse is a simple row deletion with no ledger entry.
 *
 * Plan: docs/manufacturing-plan.md §4.5, §5.3, §8.
 */

import { and, eq, sql } from 'drizzle-orm';
import { workOrders, woOutput, boms, items, warehouses } from '@runq/db';
import type { Db } from '@runq/db';
import { NotFoundError, ConflictError, AppError } from '../../utils/errors';
import type { WoOutput } from '@runq/types';
import type { RecordOutputInput } from '@runq/validators';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = any;

const RECORDABLE_STATUSES = ['in_progress', 'completed'] as const;

export class WoOutputService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async list(woId: string): Promise<WoOutput[]> {
    const rows = await this.db
      .select({
        o: woOutput,
        itemName: items.name,
        warehouseName: warehouses.name,
      })
      .from(woOutput)
      .innerJoin(items, eq(items.id, woOutput.outputItemId))
      .innerJoin(warehouses, eq(warehouses.id, woOutput.warehouseId))
      .where(and(eq(woOutput.woId, woId), eq(woOutput.tenantId, this.tenantId)))
      .orderBy(woOutput.producedAt);

    return rows.map((r) => this.toOutput(r.o, r.itemName, r.warehouseName));
  }

  async record(woId: string, input: RecordOutputInput, userId?: string): Promise<WoOutput> {
    // Idempotency: client-supplied key → return existing row instead of duplicate
    // (mobile offline-queue replay safety net, Phase 2.5).
    if (input.idempotencyKey) {
      const existing = await this.findByIdempotencyKey(input.idempotencyKey);
      if (existing) return existing;
    }

    return this.db.transaction((tx: Tx) => this.recordInTx(tx, woId, input, userId));
  }

  /**
   * Same as `record`, but joins a caller's transaction instead of opening its
   * own — see WoConsumptionService.recordInTx for why.
   */
  async recordInTx(
    tx: Tx,
    woId: string,
    input: RecordOutputInput,
    userId?: string,
  ): Promise<WoOutput> {
    const wo = await this.loadWo(tx, woId);
    if (!RECORDABLE_STATUSES.includes(wo.status as typeof RECORDABLE_STATUSES[number])) {
      throw new ConflictError(`Cannot record output for WO in status: ${wo.status}`);
    }

    const item = await this.loadItem(tx, input.outputItemId);
    if (item.trackBatches && !input.expiryDate) {
      throw new AppError(422, 'Expiry required for batch-tracked item');
    }

    const batchNo =
      input.batchNo ?? (await this.generateBatchNo(tx, wo.bomId, input.outputItemId));
    const qty = input.qty;

    const [row] = await tx
      .insert(woOutput)
      .values({
        tenantId: this.tenantId,
        woId,
        outputItemId: input.outputItemId,
        batchNo,
        warehouseId: input.warehouseId,
        qty: String(qty),
        uom: input.uom,
        unitCost: '0',
        value: '0',
        expiryDate: input.expiryDate ?? null,
        producedBy: userId ?? null,
        notes: input.notes ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
      })
      .returning();

    await tx
      .update(workOrders)
      .set({
        outputQty: sql`${workOrders.outputQty} + ${String(qty)}`,
        updatedAt: new Date(),
      })
      .where(and(eq(workOrders.id, woId), eq(workOrders.tenantId, this.tenantId)));

    return this.fetchRow(tx, row!.id);
  }

  async reverse(outputId: string, _userId?: string): Promise<void> {
    await this.db.transaction(async (tx: Tx) => {
      const [row] = await tx
        .select()
        .from(woOutput)
        .where(and(eq(woOutput.id, outputId), eq(woOutput.tenantId, this.tenantId)))
        .limit(1);
      if (!row) throw new NotFoundError('Output');

      const wo = await this.loadWo(tx, row.woId);
      if (wo.status !== 'in_progress') {
        throw new ConflictError('Can only reverse output when WO is in_progress');
      }

      const qty = Number(row.qty);
      await tx.delete(woOutput).where(eq(woOutput.id, outputId));

      await tx
        .update(workOrders)
        .set({
          outputQty: sql`${workOrders.outputQty} - ${String(qty)}`,
          updatedAt: new Date(),
        })
        .where(and(eq(workOrders.id, row.woId), eq(workOrders.tenantId, this.tenantId)));
    });
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  private async findByIdempotencyKey(key: string): Promise<WoOutput | null> {
    const [row] = await this.db
      .select({
        o: woOutput,
        itemName: items.name,
        warehouseName: warehouses.name,
      })
      .from(woOutput)
      .innerJoin(items, eq(items.id, woOutput.outputItemId))
      .innerJoin(warehouses, eq(warehouses.id, woOutput.warehouseId))
      .where(
        and(
          eq(woOutput.tenantId, this.tenantId),
          eq(woOutput.idempotencyKey, key),
        ),
      )
      .limit(1);
    return row ? this.toOutput(row.o, row.itemName, row.warehouseName) : null;
  }

  private async loadWo(tx: Tx, woId: string) {
    const [wo] = await tx
      .select({ id: workOrders.id, status: workOrders.status, bomId: workOrders.bomId })
      .from(workOrders)
      .where(and(eq(workOrders.id, woId), eq(workOrders.tenantId, this.tenantId)))
      .limit(1);
    if (!wo) throw new NotFoundError('WorkOrder');
    return wo;
  }

  private async loadItem(tx: Tx, itemId: string) {
    const [item] = await tx
      .select({ id: items.id, trackBatches: items.trackBatches })
      .from(items)
      .where(and(eq(items.id, itemId), eq(items.tenantId, this.tenantId)))
      .limit(1);
    if (!item) throw new NotFoundError('Item');
    return item;
  }

  /**
   * `<bom_code>-<YYYYMMDD>-<seq>`.
   *
   * The sequence is scoped to tenant + output item + day, matching the
   * uq_wo_output_batch unique index. Scoping it to the work order instead
   * (as it was originally) made every same-day run of a product restart at
   * 001 and collide — an AM and a PM batch of the same product on one day is
   * routine on a dairy floor, and unplanned entries add more same-day runs.
   */
  private async generateBatchNo(tx: Tx, bomId: string, outputItemId: string): Promise<string> {
    const [bom] = await tx
      .select({ bomCode: boms.bomCode })
      .from(boms)
      .where(and(eq(boms.id, bomId), eq(boms.tenantId, this.tenantId)))
      .limit(1);
    const bomCode = bom?.bomCode ?? 'WO';
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `${bomCode}-${today}-`;

    const [row] = await tx
      .select({
        maxN: sql<number | null>`MAX(
          CASE
            WHEN ${woOutput.batchNo} ~ ('^' || ${prefix} || '[0-9]+$')
            THEN substring(${woOutput.batchNo} from char_length(${prefix}) + 1)::int
            ELSE NULL
          END
        )`,
      })
      .from(woOutput)
      .where(
        and(
          eq(woOutput.tenantId, this.tenantId),
          eq(woOutput.outputItemId, outputItemId),
          sql`${woOutput.batchNo} LIKE ${prefix + '%'}`,
        ),
      );

    return `${prefix}${String(((row?.maxN ?? 0) as number) + 1).padStart(3, '0')}`;
  }

  private async fetchRow(tx: Tx, id: string): Promise<WoOutput> {
    const [row] = await tx
      .select({ o: woOutput, itemName: items.name, warehouseName: warehouses.name })
      .from(woOutput)
      .innerJoin(items, eq(items.id, woOutput.outputItemId))
      .innerJoin(warehouses, eq(warehouses.id, woOutput.warehouseId))
      .where(eq(woOutput.id, id))
      .limit(1);
    if (!row) throw new NotFoundError('Output');
    return this.toOutput(row.o, row.itemName, row.warehouseName);
  }

  private toOutput(
    o: typeof woOutput.$inferSelect,
    outputItemName: string,
    warehouseName: string,
  ): WoOutput {
    return {
      id: o.id,
      tenantId: o.tenantId,
      woId: o.woId,
      outputItemId: o.outputItemId,
      outputItemName,
      batchNo: o.batchNo,
      warehouseId: o.warehouseId,
      warehouseName,
      qty: Number(o.qty),
      uom: o.uom,
      unitCost: Number(o.unitCost),
      value: Number(o.value),
      expiryDate: o.expiryDate ?? null,
      producedAt: o.producedAt.toISOString(),
      producedBy: o.producedBy ?? null,
      stockTxnId: o.stockTxnId ?? null,
      notes: o.notes ?? null,
    };
  }
}
