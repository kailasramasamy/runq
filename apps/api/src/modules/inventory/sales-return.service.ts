/**
 * Sales returns — goods coming back from a customer.
 *
 * A return is the inverse of a dispatch, so it reuses the delivery note as
 * its document (direction='in', returnOfDnId set) rather than a parallel
 * table. Two consequences worth knowing:
 *
 *   • The inbound unit cost is read off the original dispatch line, never
 *     re-derived from the current moving average. Returning goods must undo
 *     exactly the value that left, or valuation drifts every time a customer
 *     sends something back after the average has moved.
 *   • Returns net off the invoice's dispatched qty (see sales-dispatch.sql),
 *     so a returned line becomes dispatchable again.
 *
 * The credit note (money) stays in AR. `creditNoteId` is the join, optional
 * because goods often come back before anyone raises the credit.
 */

import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '@runq/db';
import { deliveryNotes, deliveryNoteLines, items } from '@runq/db';
import type { SalesReturnInput } from '@runq/validators';
import { AppError, ConflictError, NotFoundError } from '../../utils/errors';
import { StockLedgerService } from './stock-ledger.service';
import { overCommitMessage } from './sales-dispatch.logic';
import { InventoryGlPoster } from './gl-poster';
import { nextDocNo } from './sequence';

interface Ctx { db: Db; tenantId: string; userId?: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = any;

interface SourceLine {
  id: string;
  itemId: string;
  itemName: string;
  batchNo: string | null;
  qty: string;
  uom: string | null;
  unitCost: string;
  invoiceLineId: string | null;
}

export class SalesReturnService {
  constructor(private readonly ctx: Ctx) {}

  /**
   * Post a return against a dispatched DN. Stock moves and the GL posts in
   * the same transaction — unlike a dispatch there's no draft step, because
   * the quantities and costs are all read off a document that already exists.
   */
  async create(dnId: string, input: SalesReturnInput) {
    return this.ctx.db.transaction(async (tx: Tx) => {
      const source = await this.loadDispatchedDn(tx, dnId);
      const sourceLines = await this.loadSourceLines(tx, dnId);
      const picked = await this.resolveReturnLines(tx, dnId, sourceLines, input.lines);

      const returnNo = await nextDocNo(tx, this.ctx.tenantId, 'DN');
      const [ret] = await tx
        .insert(deliveryNotes)
        .values({
          tenantId: this.ctx.tenantId,
          dnNo: returnNo,
          direction: 'in',
          returnOfDnId: source.id,
          warehouseId: source.warehouseId,
          customerId: source.customerId,
          invoiceId: source.invoiceId,
          creditNoteId: input.creditNoteId ?? null,
          dispatchDate: input.returnDate,
          notes: `Return of ${source.dnNo} — ${input.reason}`,
          createdBy: this.ctx.userId ?? null,
        })
        .returning();

      const inserted = await tx
        .insert(deliveryNoteLines)
        .values(picked.map((p) => ({
          tenantId: this.ctx.tenantId,
          dnId: ret!.id,
          itemId: p.itemId,
          invoiceLineId: p.invoiceLineId,
          batchNo: p.batchNo,
          qty: String(p.qty),
          uom: p.uom,
          unitCost: String(p.unitCost),
          lineTotal: String(p.qty * p.unitCost),
        })))
        .returning();

      const total = await this.postMovements(tx, ret!, inserted, input.returnDate);
      return await this.finalise(tx, ret!.id, input.returnDate, returnNo, total);
    });
  }

  private async loadDispatchedDn(tx: Tx, dnId: string) {
    const [dn] = await tx
      .select()
      .from(deliveryNotes)
      .where(and(eq(deliveryNotes.id, dnId), eq(deliveryNotes.tenantId, this.ctx.tenantId)))
      .limit(1);
    if (!dn) throw new NotFoundError('Delivery note');
    if (dn.direction !== 'out') throw new ConflictError('Can only return against a dispatch');
    if (dn.status !== 'dispatched') {
      throw new ConflictError(`Delivery note is ${dn.status} — nothing to return`);
    }
    return dn;
  }

  private loadSourceLines(tx: Tx, dnId: string): Promise<SourceLine[]> {
    return tx
      .select({
        id: deliveryNoteLines.id,
        itemId: deliveryNoteLines.itemId,
        itemName: items.name,
        batchNo: deliveryNoteLines.batchNo,
        qty: deliveryNoteLines.qty,
        uom: deliveryNoteLines.uom,
        unitCost: deliveryNoteLines.unitCost,
        invoiceLineId: deliveryNoteLines.invoiceLineId,
      })
      .from(deliveryNoteLines)
      .innerJoin(items, eq(items.id, deliveryNoteLines.itemId))
      .where(eq(deliveryNoteLines.dnId, dnId));
  }

  /**
   * Match requested lines to the dispatch, capping each at what hasn't
   * already come back. Over-returning would credit stock that never left.
   */
  private async resolveReturnLines(
    tx: Tx,
    dnId: string,
    sourceLines: SourceLine[],
    requested: SalesReturnInput['lines'],
  ) {
    const alreadyReturned = await this.returnedQtyByLine(tx, dnId);
    const byId = new Map(sourceLines.map((l) => [l.id, l]));
    return requested.map((req) => {
      const src = byId.get(req.dnLineId);
      if (!src) throw new AppError(400, 'Line does not belong to this delivery note');
      const message = overCommitMessage({
        description: src.itemName,
        requestedQty: req.qty,
        allowedQty: Number(src.qty),
        committedQty: alreadyReturned.get(src.id) ?? 0,
      }, 'return');
      if (message) throw new ConflictError(message);
      return {
        itemId: src.itemId,
        invoiceLineId: src.invoiceLineId,
        batchNo: src.batchNo,
        uom: src.uom,
        qty: req.qty,
        // The cost that left with the dispatch, not today's average.
        unitCost: Number(src.unitCost),
      };
    });
  }

  private async returnedQtyByLine(tx: Tx, dnId: string): Promise<Map<string, number>> {
    const result = await tx.execute(sql`
      SELECT rl.item_id, rl.batch_no, SUM(rl.qty)::text AS qty, sl.id AS source_line_id
      FROM delivery_note_lines rl
      JOIN delivery_notes r ON r.id = rl.dn_id
      JOIN delivery_note_lines sl
        ON sl.dn_id = r.return_of_dn_id
       AND sl.item_id = rl.item_id
       AND COALESCE(sl.batch_no, '') = COALESCE(rl.batch_no, '')
      WHERE r.return_of_dn_id = ${dnId}
        AND r.tenant_id = ${this.ctx.tenantId}
        AND r.status <> 'cancelled'
      GROUP BY rl.item_id, rl.batch_no, sl.id
    `);
    const rows = (result as unknown as { rows: Array<{ source_line_id: string; qty: string }> }).rows;
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.source_line_id, Number(r.qty));
    return map;
  }

  /** Put the goods back on hand at the dispatch cost. Returns total value. */
  private async postMovements(
    tx: Tx,
    ret: { id: string; warehouseId: string },
    lines: Array<{ id: string; itemId: string; batchNo: string | null; qty: string; unitCost: string }>,
    returnDate: string,
  ) {
    const ledger = new StockLedgerService(this.ctx.tenantId);
    const movedAt = new Date(returnDate);
    let total = 0;
    for (const line of lines) {
      const qty = Number(line.qty);
      const unitCost = Number(line.unitCost);
      await ledger.recordMovement(tx, {
        itemId: line.itemId,
        warehouseId: ret.warehouseId,
        batchNo: line.batchNo,
        movementType: 'sales_return_in',
        sourceType: 'sales_return',
        sourceId: ret.id,
        sourceLineId: line.id,
        qtyDelta: qty,
        unitCost,
        movedAt,
        postedBy: this.ctx.userId ?? null,
      });
      total += qty * unitCost;
    }
    return total;
  }

  private async finalise(tx: Tx, retId: string, date: string, dnNo: string, total: number) {
    const poster = new InventoryGlPoster(tx, this.ctx.tenantId, this.ctx.userId);
    const jeId = await poster.postSalesReturn({ date, dnId: retId, dnNo, cogsValue: total });

    const [updated] = await tx
      .update(deliveryNotes)
      .set({
        status: 'dispatched',
        dispatchedAt: new Date(),
        journalEntryId: jeId,
        totalValue: String(total),
        updatedAt: new Date(),
      })
      .where(eq(deliveryNotes.id, retId))
      .returning();

    await tx.execute(sql`
      UPDATE stock_ledger SET journal_entry_id = ${jeId}
      WHERE tenant_id = ${this.ctx.tenantId}
        AND source_type = 'sales_return' AND source_id = ${retId}
    `);
    return updated!;
  }

  /** Lines of a dispatch with how much of each is still returnable. */
  async returnableLines(dnId: string) {
    const [dn] = await this.ctx.db
      .select({ id: deliveryNotes.id, status: deliveryNotes.status, direction: deliveryNotes.direction })
      .from(deliveryNotes)
      .where(and(eq(deliveryNotes.id, dnId), eq(deliveryNotes.tenantId, this.ctx.tenantId)))
      .limit(1);
    if (!dn) throw new NotFoundError('Delivery note');
    if (dn.direction !== 'out' || dn.status !== 'dispatched') {
      throw new ConflictError('Only a dispatched delivery note can be returned against');
    }

    const lines = await this.ctx.db
      .select({
        id: deliveryNoteLines.id,
        itemId: deliveryNoteLines.itemId,
        itemName: items.name,
        itemSku: items.sku,
        batchNo: deliveryNoteLines.batchNo,
        qty: deliveryNoteLines.qty,
        uom: deliveryNoteLines.uom,
        unitCost: deliveryNoteLines.unitCost,
      })
      .from(deliveryNoteLines)
      .innerJoin(items, eq(items.id, deliveryNoteLines.itemId))
      .where(eq(deliveryNoteLines.dnId, dnId));

    const returned = await this.returnedQtyByLine(this.ctx.db, dnId);
    return lines.map((l) => ({
      ...l,
      dispatchedQty: Number(l.qty),
      returnedQty: returned.get(l.id) ?? 0,
      returnableQty: Number(l.qty) - (returned.get(l.id) ?? 0),
    }));
  }
}
