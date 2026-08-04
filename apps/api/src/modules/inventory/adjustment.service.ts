import { and, asc, desc, eq, gte, lte, count, inArray, sql } from 'drizzle-orm';
import type { Db } from '@runq/db';
import {
  inventoryAdjustments, inventoryAdjustmentLines, items, warehouses,
} from '@runq/db';
import type {
  CreateAdjustmentInput, UpdateAdjustmentInput, CancelAdjustmentInput,
  AdjustmentFilter,
} from '@runq/validators';
import { AppError, ConflictError, NotFoundError } from '../../utils/errors';
import { StockLedgerService } from './stock-ledger.service';
import { InventoryGlPoster } from './gl-poster';
import { nextDocNo } from './sequence';

interface Ctx { db: Db; tenantId: string; userId?: string }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = any;

export class AdjustmentService {
  constructor(private readonly ctx: Ctx) {}

  async list(filter: AdjustmentFilter) {
    const conds = [eq(inventoryAdjustments.tenantId, this.ctx.tenantId)];
    if (filter.status) conds.push(eq(inventoryAdjustments.status, filter.status));
    if (filter.warehouseId) conds.push(eq(inventoryAdjustments.warehouseId, filter.warehouseId));
    if (filter.reason) conds.push(eq(inventoryAdjustments.reason, filter.reason));
    if (filter.from) conds.push(gte(inventoryAdjustments.adjustmentDate, filter.from));
    if (filter.to) conds.push(lte(inventoryAdjustments.adjustmentDate, filter.to));

    const offset = (filter.page - 1) * filter.limit;
    const where = and(...conds)!;
    const [rows, [{ total }]] = await Promise.all([
      this.ctx.db
        .select({ a: inventoryAdjustments, warehouseName: warehouses.name })
        .from(inventoryAdjustments)
        .innerJoin(warehouses, eq(warehouses.id, inventoryAdjustments.warehouseId))
        .where(where)
        .orderBy(desc(inventoryAdjustments.createdAt))
        .limit(filter.limit)
        .offset(offset),
      this.ctx.db.select({ total: count() }).from(inventoryAdjustments).where(where),
    ]);

    const summaries = await this.lineSummaries(rows.map((r) => r.a.id));

    return {
      data: rows.map((r) => ({
        ...r.a,
        warehouseName: r.warehouseName,
        ...(summaries.get(r.a.id) ?? { lineCount: 0, itemNames: [] }),
      })),
      page: filter.page,
      limit: filter.limit,
      total,
      totalPages: Math.ceil(total / filter.limit),
    };
  }

  /**
   * Line count + the first few item names per adjustment, so the list can show
   * what was actually adjusted without a fetch per row. Names are capped at
   * three — the UI shows a couple and a "+N more", and shipping the full set
   * for a 200-line stock correction would dwarf the rest of the payload.
   */
  private async lineSummaries(
    adjustmentIds: string[],
  ): Promise<Map<string, { lineCount: number; itemNames: string[] }>> {
    const out = new Map<string, { lineCount: number; itemNames: string[] }>();
    if (adjustmentIds.length === 0) return out;

    const rows = await this.ctx.db
      .select({
        adjustmentId: inventoryAdjustmentLines.adjustmentId,
        lineCount: count(),
        itemNames: sql<string[]>`(ARRAY_AGG(${items.name} ORDER BY ${items.name}))[1:3]`,
      })
      .from(inventoryAdjustmentLines)
      .innerJoin(items, eq(items.id, inventoryAdjustmentLines.itemId))
      .where(inArray(inventoryAdjustmentLines.adjustmentId, adjustmentIds))
      .groupBy(inventoryAdjustmentLines.adjustmentId);

    for (const r of rows) {
      out.set(r.adjustmentId, {
        lineCount: Number(r.lineCount),
        itemNames: r.itemNames ?? [],
      });
    }
    return out;
  }

  async get(id: string) {
    const [row] = await this.ctx.db
      .select({ a: inventoryAdjustments, warehouseName: warehouses.name })
      .from(inventoryAdjustments)
      .innerJoin(warehouses, eq(warehouses.id, inventoryAdjustments.warehouseId))
      .where(and(eq(inventoryAdjustments.id, id), eq(inventoryAdjustments.tenantId, this.ctx.tenantId)))
      .limit(1);
    if (!row) throw new NotFoundError('Adjustment');

    const lines = await this.ctx.db
      .select({
        l: inventoryAdjustmentLines,
        itemName: items.name, itemSku: items.sku, trackBatches: items.trackBatches,
      })
      .from(inventoryAdjustmentLines)
      .innerJoin(items, eq(items.id, inventoryAdjustmentLines.itemId))
      .where(eq(inventoryAdjustmentLines.adjustmentId, id))
      .orderBy(asc(inventoryAdjustmentLines.id));

    return {
      ...row.a,
      warehouseName: row.warehouseName,
      lines: lines.map((l) => ({ ...l.l, itemName: l.itemName, itemSku: l.itemSku, trackBatches: l.trackBatches })),
    };
  }

  async create(input: CreateAdjustmentInput) {
    return this.ctx.db.transaction(async (tx: Tx) => {
      const adjNo = await nextDocNo(tx, this.ctx.tenantId, 'ADJ');
      const initialStatus = input.requiresApproval ? 'pending_approval' : 'draft';
      const [a] = await tx
        .insert(inventoryAdjustments)
        .values({
          tenantId: this.ctx.tenantId,
          adjNo,
          warehouseId: input.warehouseId,
          reason: input.reason,
          adjustmentDate: input.adjustmentDate,
          notes: input.notes ?? null,
          requiresApproval: input.requiresApproval ?? false,
          itcReversalValue: String(input.itcReversalValue ?? 0),
          status: initialStatus,
          createdBy: this.ctx.userId ?? null,
        })
        .returning();

      await tx.insert(inventoryAdjustmentLines).values(
        input.lines.map((l) => ({
          tenantId: this.ctx.tenantId,
          adjustmentId: a!.id,
          itemId: l.itemId,
          batchNo: l.batchNo ?? null,
          qtyDelta: String(l.qtyDelta),
          unitCost: String(l.unitCost ?? 0),
          notes: l.notes ?? null,
        })),
      );
      return a!;
    });
  }

  async update(id: string, input: UpdateAdjustmentInput) {
    return this.ctx.db.transaction(async (tx: Tx) => {
      const [existing] = await tx
        .select()
        .from(inventoryAdjustments)
        .where(and(eq(inventoryAdjustments.id, id), eq(inventoryAdjustments.tenantId, this.ctx.tenantId)))
        .limit(1);
      if (!existing) throw new NotFoundError('Adjustment');
      if (existing.status !== 'draft' && existing.status !== 'pending_approval') {
        throw new ConflictError('Only draft / pending-approval adjustments can be edited');
      }
      const [a] = await tx
        .update(inventoryAdjustments)
        .set({
          warehouseId: input.warehouseId ?? existing.warehouseId,
          reason: input.reason ?? existing.reason,
          adjustmentDate: input.adjustmentDate ?? existing.adjustmentDate,
          notes: input.notes === undefined ? existing.notes : (input.notes ?? null),
          itcReversalValue: input.itcReversalValue === undefined
            ? existing.itcReversalValue
            : String(input.itcReversalValue),
          updatedAt: new Date(),
        })
        .where(eq(inventoryAdjustments.id, id))
        .returning();

      if (input.lines) {
        await tx.delete(inventoryAdjustmentLines).where(eq(inventoryAdjustmentLines.adjustmentId, id));
        await tx.insert(inventoryAdjustmentLines).values(
          input.lines.map((l) => ({
            tenantId: this.ctx.tenantId,
            adjustmentId: id,
            itemId: l.itemId,
            batchNo: l.batchNo ?? null,
            qtyDelta: String(l.qtyDelta),
            unitCost: String(l.unitCost ?? 0),
            notes: l.notes ?? null,
          })),
        );
      }
      return a!;
    });
  }

  /** Approve a pending_approval adjustment — flips status back to draft so post() can run. */
  async approve(id: string) {
    const [row] = await this.ctx.db
      .select({ status: inventoryAdjustments.status, requiresApproval: inventoryAdjustments.requiresApproval })
      .from(inventoryAdjustments)
      .where(and(eq(inventoryAdjustments.id, id), eq(inventoryAdjustments.tenantId, this.ctx.tenantId)))
      .limit(1);
    if (!row) throw new NotFoundError('Adjustment');
    if (row.status !== 'pending_approval') {
      throw new ConflictError(`Cannot approve — status is ${row.status}`);
    }
    const [u] = await this.ctx.db
      .update(inventoryAdjustments)
      .set({
        status: 'draft',
        approvedBy: this.ctx.userId ?? null,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(inventoryAdjustments.id, id))
      .returning();
    return u!;
  }

  async post(id: string) {
    return this.ctx.db.transaction(async (tx: Tx) => {
      const [a] = await tx
        .select()
        .from(inventoryAdjustments)
        .where(and(eq(inventoryAdjustments.id, id), eq(inventoryAdjustments.tenantId, this.ctx.tenantId)))
        .limit(1);
      if (!a) throw new NotFoundError('Adjustment');
      if (a.status === 'pending_approval') throw new ConflictError('Approval required first');
      if (a.status !== 'draft') throw new ConflictError(`Adjustment is ${a.status}`);

      const lines = await tx
        .select()
        .from(inventoryAdjustmentLines)
        .where(eq(inventoryAdjustmentLines.adjustmentId, id));
      if (lines.length === 0) throw new AppError(400, 'No lines to post');

      const ledger = new StockLedgerService(this.ctx.tenantId);
      const movedAt = new Date(a.adjustmentDate);
      let totalValueDelta = 0;
      for (const line of lines) {
        const qtyDelta = Number(line.qtyDelta);
        const overrideCost = Number(line.unitCost);
        const result = await ledger.recordMovement(tx, {
          itemId: line.itemId,
          warehouseId: a.warehouseId,
          batchNo: line.batchNo ?? null,
          movementType: qtyDelta > 0 ? 'adjustment_in' : 'adjustment_out',
          sourceType: 'inventory_adjustment',
          sourceId: a.id,
          sourceLineId: line.id,
          qtyDelta,
          unitCost: overrideCost > 0 ? overrideCost : undefined,
          movedAt,
          postedBy: this.ctx.userId ?? null,
        });
        const lineValueDelta = qtyDelta * result.unitCostUsed;
        totalValueDelta += lineValueDelta;
        await tx
          .update(inventoryAdjustmentLines)
          .set({
            unitCost: String(result.unitCostUsed),
            valueDelta: String(lineValueDelta),
          })
          .where(eq(inventoryAdjustmentLines.id, line.id));
      }

      const poster = new InventoryGlPoster(tx, this.ctx.tenantId, this.ctx.userId);
      const jeId = await poster.postAdjustment({
        date: a.adjustmentDate,
        adjustmentId: a.id,
        adjNo: a.adjNo,
        reason: a.reason,
        valueDelta: totalValueDelta,
      });

      const [updated] = await tx
        .update(inventoryAdjustments)
        .set({
          status: 'posted',
          totalValueDelta: String(totalValueDelta),
          journalEntryId: jeId,
          postedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(inventoryAdjustments.id, id))
        .returning();

      if (jeId) {
        await tx.execute(sql`
          UPDATE stock_ledger SET journal_entry_id = ${jeId}
          WHERE tenant_id = ${this.ctx.tenantId}
            AND source_type = 'inventory_adjustment' AND source_id = ${a.id}
        `);
      }
      return updated!;
    });
  }

  async cancel(id: string, input: CancelAdjustmentInput) {
    // Posted adjustments aren't auto-reversed in v1 — the user must create
    // a counter-adjustment. Cancel only flips draft / pending_approval.
    const [row] = await this.ctx.db
      .select({ status: inventoryAdjustments.status, notes: inventoryAdjustments.notes })
      .from(inventoryAdjustments)
      .where(and(eq(inventoryAdjustments.id, id), eq(inventoryAdjustments.tenantId, this.ctx.tenantId)))
      .limit(1);
    if (!row) throw new NotFoundError('Adjustment');
    if (row.status === 'cancelled') throw new ConflictError('Already cancelled');
    if (row.status === 'posted') {
      throw new ConflictError('Posted adjustments cannot be cancelled — create a counter-adjustment instead');
    }
    const [u] = await this.ctx.db
      .update(inventoryAdjustments)
      .set({
        status: 'cancelled',
        cancelledAt: new Date(),
        notes: row.notes ? `${row.notes}\n[Cancelled] ${input.reason}` : `[Cancelled] ${input.reason}`,
        updatedAt: new Date(),
      })
      .where(eq(inventoryAdjustments.id, id))
      .returning();
    return u!;
  }
}
