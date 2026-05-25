import { and, desc, eq, gte, lte, count, sql } from 'drizzle-orm';
import type { Db } from '@runq/db';
import {
  inventoryTransfers, inventoryTransferLines, items, warehouses,
} from '@runq/db';
import type {
  CreateTransferInput, UpdateTransferInput, TransferFilter,
  CancelTransferInput, ReceiveTransferInput,
} from '@runq/validators';
import { AppError, ConflictError, NotFoundError } from '../../utils/errors';
import { StockLedgerService } from './stock-ledger.service';
import { nextDocNo } from './sequence';

interface Ctx { db: Db; tenantId: string; userId?: string }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = any;

export class TransferService {
  constructor(private readonly ctx: Ctx) {}

  async list(filter: TransferFilter) {
    const conds = [eq(inventoryTransfers.tenantId, this.ctx.tenantId)];
    if (filter.status) conds.push(eq(inventoryTransfers.status, filter.status));
    if (filter.fromWarehouseId) conds.push(eq(inventoryTransfers.fromWarehouseId, filter.fromWarehouseId));
    if (filter.toWarehouseId) conds.push(eq(inventoryTransfers.toWarehouseId, filter.toWarehouseId));
    if (filter.from) conds.push(gte(inventoryTransfers.createdAt, new Date(filter.from)));
    if (filter.to) conds.push(lte(inventoryTransfers.createdAt, new Date(filter.to)));

    const offset = (filter.page - 1) * filter.limit;
    const where = and(...conds)!;
    const fromWh = warehouses;
    // Alias is awkward in drizzle without `alias()`; use two joins via separate selects.
    const [rows, [{ total }]] = await Promise.all([
      this.ctx.db
        .select({
          t: inventoryTransfers,
          fromName: fromWh.name,
          // Per-row line count for the redesigned mobile transfer card.
          lineCount: sql<number>`(
            SELECT COUNT(*)::int FROM ${inventoryTransferLines}
            WHERE ${inventoryTransferLines.transferId} = ${inventoryTransfers.id}
          )`.as('line_count'),
        })
        .from(inventoryTransfers)
        .innerJoin(fromWh, eq(fromWh.id, inventoryTransfers.fromWarehouseId))
        .where(where)
        .orderBy(desc(inventoryTransfers.createdAt))
        .limit(filter.limit)
        .offset(offset),
      this.ctx.db.select({ total: count() }).from(inventoryTransfers).where(where),
    ]);

    // Second pass: resolve to_warehouse names cheaply.
    const toIds = [...new Set(rows.map((r) => r.t.toWarehouseId))];
    const toMap = new Map<string, string>();
    if (toIds.length) {
      const tos = await this.ctx.db
        .select({ id: warehouses.id, name: warehouses.name })
        .from(warehouses)
        .where(eq(warehouses.tenantId, this.ctx.tenantId));
      for (const w of tos) toMap.set(w.id, w.name);
    }

    return {
      data: rows.map((r) => ({
        ...r.t,
        fromWarehouseName: r.fromName,
        toWarehouseName: toMap.get(r.t.toWarehouseId) ?? '',
        lineCount: Number(r.lineCount ?? 0),
      })),
      page: filter.page,
      limit: filter.limit,
      total,
      totalPages: Math.ceil(total / filter.limit),
    };
  }

  async get(id: string) {
    const [row] = await this.ctx.db
      .select()
      .from(inventoryTransfers)
      .where(and(eq(inventoryTransfers.id, id), eq(inventoryTransfers.tenantId, this.ctx.tenantId)))
      .limit(1);
    if (!row) throw new NotFoundError('Transfer');

    const lines = await this.ctx.db
      .select({
        l: inventoryTransferLines,
        itemName: items.name, itemSku: items.sku, trackBatches: items.trackBatches,
      })
      .from(inventoryTransferLines)
      .innerJoin(items, eq(items.id, inventoryTransferLines.itemId))
      .where(eq(inventoryTransferLines.transferId, id));

    const [fromWh] = await this.ctx.db.select().from(warehouses).where(eq(warehouses.id, row.fromWarehouseId)).limit(1);
    const [toWh] = await this.ctx.db.select().from(warehouses).where(eq(warehouses.id, row.toWarehouseId)).limit(1);

    return {
      ...row,
      fromWarehouseName: fromWh?.name ?? '',
      toWarehouseName: toWh?.name ?? '',
      lines: lines.map((l) => ({ ...l.l, itemName: l.itemName, itemSku: l.itemSku, trackBatches: l.trackBatches })),
    };
  }

  async create(input: CreateTransferInput) {
    return this.ctx.db.transaction(async (tx: Tx) => {
      const transferNo = await nextDocNo(tx, this.ctx.tenantId, 'TRF');
      const [t] = await tx
        .insert(inventoryTransfers)
        .values({
          tenantId: this.ctx.tenantId,
          transferNo,
          fromWarehouseId: input.fromWarehouseId,
          toWarehouseId: input.toWarehouseId,
          vehicleNo: input.vehicleNo ?? null,
          notes: input.notes ?? null,
          createdBy: this.ctx.userId ?? null,
        })
        .returning();

      await tx.insert(inventoryTransferLines).values(
        input.lines.map((l) => ({
          tenantId: this.ctx.tenantId,
          transferId: t!.id,
          itemId: l.itemId,
          batchNo: l.batchNo ?? null,
          qty: String(l.qty),
        })),
      );
      return t!;
    });
  }

  async update(id: string, input: UpdateTransferInput) {
    return this.ctx.db.transaction(async (tx: Tx) => {
      const [existing] = await tx
        .select()
        .from(inventoryTransfers)
        .where(and(eq(inventoryTransfers.id, id), eq(inventoryTransfers.tenantId, this.ctx.tenantId)))
        .limit(1);
      if (!existing) throw new NotFoundError('Transfer');
      if (existing.status !== 'draft') {
        throw new ConflictError('Only draft transfers can be edited');
      }

      const [t] = await tx
        .update(inventoryTransfers)
        .set({
          fromWarehouseId: input.fromWarehouseId ?? existing.fromWarehouseId,
          toWarehouseId: input.toWarehouseId ?? existing.toWarehouseId,
          vehicleNo: input.vehicleNo === undefined ? existing.vehicleNo : (input.vehicleNo ?? null),
          notes: input.notes === undefined ? existing.notes : (input.notes ?? null),
          updatedAt: new Date(),
        })
        .where(eq(inventoryTransfers.id, id))
        .returning();

      if (input.lines) {
        await tx.delete(inventoryTransferLines).where(eq(inventoryTransferLines.transferId, id));
        await tx.insert(inventoryTransferLines).values(
          input.lines.map((l) => ({
            tenantId: this.ctx.tenantId,
            transferId: id,
            itemId: l.itemId,
            batchNo: l.batchNo ?? null,
            qty: String(l.qty),
          })),
        );
      }
      return t!;
    });
  }

  /** Dispatch — pulls stock out of source warehouse, marks in_transit. */
  async dispatch(id: string) {
    return this.ctx.db.transaction(async (tx: Tx) => {
      const [t] = await tx
        .select()
        .from(inventoryTransfers)
        .where(and(eq(inventoryTransfers.id, id), eq(inventoryTransfers.tenantId, this.ctx.tenantId)))
        .limit(1);
      if (!t) throw new NotFoundError('Transfer');
      if (t.status !== 'draft') throw new ConflictError(`Transfer is ${t.status}`);

      const lines = await tx
        .select()
        .from(inventoryTransferLines)
        .where(eq(inventoryTransferLines.transferId, id));
      if (lines.length === 0) throw new AppError(400, 'Transfer has no lines');

      const ledger = new StockLedgerService(this.ctx.tenantId);
      const now = new Date();
      let total = 0;
      for (const line of lines) {
        const qty = Number(line.qty);
        const result = await ledger.recordMovement(tx, {
          itemId: line.itemId,
          warehouseId: t.fromWarehouseId,
          batchNo: line.batchNo ?? null,
          movementType: 'transfer_out',
          sourceType: 'inventory_transfer',
          sourceId: t.id,
          sourceLineId: line.id,
          qtyDelta: -qty,
          movedAt: now,
          postedBy: this.ctx.userId ?? null,
        });
        const lineTotal = qty * result.unitCostUsed;
        total += lineTotal;
        await tx
          .update(inventoryTransferLines)
          .set({ unitCost: String(result.unitCostUsed), lineTotal: String(lineTotal) })
          .where(eq(inventoryTransferLines.id, line.id));
      }

      const [updated] = await tx
        .update(inventoryTransfers)
        .set({
          status: 'in_transit',
          dispatchedAt: now,
          totalValue: String(total),
          updatedAt: now,
        })
        .where(eq(inventoryTransfers.id, id))
        .returning();
      return updated!;
    });
  }

  /**
   * Receive — adds qty (per line, defaulting to dispatched qty) at the
   * destination warehouse. We don't allow over-receipt — the destination
   * cannot magically have more than what left the source.
   */
  async receive(id: string, input: ReceiveTransferInput) {
    return this.ctx.db.transaction(async (tx: Tx) => {
      const [t] = await tx
        .select()
        .from(inventoryTransfers)
        .where(and(eq(inventoryTransfers.id, id), eq(inventoryTransfers.tenantId, this.ctx.tenantId)))
        .limit(1);
      if (!t) throw new NotFoundError('Transfer');
      if (t.status !== 'in_transit') {
        throw new ConflictError(`Transfer is ${t.status} — must be in_transit to receive`);
      }

      const lines = await tx
        .select()
        .from(inventoryTransferLines)
        .where(eq(inventoryTransferLines.transferId, id));

      const receiptMap = new Map<string, number>(
        (input.lineReceipts ?? []).map((r) => [r.lineId, r.qtyReceived] as const),
      );
      const ledger = new StockLedgerService(this.ctx.tenantId);
      const now = new Date();

      for (const line of lines) {
        const dispatched = Number(line.qty);
        const receive = receiptMap.has(line.id) ? receiptMap.get(line.id)! : dispatched;
        if (receive < 0) throw new AppError(400, 'Negative receive qty');
        if (receive > dispatched) {
          throw new AppError(400, `Line ${line.id}: receive (${receive}) > dispatched (${dispatched})`);
        }
        if (receive === 0) continue;

        await ledger.recordMovement(tx, {
          itemId: line.itemId,
          warehouseId: t.toWarehouseId,
          batchNo: line.batchNo ?? null,
          movementType: 'transfer_in',
          sourceType: 'inventory_transfer',
          sourceId: t.id,
          sourceLineId: line.id,
          qtyDelta: receive,
          unitCost: Number(line.unitCost),
          movedAt: now,
          postedBy: this.ctx.userId ?? null,
        });
        await tx
          .update(inventoryTransferLines)
          .set({ qtyReceived: String(receive) })
          .where(eq(inventoryTransferLines.id, line.id));
      }

      const [updated] = await tx
        .update(inventoryTransfers)
        .set({ status: 'received', receivedAt: now, updatedAt: now })
        .where(eq(inventoryTransfers.id, id))
        .returning();
      return updated!;
    });
  }

  async cancel(id: string, input: CancelTransferInput) {
    return this.ctx.db.transaction(async (tx: Tx) => {
      const [t] = await tx
        .select()
        .from(inventoryTransfers)
        .where(and(eq(inventoryTransfers.id, id), eq(inventoryTransfers.tenantId, this.ctx.tenantId)))
        .limit(1);
      if (!t) throw new NotFoundError('Transfer');
      if (t.status === 'cancelled') throw new ConflictError('Already cancelled');
      if (t.status === 'received') {
        throw new ConflictError('Cannot cancel a fully received transfer');
      }

      // For draft, just flip status. For in_transit, write reversal at source
      // (return-to-shelf) — destination was never credited.
      if (t.status === 'in_transit') {
        const lines = await tx
          .select()
          .from(inventoryTransferLines)
          .where(eq(inventoryTransferLines.transferId, id));
        const ledger = new StockLedgerService(this.ctx.tenantId);
        const now = new Date();
        for (const line of lines) {
          const qty = Number(line.qty);
          await ledger.recordMovement(tx, {
            itemId: line.itemId,
            warehouseId: t.fromWarehouseId,
            batchNo: line.batchNo ?? null,
            movementType: 'reversal',
            sourceType: 'inventory_transfer',
            sourceId: t.id,
            sourceLineId: line.id,
            qtyDelta: qty,
            unitCost: Number(line.unitCost),
            movedAt: now,
            postedBy: this.ctx.userId ?? null,
          });
        }
      }

      const [u] = await tx
        .update(inventoryTransfers)
        .set({
          status: 'cancelled',
          cancelledAt: new Date(),
          notes: t.notes ? `${t.notes}\n[Cancelled] ${input.reason}` : `[Cancelled] ${input.reason}`,
          updatedAt: new Date(),
        })
        .where(eq(inventoryTransfers.id, id))
        .returning();
      return u!;
    });
  }
}
