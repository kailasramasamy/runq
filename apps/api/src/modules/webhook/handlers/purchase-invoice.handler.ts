import { eq, and } from 'drizzle-orm';
import { purchaseInvoices } from '@runq/db';
import type { Db } from '@runq/db';
import { PurchaseInvoiceService } from '../../ap/purchase-invoice.service';

interface PurchaseInvoicePayload {
  vendorId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  poId?: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  wmsInvoiceId?: string;
  notes?: string;
  reverseCharge?: boolean;
  tdsSection?: string;
  items: Array<{
    itemName: string;
    sku?: string;
    quantity: number;
    unitPrice: number;
    amount: number;
    hsnSacCode?: string;
    taxRate?: number;
    taxCategory?: string;
    tdsSection?: string;
    tdsRate?: number;
  }>;
}

export async function handlePurchaseInvoiceCreated(
  db: Db,
  tenantId: string,
  payload: PurchaseInvoicePayload,
): Promise<string> {
  // Dedup by wmsInvoiceId
  if (payload.wmsInvoiceId) {
    const [existing] = await db
      .select({ id: purchaseInvoices.id })
      .from(purchaseInvoices)
      .where(and(
        eq(purchaseInvoices.tenantId, tenantId),
        eq(purchaseInvoices.wmsInvoiceId, payload.wmsInvoiceId),
      ))
      .limit(1);
    if (existing) return existing.id;
  }

  const service = new PurchaseInvoiceService(db, tenantId);
  const result = await service.create({
    vendorId: payload.vendorId,
    invoiceNumber: payload.invoiceNumber,
    invoiceDate: payload.invoiceDate,
    dueDate: payload.dueDate,
    poId: payload.poId,
    subtotal: payload.subtotal,
    taxAmount: payload.taxAmount,
    totalAmount: payload.totalAmount,
    notes: payload.notes,
    reverseCharge: payload.reverseCharge ?? false,
    tdsSection: payload.tdsSection,
    items: payload.items.map((item) => ({
      itemName: item.itemName,
      sku: item.sku,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      amount: item.amount,
      hsnSacCode: item.hsnSacCode,
      taxRate: item.taxRate,
      taxCategory: item.taxCategory as any,
      tdsSection: item.tdsSection,
      tdsRate: item.tdsRate,
    })),
  });

  return result.id;
}
