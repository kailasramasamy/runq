/**
 * Invoice-driven lane into the delivery note.
 *
 * Finished goods leave stock through exactly one document — the DN. This
 * service doesn't move stock itself; it turns an AR invoice into a draft DN
 * (FEFO batches pre-picked, qty = still-undispatched remainder) which the
 * existing `DeliveryNoteService.dispatch()` then posts unchanged. One
 * chokepoint for the ledger, two ways in.
 *
 * Invoice lines resolve to a stock item in this order:
 *   1. sales_invoice_items.item_id — line was picked from the catalogue
 *   2. invoice_import_item_aliases — a description mapped once before
 *   3. unmapped — reported to the UI, never silently dropped
 */

import { and, asc, eq, sql, ilike, gte, lte, count, inArray } from 'drizzle-orm';
import type { Db } from '@runq/db';
import {
  deliveryNotes, deliveryNoteLines, items, customers, salesInvoices,
  salesInvoiceItems, invoiceImportItemAliases,
} from '@runq/db';
import type { DispatchFromInvoiceInput, PendingDispatchFilter } from '@runq/validators';
import { AppError, ConflictError, NotFoundError } from '../../utils/errors';
import { nextDocNo } from './sequence';
import {
  RESOLVED_ITEM_JOIN, dispatchedQtyFor, committedQtyFor,
  hasUndispatchedLines, stockableLineCount, repackCapacityJoin,
} from './sales-dispatch.sql';
import {
  dispatchStatus, isStockable, overCommitMessage, remainingQty, resolveLine,
} from './sales-dispatch.logic';
import type { LineResolution } from './sales-dispatch.logic';

interface Ctx { db: Db; tenantId: string; userId?: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

/** Invoices in these states carry no goods obligation. */
const NON_DISPATCHABLE = ['draft', 'cancelled'];

export interface PreviewLine {
  invoiceLineId: string;
  description: string;
  invoicedQty: number;
  dispatchedQty: number;
  remainingQty: number;
  itemId: string | null;
  itemName: string | null;
  itemSku: string | null;
  uom: string | null;
  trackBatches: boolean;
  /** How the item was resolved — drives the "map this line" prompt. */
  resolution: LineResolution;
  suggestedBatchNo: string | null;
  availableQty: number;
  /**
   * Set when the SKU is only branded at dispatch: it holds no standing stock,
   * so `availableQty` reads 0 and the pool behind it is what can actually be
   * shipped. Null for ordinary items.
   */
  repackFrom: { poolItemName: string; capacityQty: number } | null;
}

export class SalesDispatchService {
  constructor(private readonly ctx: Ctx) {}

  /**
   * The "Awaiting dispatch" queue: issued invoices with at least one
   * stockable line whose dispatched qty is short of the invoiced qty.
   */
  async listPendingInvoices(filter: PendingDispatchFilter) {
    const conds = [
      eq(salesInvoices.tenantId, this.ctx.tenantId),
      sql`${salesInvoices.status} NOT IN ('draft', 'cancelled')`,
      hasUndispatchedLines(sql`${salesInvoices.id}`),
    ];
    if (filter.customerId) conds.push(eq(salesInvoices.customerId, filter.customerId));
    if (filter.from) conds.push(gte(salesInvoices.invoiceDate, filter.from));
    if (filter.to) conds.push(lte(salesInvoices.invoiceDate, filter.to));
    if (filter.q) conds.push(ilike(salesInvoices.invoiceNumber, `%${filter.q}%`));

    const where = and(...conds)!;
    const [rows, [{ total }]] = await Promise.all([
      this.pendingRows(where, filter),
      this.ctx.db.select({ total: count() }).from(salesInvoices).where(where),
    ]);

    return {
      data: rows.map((r) => ({
        ...r,
        lineCount: Number(r.lineCount ?? 0),
        stockableCount: Number(r.stockableCount ?? 0),
        dispatchedCount: Number(r.dispatchedCount ?? 0),
      })),
      page: filter.page,
      limit: filter.limit,
      total,
      totalPages: Math.ceil(total / filter.limit),
    };
  }

  private pendingRows(where: NonNullable<ReturnType<typeof and>>, filter: PendingDispatchFilter) {
    return this.ctx.db
      .select({
        id: salesInvoices.id,
        invoiceNumber: salesInvoices.invoiceNumber,
        invoiceDate: salesInvoices.invoiceDate,
        customerId: salesInvoices.customerId,
        customerName: customers.name,
        totalAmount: salesInvoices.totalAmount,
        lineCount: sql<number>`(
          SELECT COUNT(*)::int FROM ${salesInvoiceItems}
          WHERE ${salesInvoiceItems.invoiceId} = ${salesInvoices.id}
        )`.as('line_count'),
        stockableCount: stockableLineCount(sql`${salesInvoices.id}`).as('stockable_count'),
        dispatchedCount: sql<number>`(
          SELECT COUNT(DISTINCT l.invoice_line_id)::int
          FROM delivery_note_lines l
          JOIN delivery_notes d ON d.id = l.dn_id
          JOIN sales_invoice_items sii ON sii.id = l.invoice_line_id
          WHERE sii.invoice_id = ${salesInvoices.id} AND d.status = 'dispatched'
        )`.as('dispatched_count'),
        openDraftDnId: sql<string | null>`(
          SELECT d.id FROM delivery_notes d
          WHERE d.invoice_id = ${salesInvoices.id} AND d.status = 'draft'
          ORDER BY d.created_at DESC LIMIT 1
        )`.as('open_draft_dn_id'),
      })
      .from(salesInvoices)
      .innerJoin(customers, eq(customers.id, salesInvoices.customerId))
      .where(where)
      .orderBy(asc(salesInvoices.invoiceDate))
      .limit(filter.limit)
      .offset((filter.page - 1) * filter.limit);
  }

  /**
   * Line-by-line preview for the confirm screen: what's left to send, which
   * batch FEFO suggests, and what's on hand to send it from.
   */
  async previewInvoice(invoiceId: string, warehouseId: string) {
    const inv = await this.loadDispatchableInvoice(invoiceId);
    const raw = await this.previewRows(invoiceId, warehouseId);
    const lines: PreviewLine[] = [];
    for (const r of raw) lines.push(await this.toPreviewLine(r, warehouseId));
    return { invoice: inv, lines };
  }

  private async loadDispatchableInvoice(invoiceId: string) {
    const [inv] = await this.ctx.db
      .select({
        id: salesInvoices.id,
        invoiceNumber: salesInvoices.invoiceNumber,
        invoiceDate: salesInvoices.invoiceDate,
        status: salesInvoices.status,
        customerId: salesInvoices.customerId,
        customerName: customers.name,
      })
      .from(salesInvoices)
      .innerJoin(customers, eq(customers.id, salesInvoices.customerId))
      .where(and(eq(salesInvoices.id, invoiceId), eq(salesInvoices.tenantId, this.ctx.tenantId)))
      .limit(1);
    if (!inv) throw new NotFoundError('Invoice');
    if (NON_DISPATCHABLE.includes(inv.status)) {
      throw new ConflictError(`Invoice is ${inv.status} — nothing to dispatch`);
    }
    return inv;
  }

  private async previewRows(invoiceId: string, warehouseId: string): Promise<Row[]> {
    const result = await this.ctx.db.execute(sql`
      SELECT
        sii.id             AS invoice_line_id,
        sii.description    AS description,
        sii.quantity::text AS invoiced_qty,
        sii.uom            AS invoice_uom,
        sii.item_id        AS direct_item_id,
        i.id               AS item_id,
        i.name             AS item_name,
        i.sku              AS item_sku,
        i.unit             AS item_unit,
        i.track_batches    AS track_batches,
        i.track_inventory  AS track_inventory,
        ${dispatchedQtyFor(sql`sii.id`)}::text AS dispatched_qty,
        COALESCE((
          SELECT SUM(soh.qty) FROM stock_on_hand soh
          WHERE soh.tenant_id = sii.tenant_id
            AND soh.item_id = i.id
            AND soh.warehouse_id = ${warehouseId}
        ), 0)::text        AS available_qty,
        rp.pool_item_name  AS pool_item_name,
        rp.capacity_qty::text AS repack_capacity_qty
      FROM sales_invoice_items sii
      ${RESOLVED_ITEM_JOIN}
      LEFT JOIN items i ON i.id = COALESCE(sii.item_id, a.item_id)
      ${repackCapacityJoin(warehouseId)}
      WHERE sii.invoice_id = ${invoiceId} AND sii.tenant_id = ${this.ctx.tenantId}
      ORDER BY sii.created_at ASC
    `);
    return (result as unknown as { rows: Row[] }).rows;
  }

  private async toPreviewLine(r: Row, warehouseId: string): Promise<PreviewLine> {
    const invoicedQty = Number(r.invoiced_qty);
    const remaining = remainingQty(invoicedQty, Number(r.dispatched_qty));
    const resolution = resolveLine({
      itemId: r.item_id ?? null,
      directItemId: r.direct_item_id ?? null,
      trackInventory: Boolean(r.track_inventory),
    });
    const needsBatch = isStockable(resolution) && r.track_batches && remaining > 0;
    return {
      invoiceLineId: r.invoice_line_id,
      description: r.description,
      invoicedQty,
      dispatchedQty: Number(r.dispatched_qty),
      remainingQty: remaining,
      itemId: r.item_id ?? null,
      itemName: r.item_name ?? null,
      itemSku: r.item_sku ?? null,
      uom: r.invoice_uom ?? r.item_unit ?? null,
      trackBatches: Boolean(r.track_batches),
      resolution,
      suggestedBatchNo: needsBatch
        ? await this.suggestBatch(r.item_id, warehouseId, remaining)
        : null,
      availableQty: Number(r.available_qty ?? 0),
      repackFrom: r.pool_item_name
        ? {
          poolItemName: r.pool_item_name as string,
          // Floored: a fraction of a pack can't be labelled and shipped.
          capacityQty: Math.floor(Number(r.repack_capacity_qty ?? 0)),
        }
        : null,
    };
  }

  /**
   * Create the draft DN for an invoice. Stock does not move here — the caller
   * follows with the normal dispatch call, so a shortage leaves an editable
   * draft rather than a half-posted ledger.
   */
  async createFromInvoice(invoiceId: string, input: DispatchFromInvoiceInput) {
    return this.ctx.db.transaction(async (tx: Tx) => {
      const [inv] = await tx
        .select({
          id: salesInvoices.id,
          status: salesInvoices.status,
          customerId: salesInvoices.customerId,
          invoiceNumber: salesInvoices.invoiceNumber,
        })
        .from(salesInvoices)
        .where(and(eq(salesInvoices.id, invoiceId), eq(salesInvoices.tenantId, this.ctx.tenantId)))
        .limit(1);
      if (!inv) throw new NotFoundError('Invoice');
      if (NON_DISPATCHABLE.includes(inv.status)) {
        throw new ConflictError(`Invoice is ${inv.status} — nothing to dispatch`);
      }
      await this.assertWithinRemaining(tx, invoiceId, input.lines);

      const dnNo = await nextDocNo(tx, this.ctx.tenantId, 'DN');
      const [dn] = await tx
        .insert(deliveryNotes)
        .values({
          tenantId: this.ctx.tenantId,
          dnNo,
          warehouseId: input.warehouseId,
          customerId: inv.customerId,
          invoiceId: inv.id,
          dispatchDate: input.dispatchDate,
          vehicleNo: input.vehicleNo ?? null,
          lrNo: input.lrNo ?? null,
          notes: input.notes ?? `Against invoice ${inv.invoiceNumber}`,
          createdBy: this.ctx.userId ?? null,
        })
        .returning();

      await tx.insert(deliveryNoteLines).values(
        input.lines.map((l) => ({
          tenantId: this.ctx.tenantId,
          dnId: dn!.id,
          itemId: l.itemId,
          invoiceLineId: l.invoiceLineId,
          batchNo: l.batchNo ?? null,
          qty: String(l.qty),
          uom: l.uom ?? null,
        })),
      );
      return dn!;
    });
  }

  /**
   * Per-line dispatch progress for the AR invoice detail strip.
   * `status` is derived, never stored — the DN lines are the source of truth.
   */
  async invoiceDispatchStatus(invoiceId: string) {
    const result = await this.ctx.db.execute(sql`
      SELECT
        sii.id             AS invoice_line_id,
        sii.description    AS description,
        sii.quantity::text AS invoiced_qty,
        ${dispatchedQtyFor(sql`sii.id`)}::text AS dispatched_qty,
        (COALESCE(sii.item_id, a.item_id) IS NOT NULL AND EXISTS (
          SELECT 1 FROM items i
          WHERE i.id = COALESCE(sii.item_id, a.item_id) AND i.track_inventory = true
        )) AS stockable
      FROM sales_invoice_items sii
      ${RESOLVED_ITEM_JOIN}
      WHERE sii.invoice_id = ${invoiceId} AND sii.tenant_id = ${this.ctx.tenantId}
      ORDER BY sii.created_at ASC
    `);
    const rows = (result as unknown as { rows: Row[] }).rows;
    const dns = await this.dnsForInvoice(invoiceId);
    return { ...this.summariseStatus(rows), deliveryNotes: dns };
  }

  private summariseStatus(rows: Row[]) {
    const lines = rows.map((r) => ({
      invoiceLineId: r.invoice_line_id as string,
      description: r.description as string,
      invoicedQty: Number(r.invoiced_qty),
      dispatchedQty: Number(r.dispatched_qty),
      stockable: Boolean(r.stockable),
    }));
    const stockable = lines.filter((l) => l.stockable);
    return {
      status: dispatchStatus(lines),
      stockableLines: stockable.length,
      dispatchedLines: stockable.filter((l) => l.dispatchedQty >= l.invoicedQty).length,
      lines,
    };
  }

  private dnsForInvoice(invoiceId: string) {
    return this.ctx.db
      .select({
        id: deliveryNotes.id,
        dnNo: deliveryNotes.dnNo,
        status: deliveryNotes.status,
        direction: deliveryNotes.direction,
        dispatchDate: deliveryNotes.dispatchDate,
      })
      .from(deliveryNotes)
      .where(and(
        eq(deliveryNotes.tenantId, this.ctx.tenantId),
        eq(deliveryNotes.invoiceId, invoiceId),
      ))
      .orderBy(asc(deliveryNotes.createdAt));
  }

  /**
   * Remember a description → item mapping so the next invoice carrying the
   * same wording resolves on its own. Shares the table the import matcher
   * already feeds, so a mapping learnt here helps imports too.
   */
  async saveItemAlias(sourceName: string, itemId: string) {
    const [item] = await this.ctx.db
      .select({ id: items.id })
      .from(items)
      .where(and(eq(items.id, itemId), eq(items.tenantId, this.ctx.tenantId)))
      .limit(1);
    if (!item) throw new NotFoundError('Item');

    const [existing] = await this.ctx.db
      .select({ id: invoiceImportItemAliases.id })
      .from(invoiceImportItemAliases)
      .where(and(
        eq(invoiceImportItemAliases.tenantId, this.ctx.tenantId),
        sql`lower(${invoiceImportItemAliases.sourceName}) = lower(${sourceName})`,
      ))
      .limit(1);

    if (existing) {
      const [updated] = await this.ctx.db
        .update(invoiceImportItemAliases)
        .set({ itemId, updatedAt: new Date() })
        .where(eq(invoiceImportItemAliases.id, existing.id))
        .returning();
      return updated!;
    }
    const [created] = await this.ctx.db
      .insert(invoiceImportItemAliases)
      .values({ tenantId: this.ctx.tenantId, sourceName, itemId })
      .returning();
    return created!;
  }

  /**
   * Reject a DN that would push committed qty past what was invoiced.
   * Without this, re-confirming a queue row silently ships twice.
   */
  private async assertWithinRemaining(
    tx: Tx,
    invoiceId: string,
    lines: Array<{ invoiceLineId: string; qty: number }>,
  ) {
    const rows: Row[] = await tx
      .select({
        id: salesInvoiceItems.id,
        description: salesInvoiceItems.description,
        invoiceId: salesInvoiceItems.invoiceId,
        quantity: salesInvoiceItems.quantity,
        committed: committedQtyFor(sql`${salesInvoiceItems.id}`).as('committed'),
      })
      .from(salesInvoiceItems)
      .where(and(
        eq(salesInvoiceItems.tenantId, this.ctx.tenantId),
        inArray(salesInvoiceItems.id, lines.map((l) => l.invoiceLineId)),
      ));

    const byId = new Map<string, Row>(rows.map((r) => [r.id, r]));
    for (const line of lines) {
      const row = byId.get(line.invoiceLineId);
      if (!row) throw new AppError(400, 'Invoice line not found');
      if (row.invoiceId !== invoiceId) {
        throw new AppError(400, 'Invoice line belongs to a different invoice');
      }
      const message = overCommitMessage({
        description: row.description,
        requestedQty: line.qty,
        allowedQty: Number(row.quantity),
        committedQty: Number(row.committed),
      }, 'dispatch');
      if (message) throw new ConflictError(message);
    }
  }

  /**
   * FEFO batch suggestion — earliest expiry that can cover the qty on its
   * own. Mirrors DeliveryNoteService.resolveLines; v1 doesn't split a line
   * across batches, so a short batch just isn't suggested.
   */
  private async suggestBatch(itemId: string, warehouseId: string, qty: number) {
    const result = await this.ctx.db.execute(sql`
      WITH batch_expiry AS (
        SELECT batch_no, MIN(expiry_date) AS expiry_date
        FROM inventory_grn_lines
        WHERE tenant_id = ${this.ctx.tenantId} AND item_id = ${itemId}
          AND batch_no IS NOT NULL
        GROUP BY batch_no
      )
      SELECT soh.batch_no
      FROM stock_on_hand soh
      LEFT JOIN batch_expiry be ON be.batch_no = soh.batch_no
      WHERE soh.tenant_id = ${this.ctx.tenantId}
        AND soh.item_id = ${itemId}
        AND soh.warehouse_id = ${warehouseId}
        AND soh.qty >= ${qty}
      ORDER BY be.expiry_date ASC NULLS LAST, soh.last_movement_at ASC
      LIMIT 1
    `);
    const row = (result as unknown as { rows: Array<{ batch_no: string }> }).rows[0];
    return row?.batch_no ?? null;
  }
}
