import { and, asc, desc, eq, sql, ilike, gte, lte, count } from 'drizzle-orm';
import type { Db } from '@runq/db';
import {
  deliveryNotes, deliveryNoteLines, items, warehouses, customers, stockOnHand,
} from '@runq/db';
import type {
  CreateDeliveryNoteInput, UpdateDeliveryNoteInput, DeliveryNoteFilter, CancelDeliveryNoteInput,
  DnLineInput,
} from '@runq/validators';
import { AppError, ConflictError, NotFoundError } from '../../utils/errors';
import { StockLedgerService } from './stock-ledger.service';
import { InventoryGlPoster } from './gl-poster';
import { nextDocNo } from './sequence';

interface Ctx { db: Db; tenantId: string; userId?: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = any;

export class DeliveryNoteService {
  constructor(private readonly ctx: Ctx) {}

  async list(filter: DeliveryNoteFilter) {
    const conds = [eq(deliveryNotes.tenantId, this.ctx.tenantId)];
    if (filter.status) conds.push(eq(deliveryNotes.status, filter.status));
    if (filter.direction) conds.push(eq(deliveryNotes.direction, filter.direction));
    // Keyed-in dispatches carry no invoice — the list flags them "unlinked".
    if (filter.source === 'linked') conds.push(sql`${deliveryNotes.invoiceId} IS NOT NULL`);
    if (filter.source === 'unlinked') conds.push(sql`${deliveryNotes.invoiceId} IS NULL`);
    if (filter.warehouseId) conds.push(eq(deliveryNotes.warehouseId, filter.warehouseId));
    if (filter.customerId) conds.push(eq(deliveryNotes.customerId, filter.customerId));
    if (filter.from) conds.push(gte(deliveryNotes.dispatchDate, filter.from));
    if (filter.to) conds.push(lte(deliveryNotes.dispatchDate, filter.to));
    if (filter.q) conds.push(ilike(deliveryNotes.dnNo, `%${filter.q}%`));

    const offset = (filter.page - 1) * filter.limit;
    const where = and(...conds)!;
    const [rows, [{ total }]] = await Promise.all([
      this.ctx.db
        .select({
          dn: deliveryNotes,
          customerName: customers.name,
          warehouseName: warehouses.name,
          // Present only for invoice-raised rows; null renders the "unlinked"
          // chip that flags a hand-keyed dispatch.
          invoiceNumber: sql<string | null>`(
            SELECT si.invoice_number FROM sales_invoices si
            WHERE si.id = ${deliveryNotes.invoiceId}
          )`.as('invoice_number'),
          // Per-row line count for the redesigned mobile DN tile.
          lineCount: sql<number>`(
            SELECT COUNT(*)::int FROM ${deliveryNoteLines}
            WHERE ${deliveryNoteLines.dnId} = ${deliveryNotes.id}
          )`.as('line_count'),
          // Preview total for rows whose snapshot total_value is 0 (drafts,
          // or DNs cancelled before dispatch). Mirrors the fallback chain in
          // get(): line unit_cost → item cost_price → item default_purchase_price.
          previewTotal: sql<string>`COALESCE((
            SELECT SUM(l.qty * COALESCE(
              NULLIF(l.unit_cost::numeric, 0),
              NULLIF(i.cost_price, 0),
              NULLIF(i.default_purchase_price, 0),
              0
            ))
            FROM ${deliveryNoteLines} l
            JOIN ${items} i ON i.id = l.item_id
            WHERE l.dn_id = ${deliveryNotes.id}
          ), 0)`.as('preview_total'),
        })
        .from(deliveryNotes)
        .leftJoin(customers, eq(customers.id, deliveryNotes.customerId))
        .innerJoin(warehouses, eq(warehouses.id, deliveryNotes.warehouseId))
        .where(where)
        .orderBy(desc(deliveryNotes.createdAt))
        .limit(filter.limit)
        .offset(offset),
      this.ctx.db.select({ total: count() }).from(deliveryNotes).where(where),
    ]);

    return {
      data: rows.map((r) => {
        // Snapshot totalValue is only set at dispatch — fall back to the
        // line-based preview so drafts and pre-dispatch cancellations show
        // the same total the detail screen does.
        const snap = Number(r.dn.totalValue ?? 0);
        const totalValue = snap > 0 ? r.dn.totalValue : String(r.previewTotal ?? 0);
        return {
          ...r.dn,
          totalValue,
          customerName: r.customerName,
          warehouseName: r.warehouseName,
          invoiceNumber: r.invoiceNumber,
          lineCount: Number(r.lineCount ?? 0),
        };
      }),
      page: filter.page,
      limit: filter.limit,
      total,
      totalPages: Math.ceil(total / filter.limit),
    };
  }

  async get(id: string) {
    const [row] = await this.ctx.db
      .select({
        dn: deliveryNotes,
        customerName: customers.name,
        warehouseName: warehouses.name,
        invoiceNumber: sql<string | null>`(
          SELECT si.invoice_number FROM sales_invoices si
          WHERE si.id = ${deliveryNotes.invoiceId}
        )`.as('invoice_number'),
      })
      .from(deliveryNotes)
      .leftJoin(customers, eq(customers.id, deliveryNotes.customerId))
      .innerJoin(warehouses, eq(warehouses.id, deliveryNotes.warehouseId))
      .where(and(eq(deliveryNotes.id, id), eq(deliveryNotes.tenantId, this.ctx.tenantId)))
      .limit(1);
    if (!row) throw new NotFoundError('Delivery note');
    const lines = await this.ctx.db
      .select({
        line: deliveryNoteLines,
        itemName: items.name, itemSku: items.sku, trackBatches: items.trackBatches,
        itemUnit: items.unit,
        itemCostPrice: items.costPrice,
        itemDefaultPurchasePrice: items.defaultPurchasePrice,
      })
      .from(deliveryNoteLines)
      .innerJoin(items, eq(items.id, deliveryNoteLines.itemId))
      .where(eq(deliveryNoteLines.dnId, id))
      .orderBy(asc(deliveryNoteLines.id));

    // Per-line unit_cost is only snapshotted at dispatch time (from the
    // moving-average on-hand cost). For drafts the column is still 0 — show
    // a live preview using the current avg_cost so the UI isn't all zeros.
    const enriched = await Promise.all(lines.map(async (l) => {
      // Fall back to the item's canonical UOM if the line didn't snapshot one.
      const uom = l.line.uom ?? l.itemUnit ?? null;
      const base = {
        ...l.line, uom,
        itemName: l.itemName, itemSku: l.itemSku, trackBatches: l.trackBatches,
      };
      if (row.dn.status !== 'draft') return base;
      // Cost preview fallback chain:
      //   (1) exact batch on this warehouse  → moving-avg from stock_on_hand
      //   (2) qty-weighted avg across batches in this warehouse
      //   (3) item master cost_price        (purchase landed cost)
      //   (4) item master default_purchase_price (last resort)
      // We need *something* so drafts that haven't received stock yet still
      // show a non-zero COGS preview.
      let cost = 0;
      const [exact] = await this.ctx.db
        .select({ avgCost: stockOnHand.avgCost })
        .from(stockOnHand)
        .where(and(
          eq(stockOnHand.tenantId, this.ctx.tenantId),
          eq(stockOnHand.itemId, l.line.itemId),
          eq(stockOnHand.warehouseId, row.dn.warehouseId),
          eq(stockOnHand.batchNo, l.line.batchNo ?? ''),
        ))
        .limit(1);
      cost = Number(exact?.avgCost ?? 0);
      if (cost <= 0) {
        const [wh] = await this.ctx.db
          .select({
            avg: sql<string>`
              COALESCE(SUM(${stockOnHand.qty} * ${stockOnHand.avgCost})
                       / NULLIF(SUM(${stockOnHand.qty}), 0), 0)
            `.as('avg'),
          })
          .from(stockOnHand)
          .where(and(
            eq(stockOnHand.tenantId, this.ctx.tenantId),
            eq(stockOnHand.itemId, l.line.itemId),
            eq(stockOnHand.warehouseId, row.dn.warehouseId),
          ));
        cost = Number(wh?.avg ?? 0);
      }
      if (cost <= 0) cost = Number(l.itemCostPrice ?? 0);
      if (cost <= 0) cost = Number(l.itemDefaultPurchasePrice ?? 0);
      if (cost <= 0) return base;
      const lineTotal = Number(l.line.qty) * cost;
      return { ...base, unitCost: String(cost), lineTotal: String(lineTotal) };
    }));

    // Header totalValue is also snapshotted at dispatch — preview it from
    // the enriched lines so the draft footer matches.
    const totalValue = row.dn.status === 'draft'
      ? String(enriched.reduce((s, l) => s + Number(l.lineTotal), 0))
      : row.dn.totalValue;

    return {
      ...row.dn,
      totalValue,
      customerName: row.customerName,
      warehouseName: row.warehouseName,
      invoiceNumber: row.invoiceNumber,
      lines: enriched,
    };
  }

  async create(input: CreateDeliveryNoteInput) {
    return this.ctx.db.transaction(async (tx) => {
      const resolved = await this.resolveLines(tx, input.warehouseId, input.lines);
      const dnNo = await nextDocNo(tx, this.ctx.tenantId, 'DN');

      const [dn] = await tx
        .insert(deliveryNotes)
        .values({
          tenantId: this.ctx.tenantId,
          dnNo,
          warehouseId: input.warehouseId,
          customerId: input.customerId ?? null,
          dispatchDate: input.dispatchDate,
          vehicleNo: input.vehicleNo ?? null,
          lrNo: input.lrNo ?? null,
          eWayBillNo: input.eWayBillNo ?? null,
          notes: input.notes ?? null,
          createdBy: this.ctx.userId ?? null,
        })
        .returning();

      await tx.insert(deliveryNoteLines).values(
        resolved.map((l) => ({
          tenantId: this.ctx.tenantId,
          dnId: dn!.id,
          itemId: l.itemId,
          batchNo: l.batchNo ?? null,
          qty: String(l.qty),
          uom: l.uom ?? null,
        })),
      );
      return dn!;
    });
  }

  async update(id: string, input: UpdateDeliveryNoteInput) {
    return this.ctx.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(deliveryNotes)
        .where(and(eq(deliveryNotes.id, id), eq(deliveryNotes.tenantId, this.ctx.tenantId)))
        .limit(1);
      if (!existing) throw new NotFoundError('Delivery note');
      if (existing.status !== 'draft') {
        throw new ConflictError('Only draft delivery notes can be edited');
      }

      let resolved: DnLineInput[] | null = null;
      if (input.lines) {
        resolved = await this.resolveLines(tx, input.warehouseId ?? existing.warehouseId, input.lines);
      }

      const [dn] = await tx
        .update(deliveryNotes)
        .set({
          warehouseId: input.warehouseId ?? existing.warehouseId,
          customerId: input.customerId === undefined ? existing.customerId : (input.customerId ?? null),
          dispatchDate: input.dispatchDate ?? existing.dispatchDate,
          vehicleNo: input.vehicleNo === undefined ? existing.vehicleNo : (input.vehicleNo ?? null),
          lrNo: input.lrNo === undefined ? existing.lrNo : (input.lrNo ?? null),
          eWayBillNo: input.eWayBillNo === undefined ? existing.eWayBillNo : (input.eWayBillNo ?? null),
          notes: input.notes === undefined ? existing.notes : (input.notes ?? null),
          updatedAt: new Date(),
        })
        .where(eq(deliveryNotes.id, id))
        .returning();

      if (resolved) {
        await tx.delete(deliveryNoteLines).where(eq(deliveryNoteLines.dnId, id));
        await tx.insert(deliveryNoteLines).values(
          resolved.map((l) => ({
            tenantId: this.ctx.tenantId,
            dnId: id,
            itemId: l.itemId,
            batchNo: l.batchNo ?? null,
            qty: String(l.qty),
            uom: l.uom ?? null,
          })),
        );
      }
      return dn!;
    });
  }

  async dispatch(id: string) {
    return this.ctx.db.transaction(async (tx) => {
      const [dn] = await tx
        .select()
        .from(deliveryNotes)
        .where(and(eq(deliveryNotes.id, id), eq(deliveryNotes.tenantId, this.ctx.tenantId)))
        .limit(1);
      if (!dn) throw new NotFoundError('Delivery note');
      if (dn.status !== 'draft') throw new ConflictError(`Delivery note is ${dn.status}`);
      // Returns are posted whole by SalesReturnService — they never sit in
      // draft, so an inbound doc reaching here means something is wrong.
      if (dn.direction !== 'out') throw new ConflictError('Sales returns are not dispatched');

      const lines = await tx
        .select()
        .from(deliveryNoteLines)
        .where(eq(deliveryNoteLines.dnId, id));
      if (lines.length === 0) throw new AppError(400, 'Delivery note has no lines');

      const ledger = new StockLedgerService(this.ctx.tenantId);
      const dispatchDate = new Date(dn.dispatchDate);
      let cogsTotal = 0;
      const lineCosts: Array<{ id: string; unitCost: number; lineTotal: number }> = [];
      for (const line of lines) {
        const qty = Number(line.qty);
        const result = await ledger.recordMovement(tx, {
          itemId: line.itemId,
          warehouseId: dn.warehouseId,
          batchNo: line.batchNo ?? null,
          movementType: 'delivery',
          sourceType: 'delivery_note',
          sourceId: dn.id,
          sourceLineId: line.id,
          qtyDelta: -qty,
          movedAt: dispatchDate,
          postedBy: this.ctx.userId ?? null,
        });
        const lineTotal = qty * result.unitCostUsed;
        cogsTotal += lineTotal;
        lineCosts.push({ id: line.id, unitCost: result.unitCostUsed, lineTotal });
      }

      // Snapshot per-line COGS back onto the line for audit trail.
      for (const lc of lineCosts) {
        await tx
          .update(deliveryNoteLines)
          .set({ unitCost: String(lc.unitCost), lineTotal: String(lc.lineTotal) })
          .where(eq(deliveryNoteLines.id, lc.id));
      }

      const poster = new InventoryGlPoster(tx, this.ctx.tenantId, this.ctx.userId);
      const jeId = await poster.postDelivery({
        date: dn.dispatchDate,
        dnId: dn.id,
        dnNo: dn.dnNo,
        cogsValue: cogsTotal,
      });

      const [updated] = await tx
        .update(deliveryNotes)
        .set({
          status: 'dispatched',
          dispatchedAt: new Date(),
          journalEntryId: jeId,
          totalValue: String(cogsTotal),
          updatedAt: new Date(),
        })
        .where(eq(deliveryNotes.id, id))
        .returning();

      await tx.execute(sql`
        UPDATE stock_ledger SET journal_entry_id = ${jeId}
        WHERE tenant_id = ${this.ctx.tenantId}
          AND source_type = 'delivery_note' AND source_id = ${dn.id}
      `);

      return updated!;
    });
  }

  async cancel(id: string, input: CancelDeliveryNoteInput) {
    return this.ctx.db.transaction(async (tx) => {
      const [dn] = await tx
        .select()
        .from(deliveryNotes)
        .where(and(eq(deliveryNotes.id, id), eq(deliveryNotes.tenantId, this.ctx.tenantId)))
        .limit(1);
      if (!dn) throw new NotFoundError('Delivery note');
      if (dn.status === 'cancelled') throw new ConflictError('Already cancelled');

      if (dn.status === 'draft') {
        const [u] = await tx
          .update(deliveryNotes)
          .set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
          .where(eq(deliveryNotes.id, id))
          .returning();
        return u!;
      }

      const lines = await tx
        .select()
        .from(deliveryNoteLines)
        .where(eq(deliveryNoteLines.dnId, id));
      const ledger = new StockLedgerService(this.ctx.tenantId);
      const now = new Date();
      // Unwinding a dispatch puts stock back; unwinding a return takes it
      // out again. Same code path, opposite sign.
      const sign = dn.direction === 'in' ? -1 : 1;
      const sourceType = dn.direction === 'in' ? 'sales_return' : 'delivery_note';
      let cogsTotal = 0;
      for (const line of lines) {
        const qty = Number(line.qty);
        const unitCost = Number(line.unitCost);
        await ledger.recordMovement(tx, {
          itemId: line.itemId,
          warehouseId: dn.warehouseId,
          batchNo: line.batchNo ?? null,
          movementType: 'reversal',
          sourceType,
          sourceId: dn.id,
          sourceLineId: line.id,
          qtyDelta: sign * qty,
          unitCost,
          movedAt: now,
          postedBy: this.ctx.userId ?? null,
        });
        cogsTotal += qty * unitCost;
      }

      const poster = new InventoryGlPoster(tx, this.ctx.tenantId, this.ctx.userId);
      // A cancelled return needs the dispatch JE shape (COGS Dr), and vice
      // versa — reverseDelivery/postDelivery are exactly that pair.
      const jeId = dn.direction === 'in'
        ? await poster.postDelivery({
          date: now.toISOString().slice(0, 10),
          dnId: dn.id,
          dnNo: dn.dnNo,
          cogsValue: cogsTotal,
        })
        : await poster.reverseDelivery({
          date: now.toISOString().slice(0, 10),
          dnId: dn.id,
          dnNo: dn.dnNo,
          cogsValue: cogsTotal,
          reason: input.reason,
        });

      const [u] = await tx
        .update(deliveryNotes)
        .set({
          status: 'cancelled',
          cancelledAt: now,
          cancelledJournalEntryId: jeId,
          notes: dn.notes ? `${dn.notes}\n[Cancelled] ${input.reason}` : `[Cancelled] ${input.reason}`,
          updatedAt: now,
        })
        .where(eq(deliveryNotes.id, id))
        .returning();
      return u!;
    });
  }

  /**
   * Auto-pick a batch for any line that omitted batchNo, using FEFO
   * (first-expiry-first-out). For non-batch items the line stays as-is.
   * Returns the resolved line array — never throws if a batch can't be
   * found; downstream `recordMovement` will surface "insufficient stock".
   */
  private async resolveLines(tx: Tx, warehouseId: string, lines: DnLineInput[]) {
    const resolved: DnLineInput[] = [];
    for (const line of lines) {
      // Look up item config to know if batch tracking is on, and default the
      // line's UOM to the item's canonical unit when the caller didn't send one.
      const [cfg] = await tx
        .select({ trackBatches: items.trackBatches, unit: items.unit })
        .from(items)
        .where(and(eq(items.tenantId, this.ctx.tenantId), eq(items.id, line.itemId)))
        .limit(1);
      if (!cfg) throw new AppError(400, `Item ${line.itemId} not found`);
      const withUom: DnLineInput = { ...line, uom: line.uom ?? cfg.unit ?? null };
      if (!cfg.trackBatches || withUom.batchNo) {
        resolved.push(withUom);
        continue;
      }
      // FEFO suggestion: pick the batch with the earliest expiry that has
      // enough on-hand. We DON'T currently split across batches in v1 — if
      // no single batch can cover the qty, we just pick the earliest and
      // let recordMovement throw "insufficient stock".
      const suggestion = await tx.execute(sql`
        WITH batch_expiry AS (
          SELECT batch_no, MIN(expiry_date) AS expiry_date
          FROM inventory_grn_lines
          WHERE tenant_id = ${this.ctx.tenantId} AND item_id = ${line.itemId}
            AND batch_no IS NOT NULL
          GROUP BY batch_no
        )
        SELECT soh.batch_no
        FROM stock_on_hand soh
        LEFT JOIN batch_expiry be ON be.batch_no = soh.batch_no
        WHERE soh.tenant_id = ${this.ctx.tenantId}
          AND soh.item_id = ${line.itemId}
          AND soh.warehouse_id = ${warehouseId}
          AND soh.qty >= ${line.qty}
        ORDER BY be.expiry_date ASC NULLS LAST, soh.last_movement_at ASC
        LIMIT 1
      `);
      const row = (suggestion as unknown as { rows: Array<{ batch_no: string }> }).rows[0];
      resolved.push({ ...withUom, batchNo: row?.batch_no ?? withUom.batchNo ?? '' });
    }
    return resolved;
  }
}
