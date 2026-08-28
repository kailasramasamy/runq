/**
 * Billing only what the warehouse could actually deliver.
 *
 * The last resort in the shortage conversation. A substitute covers most
 * short lines, but when none is declared — or the stand-in is out too — the
 * goods simply are not going anywhere, and the invoice is asking to be paid
 * for them. Leaving that outstanding is what fills the dispatch queue with
 * work nobody can do.
 *
 * So the honest close is to bill what shipped: cut each line to the quantity
 * that actually left, and the invoice and the delivery describe the same
 * event again. Nothing is owed afterwards, which is why the queue stays empty
 * by construction rather than by hiding anything.
 *
 * This lowers what the customer owes, so it is never automatic — the operator
 * chooses it, in the invoice flow, with the numbers in front of them.
 *
 * The arithmetic is deliberately not done here. `InvoiceService.update()`
 * already recomputes GST from the authoritative per-line tax data, replaces
 * the line items, and tears down and re-posts the revenue JE for an invoice
 * that has already been sent. Re-implementing any of that would be a second
 * source of truth for tax, and the two would drift.
 */

import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '@runq/db';
import { deliveryNoteLines, deliveryNotes, salesInvoiceItems, salesInvoices } from '@runq/db';
import { ConflictError, NotFoundError } from '../../utils/errors';
import { AuditService } from '../../utils/audit';
import { InvoiceService } from './invoice.service';
import { hasIrn, isInFiledReturn } from './invoice-guards';

interface Ctx { db: Db; tenantId: string; userId?: string }

/** What trimming did, so the client can say it plainly. */
export interface TrimResult {
  /**
   * `nothing_deliverable` means no change was made: every line was short in
   * full, so trimming would leave an invoice with no lines. Reported rather
   * than thrown — it is an ordinary outcome with a different next step
   * (cancel the invoice), not an error.
   */
  outcome: 'trimmed' | 'nothing_deliverable';
  invoiceId: string;
  invoiceNumber: string;
  /** Lines cut down, with the quantity that survived. */
  reduced: Array<{ description: string; from: number; to: number }>;
  /** Lines dropped because nothing at all shipped. */
  removed: string[];
  draftsCancelled: number;
}

export class InvoiceTrimService {
  constructor(private readonly ctx: Ctx) {}

  async trimToDelivered(invoiceId: string): Promise<TrimResult> {
    const invoice = await this.loadEditable(invoiceId);
    const owed = await this.owedByInvoiceLine(invoiceId);
    if (owed.size === 0) {
      throw new ConflictError('Nothing is outstanding on this invoice');
    }

    const items = await this.ctx.db
      .select()
      .from(salesInvoiceItems)
      .where(and(
        eq(salesInvoiceItems.invoiceId, invoiceId),
        eq(salesInvoiceItems.tenantId, this.ctx.tenantId),
      ));

    const reduced: TrimResult['reduced'] = [];
    const removed: string[] = [];
    const kept: Array<Record<string, unknown>> = [];

    for (const item of items) {
      const billed = Number(item.quantity);
      const short = owed.get(item.id) ?? 0;
      const delivered = round3(billed - short);

      if (short <= 0) {
        kept.push(toItemInput(item, billed));
        continue;
      }
      if (delivered <= 0) {
        // A zero-quantity line is not a line. Billing nothing for it means
        // it should not be on the document at all.
        removed.push(item.description);
        continue;
      }
      reduced.push({ description: item.description, from: billed, to: delivered });
      kept.push(toItemInput(item, delivered));
    }

    if (kept.length === 0) {
      // Trimming to nothing would leave an invoice with no lines, which is
      // not a document. Cancelling is the right move, but it is the
      // operator's to make — so this reports the situation and changes
      // nothing.
      return {
        outcome: 'nothing_deliverable',
        invoiceId,
        invoiceNumber: invoice.invoiceNumber,
        reduced: [],
        removed,
        draftsCancelled: 0,
      };
    }

    // Rewrites the lines, recomputes GST and re-posts the revenue JE.
    await new InvoiceService(this.ctx.db, this.ctx.tenantId).update(
      invoiceId,
      { items: kept } as never,
    );

    const draftsCancelled = await this.cancelShortfallDrafts(invoiceId);

    await new AuditService(this.ctx.db, this.ctx.tenantId).log({
      userId: this.ctx.userId,
      action: 'invoice_trimmed_to_delivered',
      entityType: 'sales_invoice',
      entityId: invoiceId,
      metadata: { invoiceNumber: invoice.invoiceNumber, reduced, removed, draftsCancelled },
    });

    return {
      outcome: 'trimmed',
      invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      reduced,
      removed,
      draftsCancelled,
    };
  }

  /**
   * Quantities still parked on an open shortfall draft, per invoice line.
   * Only drafts count — a dispatched line is delivered, not owed.
   */
  private async owedByInvoiceLine(invoiceId: string): Promise<Map<string, number>> {
    const rows = await this.ctx.db
      .select({
        invoiceLineId: deliveryNoteLines.invoiceLineId,
        qty: deliveryNoteLines.qty,
      })
      .from(deliveryNoteLines)
      .innerJoin(deliveryNotes, eq(deliveryNotes.id, deliveryNoteLines.dnId))
      .where(and(
        eq(deliveryNotes.tenantId, this.ctx.tenantId),
        eq(deliveryNotes.invoiceId, invoiceId),
        eq(deliveryNotes.status, 'draft'),
      ));

    const out = new Map<string, number>();
    for (const r of rows) {
      if (!r.invoiceLineId) continue;
      out.set(r.invoiceLineId, round3((out.get(r.invoiceLineId) ?? 0) + Number(r.qty)));
    }
    return out;
  }

  /** The drafts held the shortfall; once it isn't billed there is none. */
  private async cancelShortfallDrafts(invoiceId: string): Promise<number> {
    const open = await this.ctx.db
      .select({ id: deliveryNotes.id })
      .from(deliveryNotes)
      .where(and(
        eq(deliveryNotes.tenantId, this.ctx.tenantId),
        eq(deliveryNotes.invoiceId, invoiceId),
        eq(deliveryNotes.status, 'draft'),
      ));
    if (open.length === 0) return 0;
    await this.ctx.db
      .update(deliveryNotes)
      .set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
      .where(inArray(deliveryNotes.id, open.map((d) => d.id)));
    return open.length;
  }

  private async loadEditable(invoiceId: string) {
    const [inv] = await this.ctx.db
      .select({
        id: salesInvoices.id,
        invoiceNumber: salesInvoices.invoiceNumber,
        status: salesInvoices.status,
      })
      .from(salesInvoices)
      .where(and(
        eq(salesInvoices.id, invoiceId),
        eq(salesInvoices.tenantId, this.ctx.tenantId),
      ))
      .limit(1);
    if (!inv) throw new NotFoundError('Invoice');
    if (inv.status === 'cancelled') throw new ConflictError('Invoice is cancelled');
    if (await hasIrn(this.ctx.db, this.ctx.tenantId, invoiceId)) {
      throw new ConflictError(
        'This invoice has an IRN — the e-invoice is registered with GSTN and its value '
        + 'cannot be reduced. Issue a credit note for the undelivered quantity instead.',
      );
    }
    if (await isInFiledReturn(this.ctx.db, this.ctx.tenantId, invoiceId)) {
      throw new ConflictError(
        'This invoice is in a filed GSTR-1. Issue a credit note for the undelivered '
        + 'quantity instead of editing it.',
      );
    }
    return inv;
  }
}

/** Qty is numeric(18,3); float subtraction must not invent a fourth decimal. */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Rebuild one line at a new quantity. Tax fields ride along unchanged — the
 * rate is a property of the goods, not of how many went out — and `amount` is
 * recomputed so the line agrees with itself before the server re-derives GST.
 */
function toItemInput(item: typeof salesInvoiceItems.$inferSelect, quantity: number) {
  const unitPrice = Number(item.unitPrice);
  return {
    // Carried so the surviving rows keep their ids, and with them the
    // delivery-note lines that point at what already shipped.
    id: item.id,
    itemId: item.itemId ?? null,
    description: item.description,
    uom: item.uom ?? null,
    quantity,
    unitPrice,
    amount: Math.round(quantity * unitPrice * 100) / 100,
    hsnSacCode: item.hsnSacCode ?? null,
    taxCategory: item.taxCategory ?? null,
    taxRate: item.taxRate === null ? null : Number(item.taxRate),
    cessRate: item.cessRate === null ? null : Number(item.cessRate),
  };
}
