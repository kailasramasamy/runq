/**
 * Manufacturing Phase 2 — WO Consumption service.
 *
 * Handles recording and reversing input draws against a work order.
 * Each consumption row creates a matching `production_out` stock ledger entry.
 *
 * Plan: docs/manufacturing-plan.md §4.4, §5.3, §8.
 */

import { and, eq, sql } from 'drizzle-orm';
import {
  workOrders,
  woConsumption,
  items,
  warehouses,
} from '@runq/db';
import type { Db } from '@runq/db';
import { NotFoundError, ConflictError, AppError } from '../../utils/errors';
import { StockLedgerService } from '../inventory/stock-ledger.service';
import type { WoConsumption } from '@runq/types';
import type { RecordConsumptionInput } from '@runq/validators';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = any;

export class WoConsumptionService {
  private readonly ledger: StockLedgerService;

  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {
    this.ledger = new StockLedgerService(tenantId);
  }

  async list(woId: string): Promise<WoConsumption[]> {
    const rows = await this.db
      .select({
        c: woConsumption,
        itemName: items.name,
        warehouseName: warehouses.name,
      })
      .from(woConsumption)
      .innerJoin(items, eq(items.id, woConsumption.inputItemId))
      .innerJoin(warehouses, eq(warehouses.id, woConsumption.warehouseId))
      .where(and(eq(woConsumption.woId, woId), eq(woConsumption.tenantId, this.tenantId)))
      .orderBy(woConsumption.consumedAt);

    return rows.map((r) => this.toConsumption(r.c, r.itemName, r.warehouseName));
  }

  async record(woId: string, input: RecordConsumptionInput, userId?: string): Promise<WoConsumption> {
    // Idempotency: if the client supplied a key already used by this tenant,
    // return the existing row instead of creating a duplicate. This is the
    // safety net behind the mobile offline-queue replay (Phase 2.5).
    if (input.idempotencyKey) {
      const existing = await this.findByIdempotencyKey(input.idempotencyKey);
      if (existing) return existing;
    }

    return this.db.transaction(async (tx: Tx) => {
      const wo = await this.loadWo(tx, woId);
      if (wo.status !== 'in_progress') {
        throw new ConflictError(`WO must be in_progress to record consumption (current: ${wo.status})`);
      }

      const item = await this.loadItem(tx, input.inputItemId);

      if (item.trackBatches && !input.batchNo) {
        throw new AppError(422, 'Batch required for batch-tracked item');
      }

      const batchKey = input.batchNo ?? '';
      const onHand = await this.readOnHand(tx, input.inputItemId, input.warehouseId, batchKey);
      if (!onHand || onHand.qty < input.qty) {
        throw new AppError(422, `Insufficient stock — batch ${batchKey || '(none)'} has only ${onHand?.qty ?? 0}`);
      }

      const cachedWAC = onHand.avgCost;
      const value = Math.round(input.qty * cachedWAC * 100) / 100;

      const { ledgerId } = await this.ledger.recordMovement(tx, {
        itemId: input.inputItemId,
        warehouseId: input.warehouseId,
        batchNo: input.batchNo ?? null,
        movementType: 'production_out',
        sourceType: 'work_order',
        sourceId: woId,
        qtyDelta: -input.qty,
        unitCost: cachedWAC,
        movedAt: new Date(),
        postedBy: userId ?? null,
      });

      const [row] = await tx
        .insert(woConsumption)
        .values({
          tenantId: this.tenantId,
          woId,
          bomLineId: input.bomLineId ?? null,
          inputItemId: input.inputItemId,
          batchNo: input.batchNo ?? null,
          warehouseId: input.warehouseId,
          qty: String(input.qty),
          uom: input.uom,
          unitCost: String(cachedWAC),
          value: String(value),
          consumedBy: userId ?? null,
          stockTxnId: ledgerId,
          notes: input.notes ?? null,
          idempotencyKey: input.idempotencyKey ?? null,
        })
        .returning();

      await tx
        .update(workOrders)
        .set({
          consumedValue: sql`${workOrders.consumedValue} + ${String(value)}`,
          updatedAt: new Date(),
        })
        .where(and(eq(workOrders.id, woId), eq(workOrders.tenantId, this.tenantId)));

      return this.fetchRow(tx, row!.id);
    });
  }

  async reverse(consumptionId: string, userId?: string): Promise<void> {
    await this.db.transaction(async (tx: Tx) => {
      const [row] = await tx
        .select()
        .from(woConsumption)
        .where(and(eq(woConsumption.id, consumptionId), eq(woConsumption.tenantId, this.tenantId)))
        .limit(1);
      if (!row) throw new NotFoundError('Consumption');

      const wo = await this.loadWo(tx, row.woId);
      if (wo.status !== 'in_progress') {
        throw new ConflictError('Can only reverse consumption when WO is in_progress');
      }

      const qty = Number(row.qty);
      const unitCost = Number(row.unitCost);
      const value = Number(row.value);

      await this.ledger.recordMovement(tx, {
        itemId: row.inputItemId,
        warehouseId: row.warehouseId,
        batchNo: row.batchNo ?? null,
        movementType: 'reversal',
        sourceType: 'work_order_reversal',
        sourceId: consumptionId,
        qtyDelta: qty,
        unitCost,
        movedAt: new Date(),
        postedBy: userId ?? null,
      });

      await tx.delete(woConsumption).where(eq(woConsumption.id, consumptionId));

      await tx
        .update(workOrders)
        .set({
          consumedValue: sql`${workOrders.consumedValue} - ${String(value)}`,
          updatedAt: new Date(),
        })
        .where(and(eq(workOrders.id, row.woId), eq(workOrders.tenantId, this.tenantId)));
    });
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  private async findByIdempotencyKey(key: string): Promise<WoConsumption | null> {
    const [row] = await this.db
      .select({
        c: woConsumption,
        itemName: items.name,
        warehouseName: warehouses.name,
      })
      .from(woConsumption)
      .innerJoin(items, eq(items.id, woConsumption.inputItemId))
      .innerJoin(warehouses, eq(warehouses.id, woConsumption.warehouseId))
      .where(
        and(
          eq(woConsumption.tenantId, this.tenantId),
          eq(woConsumption.idempotencyKey, key),
        ),
      )
      .limit(1);
    return row ? this.toConsumption(row.c, row.itemName, row.warehouseName) : null;
  }

  private async loadWo(tx: Tx, woId: string) {
    const [wo] = await tx
      .select({ id: workOrders.id, status: workOrders.status, tenantId: workOrders.tenantId })
      .from(workOrders)
      .where(and(eq(workOrders.id, woId), eq(workOrders.tenantId, this.tenantId)))
      .limit(1);
    if (!wo) throw new NotFoundError('WorkOrder');
    return wo;
  }

  private async loadItem(tx: Tx, itemId: string) {
    const [item] = await tx
      .select({ id: items.id, trackBatches: items.trackBatches, itemClass: items.itemClass })
      .from(items)
      .where(and(eq(items.id, itemId), eq(items.tenantId, this.tenantId)))
      .limit(1);
    if (!item) throw new NotFoundError('Item');
    return item;
  }

  private async readOnHand(tx: Tx, itemId: string, warehouseId: string, batchKey: string) {
    const result = await tx.execute(sql`
      SELECT qty::float AS qty, avg_cost::float AS avg_cost
      FROM stock_on_hand
      WHERE tenant_id = ${this.tenantId}
        AND item_id = ${itemId}
        AND warehouse_id = ${warehouseId}
        AND batch_no = ${batchKey}
      LIMIT 1
    `);
    const rows = (result as unknown as { rows: Array<{ qty: number; avg_cost: number }> }).rows;
    if (!rows[0]) return null;
    return { qty: Number(rows[0].qty), avgCost: Number(rows[0].avg_cost) };
  }

  private async fetchRow(tx: Tx, id: string): Promise<WoConsumption> {
    const [row] = await tx
      .select({
        c: woConsumption,
        itemName: items.name,
        warehouseName: warehouses.name,
      })
      .from(woConsumption)
      .innerJoin(items, eq(items.id, woConsumption.inputItemId))
      .innerJoin(warehouses, eq(warehouses.id, woConsumption.warehouseId))
      .where(eq(woConsumption.id, id))
      .limit(1);

    if (!row) throw new NotFoundError('Consumption');
    return this.toConsumption(row.c, row.itemName, row.warehouseName);
  }

  private toConsumption(
    c: typeof woConsumption.$inferSelect,
    inputItemName: string,
    warehouseName: string,
  ): WoConsumption {
    return {
      id: c.id,
      tenantId: c.tenantId,
      woId: c.woId,
      bomLineId: c.bomLineId ?? null,
      inputItemId: c.inputItemId,
      inputItemName,
      batchNo: c.batchNo ?? null,
      warehouseId: c.warehouseId,
      warehouseName,
      qty: Number(c.qty),
      uom: c.uom,
      unitCost: Number(c.unitCost),
      value: Number(c.value),
      consumedAt: c.consumedAt.toISOString(),
      consumedBy: c.consumedBy ?? null,
      stockTxnId: c.stockTxnId ?? null,
      notes: c.notes ?? null,
    };
  }
}
