/**
 * Stock ledger writer.
 *
 * `recordMovement` is the single chokepoint for every stock change. It
 *   1. row-locks the matching `stock_on_hand` row,
 *   2. computes new qty + moving-weighted-average cost,
 *   3. inserts an append-only `stock_ledger` row,
 *   4. upserts the cache row.
 *
 * All four steps run inside the caller's transaction (`tx`), so GRN/DN
 * services can compose ledger writes with status updates + JE posting in
 * a single atomic unit.
 */

import { and, eq, sql } from 'drizzle-orm';
import { stockLedger, stockOnHand, items } from '@runq/db';
import { AppError, NotFoundError } from '../../utils/errors';

// Drizzle's tx parameter has a different concrete type to the top-level Db
// client (PgTransaction vs NodePgDatabase). Both expose the same query
// surface — `any` here keeps the service callable from both.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = any;

export type StockMovementType =
  | 'grn' | 'delivery' | 'transfer_in' | 'transfer_out'
  | 'adjustment_in' | 'adjustment_out' | 'opening' | 'reversal'
  | 'stock_take_in' | 'stock_take_out'
  | 'production_out' | 'production_in'
  | 'sales_return_in'
  | 'reclaim_out' | 'reclaim_in';

export interface MovementInput {
  itemId: string;
  warehouseId: string;
  batchNo?: string | null;
  movementType: StockMovementType;
  sourceType: string;
  sourceId: string;
  sourceLineId?: string | null;
  /** Positive for inbound, negative for outbound. */
  qtyDelta: number;
  /** Cost per unit. Required for inbound (sets WA). Ignored for outbound — service pulls from cache. */
  unitCost?: number;
  movedAt: Date;
  postedBy?: string | null;
  journalEntryId?: string | null;
}

export interface MovementResult {
  ledgerId: string;
  runningQty: number;
  runningValue: number;
  unitCostUsed: number;
}

export class StockLedgerService {
  constructor(private readonly tenantId: string) {}

  /** Read on-hand qty + WA cost for a single (item, wh, batch). Locks the row. */
  private async readOnHandLocked(tx: Tx, itemId: string, warehouseId: string, batchKey: string) {
    const result = await tx.execute(sql`
      SELECT qty::text AS qty, avg_cost::text AS avg_cost, value::text AS value
      FROM stock_on_hand
      WHERE tenant_id = ${this.tenantId}
        AND item_id = ${itemId}
        AND warehouse_id = ${warehouseId}
        AND batch_no = ${batchKey}
      FOR UPDATE
    `);
    const row = (result as unknown as { rows: Array<{ qty: string; avg_cost: string; value: string }> }).rows[0];
    if (!row) return { qty: 0, avgCost: 0, value: 0, exists: false };
    return {
      qty: Number(row.qty),
      avgCost: Number(row.avg_cost),
      value: Number(row.value),
      exists: true,
    };
  }

  async recordMovement(tx: Tx, input: MovementInput): Promise<MovementResult> {
    const batchKey = input.batchNo ?? '';

    // 1. Pull item config (batch tracking, negative-stock allowance).
    const [item] = await tx
      .select({
        id: items.id,
        trackInventory: items.trackInventory,
        trackBatches: items.trackBatches,
        allowNegativeStock: items.allowNegativeStock,
        costPrice: items.costPrice,
      })
      .from(items)
      .where(and(eq(items.id, input.itemId), eq(items.tenantId, this.tenantId)))
      .limit(1);
    if (!item) throw new NotFoundError('Item');
    if (!item.trackInventory) {
      throw new AppError(400, 'Item is not inventoried (trackInventory=false)');
    }
    if (item.trackBatches && !input.batchNo) {
      throw new AppError(400, 'Batch number is required for this item');
    }
    if (!item.trackBatches && input.batchNo) {
      throw new AppError(400, 'Item does not track batches; batch_no must be empty');
    }

    // 2. Lock + read on-hand cache.
    const current = await this.readOnHandLocked(tx, input.itemId, input.warehouseId, batchKey);

    // 3. Compute new qty + WA cost.
    const isInbound = input.qtyDelta > 0;
    // For inbound moves, fall back to the existing WA cost when the caller
    // omits unit cost — otherwise a zero-cost inbound silently dilutes the
    // pool. GRN/DN supply real landed costs; mobile adjustment_in does not,
    // so we trust the pool's current cost first, then the item master, then 0.
    const itemCostPrice = Number(item.costPrice ?? 0);
    const providedCost = input.unitCost ?? 0;
    const incomingCost = isInbound && providedCost <= 0
      ? (current.qty > 0 && current.avgCost > 0
          ? current.avgCost
          : (itemCostPrice > 0 ? itemCostPrice : 0))
      : providedCost;

    const newQty = current.qty + input.qtyDelta;
    if (newQty < 0 && !item.allowNegativeStock) {
      throw new AppError(
        409,
        `Insufficient stock: on hand ${current.qty}, requested ${Math.abs(input.qtyDelta)}`,
      );
    }

    let newAvgCost = current.avgCost;
    let unitCostUsed = current.avgCost;

    if (isInbound) {
      const newValue = current.value + input.qtyDelta * incomingCost;
      newAvgCost = newQty > 0 ? newValue / newQty : incomingCost;
      unitCostUsed = incomingCost;
    } else {
      // Outbound uses current WA cost. If on-hand was zero (negative allowed),
      // fall back to caller-provided unit cost or 0.
      unitCostUsed = current.qty > 0 ? current.avgCost : (input.unitCost ?? 0);
    }
    const newValue = newQty * newAvgCost;

    // 4. Insert ledger row.
    const [ledger] = await tx
      .insert(stockLedger)
      .values({
        tenantId: this.tenantId,
        itemId: input.itemId,
        warehouseId: input.warehouseId,
        batchNo: input.batchNo ?? null,
        movementType: input.movementType,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        sourceLineId: input.sourceLineId ?? null,
        qtyIn: isInbound ? String(input.qtyDelta) : '0',
        qtyOut: isInbound ? '0' : String(-input.qtyDelta),
        unitCost: String(unitCostUsed),
        runningQty: String(newQty),
        runningValue: String(newValue),
        movedAt: input.movedAt,
        postedBy: input.postedBy ?? null,
        journalEntryId: input.journalEntryId ?? null,
      })
      .returning({ id: stockLedger.id });

    // 5. Upsert cache row.
    if (current.exists) {
      await tx
        .update(stockOnHand)
        .set({
          qty: String(newQty),
          avgCost: String(newAvgCost),
          value: String(newValue),
          lastMovementAt: input.movedAt,
        })
        .where(
          and(
            eq(stockOnHand.tenantId, this.tenantId),
            eq(stockOnHand.itemId, input.itemId),
            eq(stockOnHand.warehouseId, input.warehouseId),
            eq(stockOnHand.batchNo, batchKey),
          ),
        );
    } else {
      await tx.insert(stockOnHand).values({
        tenantId: this.tenantId,
        itemId: input.itemId,
        warehouseId: input.warehouseId,
        batchNo: batchKey,
        qty: String(newQty),
        avgCost: String(newAvgCost),
        value: String(newValue),
        lastMovementAt: input.movedAt,
      });
    }

    return {
      ledgerId: ledger!.id,
      runningQty: newQty,
      runningValue: newValue,
      unitCostUsed,
    };
  }
}
