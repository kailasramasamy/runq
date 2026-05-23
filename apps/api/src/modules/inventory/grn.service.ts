import { and, asc, desc, eq, inArray, sql, ilike, gte, lte, count } from 'drizzle-orm';
import type { Db } from '@runq/db';
import {
  inventoryGrns, inventoryGrnLines, items, warehouses, vendors,
  inventorySerials,
} from '@runq/db';
import type {
  CreateGrnInput, UpdateGrnInput, GrnFilter, CancelGrnInput,
} from '@runq/validators';
import { AppError, ConflictError, NotFoundError } from '../../utils/errors';
import { StockLedgerService } from './stock-ledger.service';
import { InventoryGlPoster } from './gl-poster';
import { nextDocNo } from './sequence';

interface Ctx { db: Db; tenantId: string; userId?: string }

// Drizzle's tx parameter is a PgTransaction, not the top-level Db client.
// Both expose the same query surface — `any` here avoids a structural mismatch.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = any;

export class GrnService {
  constructor(private readonly ctx: Ctx) {}

  async list(filter: GrnFilter) {
    const conds = [eq(inventoryGrns.tenantId, this.ctx.tenantId)];
    if (filter.status) conds.push(eq(inventoryGrns.status, filter.status));
    if (filter.warehouseId) conds.push(eq(inventoryGrns.warehouseId, filter.warehouseId));
    if (filter.vendorId) conds.push(eq(inventoryGrns.vendorId, filter.vendorId));
    if (filter.from) conds.push(gte(inventoryGrns.receivedDate, filter.from));
    if (filter.to) conds.push(lte(inventoryGrns.receivedDate, filter.to));
    if (filter.q) conds.push(ilike(inventoryGrns.grnNo, `%${filter.q}%`));

    const offset = (filter.page - 1) * filter.limit;
    const where = and(...conds)!;
    const [rows, [{ total }]] = await Promise.all([
      this.ctx.db
        .select({
          grn: inventoryGrns,
          vendorName: vendors.name,
          warehouseName: warehouses.name,
        })
        .from(inventoryGrns)
        .leftJoin(vendors, eq(vendors.id, inventoryGrns.vendorId))
        .innerJoin(warehouses, eq(warehouses.id, inventoryGrns.warehouseId))
        .where(where)
        .orderBy(desc(inventoryGrns.createdAt))
        .limit(filter.limit)
        .offset(offset),
      this.ctx.db
        .select({ total: count() })
        .from(inventoryGrns)
        .where(where),
    ]);

    return {
      data: rows.map((r) => ({
        ...r.grn,
        vendorName: r.vendorName,
        warehouseName: r.warehouseName,
      })),
      page: filter.page,
      limit: filter.limit,
      total,
      totalPages: Math.ceil(total / filter.limit),
    };
  }

  async get(id: string) {
    const [row] = await this.ctx.db
      .select({
        grn: inventoryGrns,
        vendorName: vendors.name,
        warehouseName: warehouses.name,
      })
      .from(inventoryGrns)
      .leftJoin(vendors, eq(vendors.id, inventoryGrns.vendorId))
      .innerJoin(warehouses, eq(warehouses.id, inventoryGrns.warehouseId))
      .where(and(eq(inventoryGrns.id, id), eq(inventoryGrns.tenantId, this.ctx.tenantId)))
      .limit(1);
    if (!row) throw new NotFoundError('GRN');

    const lines = await this.ctx.db
      .select({
        line: inventoryGrnLines,
        itemName: items.name,
        itemSku: items.sku,
        trackBatches: items.trackBatches,
      })
      .from(inventoryGrnLines)
      .innerJoin(items, eq(items.id, inventoryGrnLines.itemId))
      .where(eq(inventoryGrnLines.grnId, id))
      .orderBy(asc(inventoryGrnLines.id));

    return {
      ...row.grn,
      vendorName: row.vendorName,
      warehouseName: row.warehouseName,
      lines: lines.map((l) => ({ ...l.line, itemName: l.itemName, itemSku: l.itemSku, trackBatches: l.trackBatches })),
    };
  }

  async create(input: CreateGrnInput) {
    return this.ctx.db.transaction(async (tx) => {
      // Validate line items belong to tenant + that batch flags match.
      await this.validateLines(tx, input.lines);
      const grnNo = await nextDocNo(tx, this.ctx.tenantId, 'GRN');
      const totalValue = input.lines.reduce(
        (s, l) => s + l.qty * (l.unitRate + (l.landedCostPerUnit ?? 0)),
        0,
      );

      const [grn] = await tx
        .insert(inventoryGrns)
        .values({
          tenantId: this.ctx.tenantId,
          grnNo,
          warehouseId: input.warehouseId,
          vendorId: input.vendorId ?? null,
          receivedDate: input.receivedDate,
          vehicleNo: input.vehicleNo ?? null,
          lrNo: input.lrNo ?? null,
          notes: input.notes ?? null,
          totalValue: String(totalValue),
          createdBy: this.ctx.userId ?? null,
        })
        .returning();

      await tx.insert(inventoryGrnLines).values(
        input.lines.map((l) => ({
          tenantId: this.ctx.tenantId,
          grnId: grn!.id,
          itemId: l.itemId,
          batchNo: l.batchNo ?? null,
          mfgDate: l.mfgDate ?? null,
          expiryDate: l.expiryDate ?? null,
          qty: String(l.qty),
          uom: l.uom ?? null,
          unitRate: String(l.unitRate),
          landedCostPerUnit: String(l.landedCostPerUnit ?? 0),
          lineTotal: String(l.qty * (l.unitRate + (l.landedCostPerUnit ?? 0))),
          notes: l.notes ?? null,
          serialNos: l.serialNos && l.serialNos.length > 0 ? l.serialNos : null,
        })),
      );

      return grn!;
    });
  }

  async update(id: string, input: UpdateGrnInput) {
    return this.ctx.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(inventoryGrns)
        .where(and(eq(inventoryGrns.id, id), eq(inventoryGrns.tenantId, this.ctx.tenantId)))
        .limit(1);
      if (!existing) throw new NotFoundError('GRN');
      if (existing.status !== 'draft') {
        throw new ConflictError('Only draft GRNs can be edited; cancel and re-create instead');
      }

      if (input.lines) await this.validateLines(tx, input.lines);

      const totalValue = input.lines
        ? input.lines.reduce((s, l) => s + l.qty * (l.unitRate + (l.landedCostPerUnit ?? 0)), 0)
        : Number(existing.totalValue);

      const [grn] = await tx
        .update(inventoryGrns)
        .set({
          warehouseId: input.warehouseId ?? existing.warehouseId,
          vendorId: input.vendorId === undefined ? existing.vendorId : (input.vendorId ?? null),
          receivedDate: input.receivedDate ?? existing.receivedDate,
          vehicleNo: input.vehicleNo === undefined ? existing.vehicleNo : (input.vehicleNo ?? null),
          lrNo: input.lrNo === undefined ? existing.lrNo : (input.lrNo ?? null),
          notes: input.notes === undefined ? existing.notes : (input.notes ?? null),
          totalValue: String(totalValue),
          updatedAt: new Date(),
        })
        .where(eq(inventoryGrns.id, id))
        .returning();

      if (input.lines) {
        await tx.delete(inventoryGrnLines).where(eq(inventoryGrnLines.grnId, id));
        await tx.insert(inventoryGrnLines).values(
          input.lines.map((l) => ({
            tenantId: this.ctx.tenantId,
            grnId: id,
            itemId: l.itemId,
            batchNo: l.batchNo ?? null,
            mfgDate: l.mfgDate ?? null,
            expiryDate: l.expiryDate ?? null,
            qty: String(l.qty),
            uom: l.uom ?? null,
            unitRate: String(l.unitRate),
            landedCostPerUnit: String(l.landedCostPerUnit ?? 0),
            lineTotal: String(l.qty * (l.unitRate + (l.landedCostPerUnit ?? 0))),
            notes: l.notes ?? null,
          })),
        );
      }
      return grn!;
    });
  }

  async post(id: string) {
    return this.ctx.db.transaction(async (tx) => {
      const [grn] = await tx
        .select()
        .from(inventoryGrns)
        .where(and(eq(inventoryGrns.id, id), eq(inventoryGrns.tenantId, this.ctx.tenantId)))
        .limit(1);
      if (!grn) throw new NotFoundError('GRN');
      if (grn.status !== 'draft') throw new ConflictError(`GRN is ${grn.status}`);

      const lines = await tx
        .select()
        .from(inventoryGrnLines)
        .where(eq(inventoryGrnLines.grnId, id));
      if (lines.length === 0) throw new AppError(400, 'GRN has no lines to post');

      const ledger = new StockLedgerService(this.ctx.tenantId);
      const receivedDate = new Date(grn.receivedDate);
      let total = 0;
      for (const line of lines) {
        const qty = Number(line.qty);
        const unitCost = Number(line.unitRate) + Number(line.landedCostPerUnit);
        await ledger.recordMovement(tx, {
          itemId: line.itemId,
          warehouseId: grn.warehouseId,
          batchNo: line.batchNo ?? null,
          movementType: 'grn',
          sourceType: 'inventory_grn',
          sourceId: grn.id,
          sourceLineId: line.id,
          qtyDelta: qty,
          unitCost,
          movedAt: receivedDate,
          postedBy: this.ctx.userId ?? null,
        });
        total += qty * unitCost;

        // Serial capture — one row per scanned serial. Length-vs-qty
        // mismatch is rejected here so the user sees the error at post
        // time (cheaper than at scan time when correcting is harder).
        const serials = line.serialNos as string[] | null;
        if (serials && serials.length > 0) {
          if (serials.length !== qty) {
            throw new AppError(
              400,
              `Line for item ${line.itemId}: ${serials.length} serial(s) captured but qty is ${qty}`,
            );
          }
          await tx.insert(inventorySerials).values(
            serials.map((sn) => ({
              tenantId: this.ctx.tenantId,
              itemId: line.itemId,
              serialNo: sn,
              currentWarehouseId: grn.warehouseId,
              currentStatus: 'in_stock' as const,
              batchNo: line.batchNo ?? null,
              grnId: grn.id,
            })),
          );
        }
      }

      const poster = new InventoryGlPoster(tx, this.ctx.tenantId, this.ctx.userId);
      const jeId = await poster.postGrn({
        date: grn.receivedDate,
        grnId: grn.id,
        grnNo: grn.grnNo,
        value: total,
      });

      const [updated] = await tx
        .update(inventoryGrns)
        .set({
          status: 'posted',
          journalEntryId: jeId,
          postedAt: new Date(),
          totalValue: String(total),
          updatedAt: new Date(),
        })
        .where(eq(inventoryGrns.id, id))
        .returning();

      // Backlink ledger rows to JE (for trail-by-JE reports).
      await tx.execute(sql`
        UPDATE stock_ledger SET journal_entry_id = ${jeId}
        WHERE tenant_id = ${this.ctx.tenantId}
          AND source_type = 'inventory_grn' AND source_id = ${grn.id}
      `);

      return updated!;
    });
  }

  async cancel(id: string, input: CancelGrnInput) {
    return this.ctx.db.transaction(async (tx) => {
      const [grn] = await tx
        .select()
        .from(inventoryGrns)
        .where(and(eq(inventoryGrns.id, id), eq(inventoryGrns.tenantId, this.ctx.tenantId)))
        .limit(1);
      if (!grn) throw new NotFoundError('GRN');
      if (grn.status === 'cancelled') throw new ConflictError('Already cancelled');

      // For draft, simple status flip — no ledger/JE side effects.
      if (grn.status === 'draft') {
        const [u] = await tx
          .update(inventoryGrns)
          .set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
          .where(eq(inventoryGrns.id, id))
          .returning();
        return u!;
      }

      // Posted → write reversal ledger rows + reversal JE.
      const lines = await tx
        .select()
        .from(inventoryGrnLines)
        .where(eq(inventoryGrnLines.grnId, id));
      const ledger = new StockLedgerService(this.ctx.tenantId);
      const now = new Date();
      let total = 0;
      for (const line of lines) {
        const qty = Number(line.qty);
        const cost = Number(line.unitRate) + Number(line.landedCostPerUnit);
        await ledger.recordMovement(tx, {
          itemId: line.itemId,
          warehouseId: grn.warehouseId,
          batchNo: line.batchNo ?? null,
          movementType: 'reversal',
          sourceType: 'inventory_grn',
          sourceId: grn.id,
          sourceLineId: line.id,
          qtyDelta: -qty,
          unitCost: cost,
          movedAt: now,
          postedBy: this.ctx.userId ?? null,
        });
        total += qty * cost;
      }

      const poster = new InventoryGlPoster(tx, this.ctx.tenantId, this.ctx.userId);
      const jeId = await poster.reverseGrn({
        date: now.toISOString().slice(0, 10),
        grnId: grn.id,
        grnNo: grn.grnNo,
        value: total,
        reason: input.reason,
      });

      const [u] = await tx
        .update(inventoryGrns)
        .set({
          status: 'cancelled',
          cancelledAt: now,
          cancelledJournalEntryId: jeId,
          notes: grn.notes
            ? `${grn.notes}\n[Cancelled] ${input.reason}`
            : `[Cancelled] ${input.reason}`,
          updatedAt: now,
        })
        .where(eq(inventoryGrns.id, id))
        .returning();
      return u!;
    });
  }

  private async validateLines(tx: Tx, lines: CreateGrnInput['lines']) {
    const ids = [...new Set(lines.map((l) => l.itemId))];
    const found = (await tx
      .select({ id: items.id, trackBatches: items.trackBatches, trackExpiry: items.trackExpiry })
      .from(items)
      .where(and(eq(items.tenantId, this.ctx.tenantId), inArray(items.id, ids)))) as Array<{
      id: string; trackBatches: boolean; trackExpiry: boolean;
    }>;
    const map = new Map(found.map((i) => [i.id, i]));
    for (const l of lines) {
      const cfg = map.get(l.itemId);
      if (!cfg) throw new AppError(400, `Item ${l.itemId} not found`);
      if (cfg.trackBatches && !l.batchNo) {
        throw new AppError(400, `Item ${l.itemId} requires a batch number`);
      }
      if (cfg.trackExpiry && !l.expiryDate) {
        throw new AppError(400, `Item ${l.itemId} requires an expiry date`);
      }
    }
  }
}
