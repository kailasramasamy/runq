import { and, asc, desc, eq, sql, count } from 'drizzle-orm';
import type { Db } from '@runq/db';
import {
  inventoryStockTakes, inventoryStockTakeLines, stockOnHand, items, warehouses,
  inventoryAdjustments, inventoryAdjustmentLines,
} from '@runq/db';
import type {
  StartStockTakeInput, UpsertCountLinesInput, UpdateCountLineInput,
  RecountStockTakeInput, StockTakeFilter,
} from '@runq/validators';
import { AppError, ConflictError, NotFoundError } from '../../utils/errors';
import { StockLedgerService } from './stock-ledger.service';
import { InventoryGlPoster } from './gl-poster';
import { nextDocNo } from './sequence';

interface Ctx { db: Db; tenantId: string; userId?: string }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = any;

export class StockTakeService {
  constructor(private readonly ctx: Ctx) {}

  async list(filter: StockTakeFilter) {
    const conds = [eq(inventoryStockTakes.tenantId, this.ctx.tenantId)];
    if (filter.status) conds.push(eq(inventoryStockTakes.status, filter.status));
    if (filter.warehouseId) conds.push(eq(inventoryStockTakes.warehouseId, filter.warehouseId));

    const offset = (filter.page - 1) * filter.limit;
    const where = and(...conds)!;
    const [rows, [{ total }]] = await Promise.all([
      this.ctx.db
        .select({
          st: inventoryStockTakes,
          warehouseName: warehouses.name,
          // Total snapshot lines + counted-so-far. Drives the progress
          // bar on the redesigned session tile without having to fetch
          // the full detail per row.
          totalLines: sql<number>`(
            SELECT COUNT(*)::int FROM ${inventoryStockTakeLines}
            WHERE ${inventoryStockTakeLines.stockTakeId} = ${inventoryStockTakes.id}
          )`.as('total_lines'),
          countedLines: sql<number>`(
            SELECT COUNT(*)::int FROM ${inventoryStockTakeLines}
            WHERE ${inventoryStockTakeLines.stockTakeId} = ${inventoryStockTakes.id}
              AND ${inventoryStockTakeLines.countedQty} IS NOT NULL
          )`.as('counted_lines'),
        })
        .from(inventoryStockTakes)
        .innerJoin(warehouses, eq(warehouses.id, inventoryStockTakes.warehouseId))
        .where(where)
        .orderBy(desc(inventoryStockTakes.createdAt))
        .limit(filter.limit)
        .offset(offset),
      this.ctx.db.select({ total: count() }).from(inventoryStockTakes).where(where),
    ]);
    return {
      data: rows.map((r) => ({
        ...r.st,
        warehouseName: r.warehouseName,
        totalLines: Number(r.totalLines ?? 0),
        countedLines: Number(r.countedLines ?? 0),
      })),
      page: filter.page, limit: filter.limit, total,
      totalPages: Math.ceil(total / filter.limit),
    };
  }

  async get(id: string) {
    const [row] = await this.ctx.db
      .select({ st: inventoryStockTakes, warehouseName: warehouses.name })
      .from(inventoryStockTakes)
      .innerJoin(warehouses, eq(warehouses.id, inventoryStockTakes.warehouseId))
      .where(and(eq(inventoryStockTakes.id, id), eq(inventoryStockTakes.tenantId, this.ctx.tenantId)))
      .limit(1);
    if (!row) throw new NotFoundError('Stock take');
    const lines = await this.ctx.db
      .select({
        l: inventoryStockTakeLines,
        itemName: items.name, itemSku: items.sku, itemUnit: items.unit,
      })
      .from(inventoryStockTakeLines)
      .innerJoin(items, eq(items.id, inventoryStockTakeLines.itemId))
      .where(eq(inventoryStockTakeLines.stockTakeId, id))
      .orderBy(asc(items.name));
    return {
      ...row.st,
      warehouseName: row.warehouseName,
      lines: lines.map((l) => ({
        ...l.l,
        itemName: l.itemName, itemSku: l.itemSku, itemUnit: l.itemUnit,
        // Surface variance as a number so the count screen doesn't have to recompute.
        variance: l.l.countedQty == null ? null : Number(l.l.countedQty) - Number(l.l.systemQty),
      })),
    };
  }

  /**
   * Start a session: snapshot the warehouse's on-hand rows into stock_take_lines.
   * The snapshot is the system_qty baseline against which counted_qty is compared.
   */
  async start(input: StartStockTakeInput) {
    return this.ctx.db.transaction(async (tx: Tx) => {
      const stNo = await nextDocNo(tx, this.ctx.tenantId, 'ST');
      const [st] = await tx
        .insert(inventoryStockTakes)
        .values({
          tenantId: this.ctx.tenantId,
          stNo,
          warehouseId: input.warehouseId,
          scope: input.scope,
          categoryId: input.categoryId ?? null,
          notes: input.notes ?? null,
          frozen: input.freeze ?? false,
          createdBy: this.ctx.userId ?? null,
        })
        .returning();

      // Snapshot on-hand. For category scope we filter by the items.category_id
      // FK directly — items no longer carries the denormalized category name.
      const snapshot = await tx.execute(sql`
        SELECT soh.item_id, soh.batch_no, soh.qty, soh.avg_cost
        FROM stock_on_hand soh
        INNER JOIN items i ON i.id = soh.item_id
        WHERE soh.tenant_id = ${this.ctx.tenantId}
          AND soh.warehouse_id = ${input.warehouseId}
        ${input.scope === 'partial' && input.categoryId
          ? sql`AND i.category_id = ${input.categoryId}`
          : sql``}
      `);
      const rows = (snapshot as unknown as {
        rows: Array<{ item_id: string; batch_no: string; qty: string; avg_cost: string }>;
      }).rows;

      if (rows.length > 0) {
        await tx.insert(inventoryStockTakeLines).values(
          rows.map((r) => ({
            tenantId: this.ctx.tenantId,
            stockTakeId: st!.id,
            itemId: r.item_id,
            batchNo: r.batch_no || null,
            systemQty: r.qty,
            unitCost: r.avg_cost,
          })),
        );
      }
      return st!;
    });
  }

  /** Bulk upsert counted qty by (itemId, batchNo). */
  async upsertCounts(id: string, input: UpsertCountLinesInput) {
    return this.ctx.db.transaction(async (tx: Tx) => {
      const [st] = await tx
        .select()
        .from(inventoryStockTakes)
        .where(and(eq(inventoryStockTakes.id, id), eq(inventoryStockTakes.tenantId, this.ctx.tenantId)))
        .limit(1);
      if (!st) throw new NotFoundError('Stock take');
      if (st.status !== 'in_progress') {
        throw new ConflictError(`Stock take is ${st.status}`);
      }

      const now = new Date();
      const user = this.ctx.userId ?? null;
      for (const line of input.lines) {
        const batchKey = line.batchNo ?? null;
        // Find existing snapshot row. If missing (item not on-hand at start),
        // create a new row with system_qty=0 — surplus stock the count discovered.
        const existing = await tx
          .select({ id: inventoryStockTakeLines.id })
          .from(inventoryStockTakeLines)
          .where(
            and(
              eq(inventoryStockTakeLines.stockTakeId, id),
              eq(inventoryStockTakeLines.itemId, line.itemId),
              batchKey === null
                ? sql`${inventoryStockTakeLines.batchNo} IS NULL`
                : eq(inventoryStockTakeLines.batchNo, batchKey),
            ),
          )
          .limit(1);
        if (existing.length > 0) {
          await tx
            .update(inventoryStockTakeLines)
            .set({ countedQty: String(line.countedQty), countedBy: user, countedAt: now })
            .where(eq(inventoryStockTakeLines.id, existing[0]!.id));
        } else {
          await tx.insert(inventoryStockTakeLines).values({
            tenantId: this.ctx.tenantId,
            stockTakeId: id,
            itemId: line.itemId,
            batchNo: batchKey,
            systemQty: '0',
            countedQty: String(line.countedQty),
            unitCost: '0',
            countedBy: user,
            countedAt: now,
          });
        }
      }
      return { upserted: input.lines.length };
    });
  }

  async updateLine(id: string, lineId: string, input: UpdateCountLineInput) {
    const [u] = await this.ctx.db
      .update(inventoryStockTakeLines)
      .set({
        countedQty: String(input.countedQty),
        recountFlag: input.recountFlag ?? false,
        countedBy: this.ctx.userId ?? null,
        countedAt: new Date(),
      })
      .where(
        and(
          eq(inventoryStockTakeLines.id, lineId),
          eq(inventoryStockTakeLines.stockTakeId, id),
          eq(inventoryStockTakeLines.tenantId, this.ctx.tenantId),
        ),
      )
      .returning();
    if (!u) throw new NotFoundError('Stock take line');
    return u;
  }

  /** Mark high-variance lines for recount. */
  async markRecount(id: string, input: RecountStockTakeInput) {
    if (input.lineIds && input.lineIds.length > 0) {
      await this.ctx.db.execute(sql`
        UPDATE inventory_stock_take_lines
        SET recount_flag = TRUE
        WHERE stock_take_id = ${id}
          AND tenant_id = ${this.ctx.tenantId}
          AND id = ANY(${input.lineIds})
      `);
    } else if (input.varianceThresholdPct != null) {
      const threshold = input.varianceThresholdPct / 100;
      await this.ctx.db.execute(sql`
        UPDATE inventory_stock_take_lines
        SET recount_flag = TRUE
        WHERE stock_take_id = ${id}
          AND tenant_id = ${this.ctx.tenantId}
          AND counted_qty IS NOT NULL
          AND system_qty > 0
          AND ABS(counted_qty - system_qty) / system_qty >= ${threshold}
      `);
    }
    return { ok: true };
  }

  /**
   * Post: collapse all counted lines into a single inventory_adjustment +
   * post via the adjustment poster. Uncounted lines are treated as no-change.
   */
  async post(id: string) {
    return this.ctx.db.transaction(async (tx: Tx) => {
      const [st] = await tx
        .select()
        .from(inventoryStockTakes)
        .where(and(eq(inventoryStockTakes.id, id), eq(inventoryStockTakes.tenantId, this.ctx.tenantId)))
        .limit(1);
      if (!st) throw new NotFoundError('Stock take');
      if (st.status !== 'in_progress') {
        throw new ConflictError(`Stock take is ${st.status} — cannot post`);
      }

      const lines = await tx
        .select()
        .from(inventoryStockTakeLines)
        .where(eq(inventoryStockTakeLines.stockTakeId, id));
      const variances = lines
        .map((l: { id: string; itemId: string; batchNo: string | null; systemQty: string; countedQty: string | null; unitCost: string }) => ({
          itemId: l.itemId,
          batchNo: l.batchNo,
          delta: l.countedQty == null ? 0 : Number(l.countedQty) - Number(l.systemQty),
          unitCost: Number(l.unitCost),
        }))
        .filter((v: { delta: number }) => v.delta !== 0);

      if (variances.length === 0) {
        // No variance — just mark posted with no JE.
        const [u] = await tx
          .update(inventoryStockTakes)
          .set({ status: 'posted', completedAt: new Date(), updatedAt: new Date() })
          .where(eq(inventoryStockTakes.id, id))
          .returning();
        return u!;
      }

      // Write the consolidated adjustment first.
      const adjNo = await nextDocNo(tx, this.ctx.tenantId, 'ADJ');
      const today = new Date().toISOString().slice(0, 10);
      const [adj] = await tx
        .insert(inventoryAdjustments)
        .values({
          tenantId: this.ctx.tenantId,
          adjNo,
          warehouseId: st.warehouseId,
          reason: 'correction',
          adjustmentDate: today,
          notes: `Stock take variance — ${st.stNo}`,
          status: 'posted',
          createdBy: this.ctx.userId ?? null,
        })
        .returning();

      const ledger = new StockLedgerService(this.ctx.tenantId);
      const movedAt = new Date();
      let valueDelta = 0;
      for (const v of variances) {
        const result = await ledger.recordMovement(tx, {
          itemId: v.itemId,
          warehouseId: st.warehouseId,
          batchNo: v.batchNo,
          movementType: v.delta > 0 ? 'stock_take_in' : 'stock_take_out',
          sourceType: 'inventory_stock_take',
          sourceId: st.id,
          qtyDelta: v.delta,
          unitCost: v.unitCost > 0 ? v.unitCost : undefined,
          movedAt,
          postedBy: this.ctx.userId ?? null,
        });
        const lineValueDelta = v.delta * result.unitCostUsed;
        valueDelta += lineValueDelta;
        await tx.insert(inventoryAdjustmentLines).values({
          tenantId: this.ctx.tenantId,
          adjustmentId: adj!.id,
          itemId: v.itemId,
          batchNo: v.batchNo,
          qtyDelta: String(v.delta),
          unitCost: String(result.unitCostUsed),
          valueDelta: String(lineValueDelta),
        });
      }

      const poster = new InventoryGlPoster(tx, this.ctx.tenantId, this.ctx.userId);
      const jeId = await poster.postStockTake({
        date: today,
        stockTakeId: st.id,
        stNo: st.stNo,
        valueDelta,
      });

      await tx
        .update(inventoryAdjustments)
        .set({
          totalValueDelta: String(valueDelta),
          journalEntryId: jeId,
          postedAt: new Date(),
        })
        .where(eq(inventoryAdjustments.id, adj!.id));

      if (jeId) {
        await tx.execute(sql`
          UPDATE stock_ledger SET journal_entry_id = ${jeId}
          WHERE tenant_id = ${this.ctx.tenantId}
            AND source_type = 'inventory_stock_take' AND source_id = ${st.id}
        `);
      }

      const [u] = await tx
        .update(inventoryStockTakes)
        .set({
          status: 'posted',
          completedAt: new Date(),
          adjustmentId: adj!.id,
          updatedAt: new Date(),
        })
        .where(eq(inventoryStockTakes.id, id))
        .returning();
      return u!;
    });
  }

  async cancel(id: string) {
    const [u] = await this.ctx.db
      .update(inventoryStockTakes)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(
        and(
          eq(inventoryStockTakes.id, id),
          eq(inventoryStockTakes.tenantId, this.ctx.tenantId),
          eq(inventoryStockTakes.status, 'in_progress'),
        ),
      )
      .returning();
    if (!u) throw new NotFoundError('Stock take or not cancellable');
    return u;
  }
}

// Bridge throw — used by GRN/DN/transfer/adjustment services in Phase 3 to
// block writes while a stock take is frozen on the touched (warehouse, item).
// Exposed but not wired in yet — see plan §7 item 13.
export async function assertNotFrozen(
  db: Db,
  tenantId: string,
  warehouseId: string,
  _itemId: string,
): Promise<void> {
  const result = await db.execute(sql`
    SELECT 1 FROM inventory_stock_takes
    WHERE tenant_id = ${tenantId}
      AND warehouse_id = ${warehouseId}
      AND status = 'in_progress'
      AND frozen = TRUE
    LIMIT 1
  `);
  const rows = (result as unknown as { rows: unknown[] }).rows;
  if (rows.length > 0) {
    throw new AppError(409, 'A frozen stock-take session is in progress for this warehouse');
  }
}
