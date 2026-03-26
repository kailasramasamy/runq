import { eq, and } from 'drizzle-orm';
import { salesInvoices } from '@runq/db';
import type { Db } from '@runq/db';
import { InvoiceService } from '../../ar/invoice.service';

interface SalesInvoicePayload {
  customerId: string;
  invoiceDate: string;
  dueDate: string;
  wmsInvoiceId?: string;
  notes?: string;
  reverseCharge?: boolean;
  autoSend?: boolean;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
    hsnSacCode?: string;
    taxRate?: number;
    taxCategory?: string;
  }>;
}

export async function handleSalesInvoiceCreated(
  db: Db,
  tenantId: string,
  payload: SalesInvoicePayload,
): Promise<string> {
  // Dedup by wmsInvoiceId
  if (payload.wmsInvoiceId) {
    const [existing] = await db
      .select({ id: salesInvoices.id })
      .from(salesInvoices)
      .where(and(
        eq(salesInvoices.tenantId, tenantId),
        eq(salesInvoices.wmsInvoiceId, payload.wmsInvoiceId),
      ))
      .limit(1);
    if (existing) return existing.id;
  }

  const service = new InvoiceService(db, tenantId);
  const subtotal = payload.items.reduce((sum, i) => sum + i.amount, 0);
  const taxAmount = payload.items.reduce((sum, i) => {
    const cat = i.taxCategory;
    if (cat === 'exempt' || cat === 'nil_rated' || cat === 'zero_rated') return sum;
    return sum + i.amount * (i.taxRate ?? 0) / 100;
  }, 0);
  const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100;

  const result = await service.create({
    customerId: payload.customerId,
    invoiceDate: payload.invoiceDate,
    dueDate: payload.dueDate,
    subtotal,
    taxAmount: Math.round(taxAmount * 100) / 100,
    totalAmount,
    notes: payload.notes,
    reverseCharge: payload.reverseCharge ?? false,
    items: payload.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      amount: item.amount,
      hsnSacCode: item.hsnSacCode,
      taxRate: item.taxRate,
      taxCategory: item.taxCategory as any,
    })),
  });

  // Store wmsInvoiceId
  if (payload.wmsInvoiceId) {
    await db
      .update(salesInvoices)
      .set({ wmsInvoiceId: payload.wmsInvoiceId })
      .where(eq(salesInvoices.id, result.id));
  }

  // Auto-send if requested
  if (payload.autoSend) {
    await service.send(result.id, { channel: 'email', sendEmail: true });
  }

  return result.id;
}
