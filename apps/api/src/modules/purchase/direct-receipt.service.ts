import { and, eq, gte, lte, desc, sql } from 'drizzle-orm';
import {
  inventoryGrns,
  inventoryGrnLines,
  inventorySerials,
  items as itemsTable,
  warehouses,
} from '@runq/db';
import type { Db } from '@runq/db';
import type { CreateDirectReceiptInput, DirectReceiptFilter } from '@runq/validators';
import type { PaginationMeta } from '@runq/types';
import { applyPagination, calcTotalPages } from '@runq/db';
import { NotFoundError, ConflictError } from '../../utils/errors';
import { nextDocNo } from '../inventory/sequence';
import { StockLedgerService } from '../inventory/stock-ledger.service';

/**
 * PP Phase 4 — Direct Receipt.
 * Spec: docs/purchase-procurement-plan.md §9.
 *
 * Inserts an inventory_grns row (source='direct', status='posted') + line
 * + stock_ledger movement + optional serial capture. **No JE.** The
 * financial side is handled separately:
 *   - For milk during the stub period: the ops module's bill sync posts
 *     `Dr Inventory / Cr AP-Farmer` via AP Pattern-B when the bill lands.
 *   - When Milk Procurement (Phase 6) ships, payouts flow through that
 *     module's own JE poster.
 *
 * Forward compatibility: when Milk Procurement adds
 * `inventory_grns.milk_procurement_id`, existing direct rows stay as
 * `source='direct'` — no migration needed.
 */

export interface DirectReceiptRow {
  id: string;
  grnNo: string;
  warehouseId: string;
  warehouseName: string;
  inventoryItemId: string;
  itemName: string;
  receivedAt: string;
  qty: number;
  unitRate: number;
  lineTotal: number;
  sourceLabel: string | null;
  batchNo: string | null;
  expiryDate: string | null;
  vehicleNo: string | null;
  lrNo: string | null;
  notes: string | null;
  status: string;
  createdAt: string;
}

export interface DirectReceiptListResult {
  data: DirectReceiptRow[];
  meta: PaginationMeta;
}

export class DirectReceiptService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
    private readonly userId?: string | null,
  ) {}

  async create(input: CreateDirectReceiptInput): Promise<{ id: string; grnNo: string }> {
    // Validate item is stock-tracked + tracking flag consistency.
    const [item] = await this.db
      .select({
        id: itemsTable.id,
        name: itemsTable.name,
        trackInventory: itemsTable.trackInventory,
        trackBatches: itemsTable.trackBatches,
        trackExpiry: itemsTable.trackExpiry,
        trackSerials: itemsTable.trackSerials,
      })
      .from(itemsTable)
      .where(and(
        eq(itemsTable.id, input.inventoryItemId),
        eq(itemsTable.tenantId, this.tenantId),
      ))
      .limit(1);
    if (!item) throw new NotFoundError('Item');
    if (!item.trackInventory) throw new ConflictError('Item is not stock-tracked');
    if (item.trackBatches && !input.batchNo) {
      throw new ConflictError(`${item.name} requires a batch number`);
    }
    if (item.trackExpiry && !input.expiryDate) {
      throw new ConflictError(`${item.name} requires an expiry date`);
    }
    if (item.trackSerials) {
      throw new ConflictError(
        `${item.name} is serial-tracked; direct-receipt entry doesn't accept serials yet — use GRN-from-PO`,
      );
    }

    return this.db.transaction(async (tx) => {
      const grnNo = await nextDocNo(tx, this.tenantId, 'GRN');
      const lineTotal = input.qty * input.unitRate;

      const [grn] = await tx
        .insert(inventoryGrns)
        .values({
          tenantId: this.tenantId,
          grnNo,
          warehouseId: input.warehouseId,
          source: 'direct',
          receivedDate: input.receivedAt,
          vehicleNo: input.vehicleNo ?? null,
          lrNo: input.lrNo ?? null,
          // Use sourceLabel as the notes prefix when present — keeps it
          // visible in the inventory drill-through without needing a
          // dedicated column.
          notes: input.sourceLabel
            ? input.notes
              ? `${input.sourceLabel} — ${input.notes}`
              : input.sourceLabel
            : input.notes ?? null,
          status: 'posted',
          postedAt: new Date(),
          totalValue: String(lineTotal),
          createdBy: this.userId ?? null,
        })
        .returning();

      const [insertedLine] = await tx
        .insert(inventoryGrnLines)
        .values({
          tenantId: this.tenantId,
          grnId: grn!.id,
          itemId: input.inventoryItemId,
          batchNo: input.batchNo ?? null,
          mfgDate: input.mfgDate ?? null,
          expiryDate: input.expiryDate ?? null,
          qty: String(input.qty),
          unitRate: String(input.unitRate),
          landedCostPerUnit: '0',
          lineTotal: String(lineTotal),
          notes: input.sourceLabel ?? null,
        })
        .returning();

      // Stock ledger movement. No JE — direct receipts are memo-only.
      const ledger = new StockLedgerService(this.tenantId);
      await ledger.recordMovement(tx, {
        itemId: input.inventoryItemId,
        warehouseId: input.warehouseId,
        batchNo: input.batchNo ?? null,
        movementType: 'grn',
        sourceType: 'inventory_grn',
        sourceId: grn!.id,
        sourceLineId: insertedLine!.id,
        qtyDelta: input.qty,
        unitCost: input.unitRate,
        movedAt: new Date(input.receivedAt),
        postedBy: this.userId ?? null,
      });

      return { id: grn!.id, grnNo: grn!.grnNo };
    });
  }

  async list(
    filters: DirectReceiptFilter,
    pagination: { page: number; limit: number },
  ): Promise<DirectReceiptListResult> {
    const { page, limit } = pagination;
    const { offset } = applyPagination(page, limit);

    const where = and(
      eq(inventoryGrns.tenantId, this.tenantId),
      eq(inventoryGrns.source, 'direct'),
      filters.warehouseId ? eq(inventoryGrns.warehouseId, filters.warehouseId) : undefined,
      filters.dateFrom ? gte(inventoryGrns.receivedDate, filters.dateFrom) : undefined,
      filters.dateTo ? lte(inventoryGrns.receivedDate, filters.dateTo) : undefined,
    );

    // Direct receipts are 1 GRN ↔ 1 line by construction — INNER JOIN
    // safely surfaces the qty/rate/item without ambiguity.
    const [rows, countResult] = await Promise.all([
      this.db
        .select({
          grn: inventoryGrns,
          line: inventoryGrnLines,
          itemName: itemsTable.name,
          warehouseName: warehouses.name,
        })
        .from(inventoryGrns)
        .innerJoin(inventoryGrnLines, eq(inventoryGrnLines.grnId, inventoryGrns.id))
        .innerJoin(itemsTable, eq(itemsTable.id, inventoryGrnLines.itemId))
        .innerJoin(warehouses, eq(warehouses.id, inventoryGrns.warehouseId))
        .where(filters.inventoryItemId
          ? and(where, eq(inventoryGrnLines.itemId, filters.inventoryItemId))
          : where)
        .orderBy(desc(inventoryGrns.receivedDate), desc(inventoryGrns.createdAt))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(inventoryGrns)
        .innerJoin(inventoryGrnLines, eq(inventoryGrnLines.grnId, inventoryGrns.id))
        .where(filters.inventoryItemId
          ? and(where, eq(inventoryGrnLines.itemId, filters.inventoryItemId))
          : where),
    ]);

    const total = countResult[0]?.count ?? 0;
    return {
      data: rows.map((r) => ({
        id: r.grn.id,
        grnNo: r.grn.grnNo,
        warehouseId: r.grn.warehouseId,
        warehouseName: r.warehouseName,
        // Direct receipts always carry item_id (this service writes it
        // unconditionally on create). Assert here so the row type stays
        // string, not string|null.
        inventoryItemId: r.line.itemId!,
        itemName: r.itemName,
        receivedAt: r.grn.receivedDate,
        qty: Number(r.line.qty),
        unitRate: Number(r.line.unitRate),
        lineTotal: Number(r.line.lineTotal),
        sourceLabel: r.line.notes ?? null,
        batchNo: r.line.batchNo ?? null,
        expiryDate: r.line.expiryDate ?? null,
        vehicleNo: r.grn.vehicleNo ?? null,
        lrNo: r.grn.lrNo ?? null,
        notes: r.grn.notes ?? null,
        status: r.grn.status,
        createdAt: r.grn.createdAt.toISOString(),
      })),
      meta: { page, limit, total, totalPages: calcTotalPages(total, limit) },
    };
  }

  async cancel(id: string): Promise<void> {
    // Audit-friendly cancel: flip status, reverse the stock movement.
    return this.db.transaction(async (tx) => {
      const [grn] = await tx
        .select()
        .from(inventoryGrns)
        .where(and(
          eq(inventoryGrns.id, id),
          eq(inventoryGrns.tenantId, this.tenantId),
          eq(inventoryGrns.source, 'direct'),
        ))
        .limit(1);
      if (!grn) throw new NotFoundError('DirectReceipt');
      if (grn.status === 'cancelled') return;

      const lines = await tx
        .select()
        .from(inventoryGrnLines)
        .where(eq(inventoryGrnLines.grnId, id));
      const ledger = new StockLedgerService(this.tenantId);
      for (const line of lines) {
        // Direct receipts are always item-master; the cancel path can
        // safely assert. Catalog-only lines never come through here.
        await ledger.recordMovement(tx, {
          itemId: line.itemId!,
          warehouseId: grn.warehouseId,
          batchNo: line.batchNo ?? null,
          movementType: 'reversal',
          sourceType: 'inventory_grn',
          sourceId: grn.id,
          sourceLineId: line.id,
          qtyDelta: -Number(line.qty),
          unitCost: Number(line.unitRate),
          movedAt: new Date(),
          postedBy: this.userId ?? null,
        });
        // Drop captured serials too (defensive — direct receipts don't
        // currently capture serials but the guard is cheap and protects
        // a future change).
        await tx
          .delete(inventorySerials)
          .where(and(
            eq(inventorySerials.grnId, grn.id),
            eq(inventorySerials.tenantId, this.tenantId),
          ));
      }

      await tx
        .update(inventoryGrns)
        .set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
        .where(eq(inventoryGrns.id, id));
    });
  }
}
