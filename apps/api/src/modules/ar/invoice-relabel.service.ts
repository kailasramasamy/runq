/**
 * Making an issued invoice name the goods that actually left.
 *
 * When a stand-in is dispatched, the delivery note tells the truth and the
 * invoice does not: it still names the SKU that was billed. That is a
 * defensible place to stop — the customer is charged what they were quoted,
 * and the swap is on the delivery note. But it means the document the
 * customer reads disagrees with the carton in front of them, which is a
 * dispute waiting to happen.
 *
 * So this is offered as a choice, and the line is re-made in the substitute's
 * own terms: its name, and its price. An invoice that named A2 while charging
 * the Farm Fresh rate was internally consistent but left every A2 line in the
 * sales history recorded at a price A2 is not sold for, which quietly poisons
 * any margin or pricing analysis on that SKU.
 *
 * That means this *does* change what the customer owes, so it is never
 * automatic and never silent — the operator is shown the new total before
 * choosing it.
 *
 * HSN and GST rate are already guaranteed identical: `checkSubstitution`
 * refuses to dispatch a stand-in whose tax treatment differs, so by the time
 * a line reaches here only the money moves. The work goes through
 * `InvoiceService.update()` rather than a direct write, because the totals,
 * the per-line tax split and the revenue JE all have to move with it — and
 * because that path now edits line rows in place, so the delivery note's
 * foreign key to this line survives.
 */

import { and, eq, isNotNull } from 'drizzle-orm';
import type { Db } from '@runq/db';
import { deliveryNoteLines, deliveryNotes, items, salesInvoiceItems, salesInvoices } from '@runq/db';
import { AppError, ConflictError, NotFoundError } from '../../utils/errors';
import { AuditService } from '../../utils/audit';
import { InvoiceService } from './invoice.service';
import { hasIrn, isInFiledReturn } from './invoice-guards';

interface Ctx { db: Db; tenantId: string; userId?: string }

export class InvoiceRelabelService {
  constructor(private readonly ctx: Ctx) {}

  /**
   * Point an invoice line at the item that was actually delivered.
   *
   * Only legitimate when a dispatched delivery note says so: the swap has to
   * have physically happened, and the DN line is the evidence. Relabelling on
   * a bare assertion would let anyone rewrite an issued invoice.
   */
  async relabelToDispatched(invoiceId: string, invoiceLineId: string) {
    const invoice = await this.loadEditable(invoiceId);
    const line = await this.loadLine(invoiceId, invoiceLineId);
    const shipped = await this.dispatchedSubstitute(invoiceLineId);

    if (!shipped) {
      throw new ConflictError(
        'No dispatched substitution for this line — nothing to relabel it to.',
      );
    }
    if (shipped.itemId === line.itemId) {
      throw new ConflictError('The invoice already names the item that was delivered');
    }

    // No list price on the stand-in is not a reason to refuse — there is
    // simply nothing to re-price to, so the billed rate stands and the line
    // is renamed alone.
    const newPrice = shipped.sellingPrice ?? Number(line.unitPrice);
    const items = await this.itemsWithLineReplaced(invoiceId, invoiceLineId, {
      itemId: shipped.itemId,
      description: shipped.itemName,
      unitPrice: newPrice,
    });

    // Rewrites the row in place, recomputes GST from the per-line tax data
    // and tears down and re-posts the revenue JE against the new total.
    const updated = await new InvoiceService(this.ctx.db, this.ctx.tenantId)
      .update(invoiceId, { items } as never);

    await new AuditService(this.ctx.db, this.ctx.tenantId).log({
      userId: this.ctx.userId,
      action: 'invoice_line_relabelled',
      entityType: 'sales_invoice',
      entityId: invoiceId,
      metadata: {
        invoiceNumber: invoice.invoiceNumber,
        invoiceLineId,
        fromItemId: line.itemId,
        fromDescription: line.description,
        fromUnitPrice: Number(line.unitPrice),
        toItemId: shipped.itemId,
        toDescription: shipped.itemName,
        toUnitPrice: newPrice,
        dnNo: shipped.dnNo,
        reason: shipped.note,
      },
    });

    return updated;
  }

  /**
   * The invoice's lines as an update payload, with one of them re-made.
   *
   * Every line is sent, not just the changed one, because the update path
   * treats `items` as the whole set. Each carries its `id` so the existing
   * rows are updated rather than replaced — a replaced row would break the
   * delivery note's reference to the line it fulfilled.
   */
  private async itemsWithLineReplaced(
    invoiceId: string,
    invoiceLineId: string,
    replacement: { itemId: string; description: string; unitPrice: number },
  ) {
    const rows = await this.ctx.db
      .select()
      .from(salesInvoiceItems)
      .where(and(
        eq(salesInvoiceItems.invoiceId, invoiceId),
        eq(salesInvoiceItems.tenantId, this.ctx.tenantId),
      ));

    return rows.map((r) => {
      const isTarget = r.id === invoiceLineId;
      const quantity = Number(r.quantity);
      const unitPrice = isTarget ? replacement.unitPrice : Number(r.unitPrice);
      return {
        id: r.id,
        itemId: isTarget ? replacement.itemId : r.itemId,
        description: isTarget ? replacement.description : r.description,
        uom: r.uom ?? null,
        quantity,
        unitPrice,
        amount: Math.round(quantity * unitPrice * 100) / 100,
        // Unchanged by construction — a stand-in with a different HSN or rate
        // could never have been dispatched against this line.
        hsnSacCode: r.hsnSacCode ?? null,
        taxCategory: r.taxCategory ?? null,
        taxRate: r.taxRate === null ? null : Number(r.taxRate),
        cessRate: r.cessRate === null ? null : Number(r.cessRate),
      };
    });
  }

  /** The invoice, if it is still something we are allowed to touch. */
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
    if (inv.status === 'cancelled') {
      throw new ConflictError('Invoice is cancelled — nothing to relabel');
    }
    if (await hasIrn(this.ctx.db, this.ctx.tenantId, invoiceId)) {
      throw new ConflictError(
        'This invoice has an IRN — the e-invoice is registered with GSTN and cannot be edited. '
        + 'Issue a credit note and re-bill against the item that was delivered.',
      );
    }
    if (await isInFiledReturn(this.ctx.db, this.ctx.tenantId, invoiceId)) {
      throw new ConflictError(
        'This invoice is in a filed GSTR-1 and cannot be edited. '
        + 'Issue a credit note, customer debit note, or void it instead.',
      );
    }
    return inv;
  }

  private async loadLine(invoiceId: string, invoiceLineId: string) {
    const [line] = await this.ctx.db
      .select({
        id: salesInvoiceItems.id,
        itemId: salesInvoiceItems.itemId,
        description: salesInvoiceItems.description,
        unitPrice: salesInvoiceItems.unitPrice,
      })
      .from(salesInvoiceItems)
      .where(and(
        eq(salesInvoiceItems.id, invoiceLineId),
        eq(salesInvoiceItems.invoiceId, invoiceId),
        eq(salesInvoiceItems.tenantId, this.ctx.tenantId),
      ))
      .limit(1);
    if (!line) throw new NotFoundError('Invoice line');
    return line;
  }

  /**
   * What a posted delivery note says went out against this line in place of
   * what was billed. Drafts don't count — nothing has moved yet, so there is
   * no delivered fact to align the invoice to.
   */
  private async dispatchedSubstitute(invoiceLineId: string) {
    const [row] = await this.ctx.db
      .select({
        itemId: deliveryNoteLines.itemId,
        itemName: items.name,
        sellingPrice: items.defaultSellingPrice,
        note: deliveryNoteLines.substitutionNote,
        dnNo: deliveryNotes.dnNo,
      })
      .from(deliveryNoteLines)
      .innerJoin(deliveryNotes, eq(deliveryNotes.id, deliveryNoteLines.dnId))
      .innerJoin(items, eq(items.id, deliveryNoteLines.itemId))
      .where(and(
        eq(deliveryNoteLines.tenantId, this.ctx.tenantId),
        eq(deliveryNoteLines.invoiceLineId, invoiceLineId),
        eq(deliveryNotes.status, 'dispatched'),
        eq(deliveryNotes.direction, 'out'),
        // Only a recorded substitution licenses a relabel. Without this an
        // ordinary dispatched line matches, and the caller is refused with a
        // confusing "already names that item" instead of the truth.
        isNotNull(deliveryNoteLines.substitutedForItemId),
      ))
      .limit(1);
    if (!row) return null;
    if (!row.itemName) throw new AppError(500, 'Dispatched item is missing a name');
    return {
      ...row,
      sellingPrice: row.sellingPrice === null ? null : Number(row.sellingPrice),
    };
  }
}
