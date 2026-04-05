import { eq, and } from 'drizzle-orm';
import { purchaseInvoices, purchaseInvoiceItems, purchaseOrders, purchaseOrderItems, goodsReceiptNotes, grnItems, vendors } from '@runq/db';
import type { Db } from '@runq/db';
import type { ThreeWayMatchResult, MatchLineResult } from '@runq/types';
import { NotFoundError, ConflictError } from '../../utils/errors';
import { AuditService } from '../../utils/audit';
import { GLService } from '../gl/gl.service';
import { WorkflowService } from '../workflows/workflow.service';
import { toNumber } from '../../utils/decimal';

const MATCH_TOLERANCE_PERCENT = 2;

type POItem = typeof purchaseOrderItems.$inferSelect;
type GRNItem = typeof grnItems.$inferSelect;
type InvoiceItem = typeof purchaseInvoiceItems.$inferSelect;

interface MatchedLine {
  poItem: POItem | undefined;
  grnItem: GRNItem | undefined;
  invoiceItem: InvoiceItem;
}

export class ThreeWayMatchService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  private audit(): AuditService {
    return new AuditService(this.db, this.tenantId);
  }

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

  async approve(invoiceId: string, approvedBy: string, userId?: string): Promise<void> {
    const [invoice] = await this.db
      .select({
        status: purchaseInvoices.status,
        poId: purchaseInvoices.poId,
        totalAmount: purchaseInvoices.totalAmount,
        invoiceDate: purchaseInvoices.invoiceDate,
        vendorId: purchaseInvoices.vendorId,
      })
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

    // Check workflow approval if configured
    const wfSvc = new WorkflowService(this.db, this.tenantId);
    const wfApproved = await wfSvc.isApproved('purchase_invoice', invoiceId);
    if (!wfApproved) throw new ConflictError('Bill requires workflow approval before it can be approved');

    await this.db
      .update(purchaseInvoices)
      .set({ status: 'approved', matchStatus: 'matched', approvedBy, approvedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(purchaseInvoices.id, invoiceId), eq(purchaseInvoices.tenantId, this.tenantId)));

    // Post to GL
    const [vendorRow] = await this.db
      .select({ name: vendors.name, expenseAccountCode: vendors.expenseAccountCode })
      .from(vendors)
      .where(eq(vendors.id, invoice.vendorId))
      .limit(1);

    const gl = new GLService(this.db, this.tenantId);
    await gl.postPurchaseInvoice({
      totalAmount: toNumber(invoice.totalAmount),
      date: invoice.invoiceDate,
      id: invoiceId,
      vendorName: vendorRow?.name ?? '',
      expenseAccountCode: vendorRow?.expenseAccountCode ?? undefined,
    });

    await this.audit().log({ userId: userId ?? approvedBy, action: 'approved', entityType: 'purchase_invoice', entityId: invoiceId });
  }

  private buildMatchedLines(invItems: InvoiceItem[], poItems: POItem[], grnItemRows: GRNItem[]): MatchedLine[] {
    return invItems.map((invItem) => {
      const poItem = invItem.poItemId
        ? poItems.find((p) => p.id === invItem.poItemId)
        : poItems.find((p) => p.sku && p.sku === invItem.sku);

      const grnItem = poItem
        ? grnItemRows.find((g) => g.poItemId === poItem.id || (g.sku && g.sku === invItem.sku))
        : undefined;

      return { poItem, invoiceItem: invItem, grnItem };
    });
  }

  private isWithinTolerance(actual: number, reference: number): boolean {
    if (reference === 0) return actual === 0;
    const variance = Math.abs((actual - reference) / reference) * 100;
    return variance <= MATCH_TOLERANCE_PERCENT;
  }

  private evaluateLine(ml: MatchedLine): MatchLineResult {
    const { poItem, grnItem, invoiceItem } = ml;

    if (!poItem) {
      return {
        sku: invoiceItem.sku,
        itemName: invoiceItem.itemName,
        status: 'mismatch',
        qty: { po: 0, grn: 0, invoice: Number(invoiceItem.quantity) },
        unitPrice: { po: 0, invoice: Number(invoiceItem.unitPrice) },
        message: 'No matching PO item found',
      };
    }

    const poQty = Number(poItem.quantity);
    const grnQty = grnItem ? Number(grnItem.acceptedQuantity) : 0;
    const invQty = Number(invoiceItem.quantity);
    const poPrice = Number(poItem.unitPrice);
    const invPrice = Number(invoiceItem.unitPrice);
    const messages: string[] = [];
    const notes: string[] = [];

    if (grnQty > poQty) messages.push(`GRN accepted qty (${grnQty}) exceeds PO qty (${poQty})`);

    if (invQty !== poQty) {
      if (this.isWithinTolerance(invQty, poQty)) {
        const pct = Math.abs(((invQty - poQty) / poQty) * 100).toFixed(1);
        notes.push(`Qty variance ${pct}% (within tolerance)`);
      } else {
        messages.push(`Invoice qty (${invQty}) exceeds PO qty (${poQty})`);
      }
    }

    if (invPrice !== poPrice) messages.push(`Invoice unit price (${invPrice}) does not match PO price (${poPrice})`);

    if (grnItem && invQty !== grnQty) {
      if (!this.isWithinTolerance(invQty, grnQty)) {
        messages.push(`Invoice qty (${invQty}) exceeds GRN accepted qty (${grnQty})`);
      } else if (!notes.some((n) => n.startsWith('Qty variance'))) {
        const pct = Math.abs(((invQty - grnQty) / grnQty) * 100).toFixed(1);
        notes.push(`Qty variance ${pct}% (within tolerance)`);
      }
    }

    const allMessages = [...messages, ...notes];
    return {
      sku: invoiceItem.sku,
      itemName: invoiceItem.itemName,
      status: messages.length === 0 ? 'matched' : 'mismatch',
      qty: { po: poQty, grn: grnQty, invoice: invQty },
      unitPrice: { po: poPrice, invoice: invPrice },
      message: allMessages.length > 0 ? allMessages.join('; ') : null,
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
