import { eq, and } from 'drizzle-orm';
import { purchaseInvoices, purchaseInvoiceItems, purchaseOrders, purchaseOrderItems, goodsReceiptNotes, grnItems } from '@runq/db';
import type { Db } from '@runq/db';
import type { ThreeWayMatchResult, MatchLineResult } from '@runq/types';
import { NotFoundError, ConflictError } from '../../utils/errors';

type POItem = typeof purchaseOrderItems.$inferSelect;
type GRNItem = typeof grnItems.$inferSelect;
type InvoiceItem = typeof purchaseInvoiceItems.$inferSelect;

interface MatchedLine {
  poItem: POItem;
  grnItem: GRNItem | undefined;
  invoiceItem: InvoiceItem;
}

export class ThreeWayMatchService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async performMatch(invoiceId: string, poId: string, grnId: string): Promise<ThreeWayMatchResult> {
    const [invoice, po, grn] = await Promise.all([
      this.fetchInvoice(invoiceId),
      this.fetchPO(poId),
      this.fetchGRN(grnId),
    ]);

    const [invItems, poItems, grnItemRows] = await Promise.all([
      this.fetchInvoiceItems(invoiceId),
      this.fetchPOItems(poId),
      this.fetchGRNItems(grnId),
    ]);

    const matchedLines = this.buildMatchedLines(invItems, poItems, grnItemRows);
    const lineResults = matchedLines.map((ml) => this.evaluateLine(ml));

    const overallMatched = lineResults.every((l) => l.status === 'matched');
    const matchStatus = overallMatched ? 'matched' : 'mismatch';
    const invoiceStatus = overallMatched ? 'matched' : 'pending_match';

    const matchNotes = overallMatched ? null : this.buildMismatchNotes(lineResults);

    await this.db
      .update(purchaseInvoices)
      .set({
        poId,
        grnId,
        matchStatus,
        status: invoiceStatus,
        matchNotes,
        updatedAt: new Date(),
      })
      .where(and(eq(purchaseInvoices.id, invoiceId), eq(purchaseInvoices.tenantId, this.tenantId)));

    return {
      invoiceId,
      poId,
      grnId,
      status: matchStatus,
      summary: {
        poTotal: Number(po.totalAmount),
        grnTotal: this.sumAccepted(grnItemRows),
        invoiceTotal: Number(invoice.totalAmount),
      },
      lines: lineResults,
    };
  }

  async approve(invoiceId: string, approvedBy: string): Promise<void> {
    const [invoice] = await this.db
      .select({ status: purchaseInvoices.status, poId: purchaseInvoices.poId })
      .from(purchaseInvoices)
      .where(and(eq(purchaseInvoices.id, invoiceId), eq(purchaseInvoices.tenantId, this.tenantId)))
      .limit(1);

    if (!invoice) throw new NotFoundError('PurchaseInvoice');

    // Bills with PO require matching first; bills without PO can be approved directly from draft
    const allowedStatuses = invoice.poId ? ['matched'] : ['draft', 'matched'];
    if (!allowedStatuses.includes(invoice.status)) {
      const msg = invoice.poId
        ? 'Invoice with PO must be matched before approval'
        : 'Invoice must be in draft status to approve';
      throw new ConflictError(msg);
    }

    await this.db
      .update(purchaseInvoices)
      .set({ status: 'approved', matchStatus: 'matched', approvedBy, approvedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(purchaseInvoices.id, invoiceId), eq(purchaseInvoices.tenantId, this.tenantId)));
  }

  private buildMatchedLines(invItems: InvoiceItem[], poItems: POItem[], grnItemRows: GRNItem[]): MatchedLine[] {
    return invItems.map((invItem) => {
      const poItem = invItem.poItemId
        ? poItems.find((p) => p.id === invItem.poItemId)
        : poItems.find((p) => p.sku && p.sku === invItem.sku);

      const grnItem = poItem
        ? grnItemRows.find((g) => g.poItemId === poItem.id || (g.sku && g.sku === invItem.sku))
        : undefined;

      return { poItem: poItem!, invoiceItem: invItem, grnItem };
    });
  }

  private evaluateLine(ml: MatchedLine): MatchLineResult {
    const { poItem, grnItem, invoiceItem } = ml;
    const messages: string[] = [];

    if (!poItem) {
      return {
        sku: invoiceItem.sku,
        itemName: invoiceItem.itemName,
        status: 'mismatch',
        qty: { po: 0, grn: 0, invoice: Number(invoiceItem.quantity) },
        unitPrice: { po: 0, invoice: Number(invoiceItem.unitPrice) },
        message: 'No matching PO line found',
      };
    }

    const poQty = Number(poItem.quantity);
    const grnQty = grnItem ? Number(grnItem.acceptedQuantity) : 0;
    const invQty = Number(invoiceItem.quantity);
    const poPrice = Number(poItem.unitPrice);
    const invPrice = Number(invoiceItem.unitPrice);

    if (grnQty > poQty) messages.push(`GRN accepted qty (${grnQty}) exceeds PO qty (${poQty})`);
    if (invQty > poQty) messages.push(`Invoice qty (${invQty}) exceeds PO qty (${poQty})`);
    if (invPrice !== poPrice) messages.push(`Invoice unit price (${invPrice}) does not match PO price (${poPrice})`);
    if (grnItem && invQty > grnQty) messages.push(`Invoice qty (${invQty}) exceeds GRN accepted qty (${grnQty})`);

    return {
      sku: invoiceItem.sku,
      itemName: invoiceItem.itemName,
      status: messages.length === 0 ? 'matched' : 'mismatch',
      qty: { po: poQty, grn: grnQty, invoice: invQty },
      unitPrice: { po: poPrice, invoice: invPrice },
      message: messages.length > 0 ? messages.join('; ') : null,
    };
  }

  private buildMismatchNotes(lines: MatchLineResult[]): string {
    return lines
      .filter((l) => l.status === 'mismatch')
      .map((l) => `[${l.itemName}]: ${l.message}`)
      .join('\n');
  }

  private sumAccepted(items: GRNItem[]): number {
    return items.reduce((sum, item) => sum + Number(item.acceptedQuantity), 0);
  }

  private async fetchInvoice(id: string) {
    const [row] = await this.db
      .select()
      .from(purchaseInvoices)
      .where(and(eq(purchaseInvoices.id, id), eq(purchaseInvoices.tenantId, this.tenantId)))
      .limit(1);
    if (!row) throw new NotFoundError('PurchaseInvoice');
    return row;
  }

  private async fetchPO(id: string) {
    const [row] = await this.db
      .select()
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.tenantId, this.tenantId)))
      .limit(1);
    if (!row) throw new NotFoundError('PurchaseOrder');
    return row;
  }

  private async fetchGRN(id: string) {
    const [row] = await this.db
      .select()
      .from(goodsReceiptNotes)
      .where(and(eq(goodsReceiptNotes.id, id), eq(goodsReceiptNotes.tenantId, this.tenantId)))
      .limit(1);
    if (!row) throw new NotFoundError('GoodsReceiptNote');
    return row;
  }

  private async fetchInvoiceItems(invoiceId: string) {
    return this.db
      .select()
      .from(purchaseInvoiceItems)
      .where(and(eq(purchaseInvoiceItems.invoiceId, invoiceId), eq(purchaseInvoiceItems.tenantId, this.tenantId)));
  }

  private async fetchPOItems(poId: string) {
    return this.db
      .select()
      .from(purchaseOrderItems)
      .where(and(eq(purchaseOrderItems.poId, poId), eq(purchaseOrderItems.tenantId, this.tenantId)));
  }

  private async fetchGRNItems(grnId: string) {
    return this.db
      .select()
      .from(grnItems)
      .where(and(eq(grnItems.grnId, grnId), eq(grnItems.tenantId, this.tenantId)));
  }
}
