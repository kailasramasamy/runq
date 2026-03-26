import { eq, and } from 'drizzle-orm';
import { purchaseOrders, purchaseOrderItems } from '@runq/db';
import type { Db } from '@runq/db';

interface PoPayload {
  poNumber: string;
  vendorId: string;
  orderDate: string;
  expectedDeliveryDate?: string;
  totalAmount: number;
  wmsPoId?: string;
  notes?: string;
  items: Array<{
    itemName: string;
    sku?: string;
    quantity: number;
    unitPrice: number;
    amount: number;
  }>;
}

export async function handlePoCreated(db: Db, tenantId: string, payload: PoPayload): Promise<string> {
  // Dedup by wmsPoId
  if (payload.wmsPoId) {
    const [existing] = await db
      .select({ id: purchaseOrders.id })
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.tenantId, tenantId), eq(purchaseOrders.wmsPoId, payload.wmsPoId)))
      .limit(1);
    if (existing) return existing.id;
  }

  const [po] = await db
    .insert(purchaseOrders)
    .values({
      tenantId,
      poNumber: payload.poNumber,
      vendorId: payload.vendorId,
      orderDate: payload.orderDate,
      expectedDeliveryDate: payload.expectedDeliveryDate ?? null,
      totalAmount: String(payload.totalAmount),
      status: 'confirmed',
      notes: payload.notes ?? null,
      wmsPoId: payload.wmsPoId ?? null,
    })
    .returning();

  if (payload.items.length > 0) {
    await db.insert(purchaseOrderItems).values(
      payload.items.map((item) => ({
        tenantId,
        poId: po!.id,
        itemName: item.itemName,
        sku: item.sku ?? null,
        quantity: String(item.quantity),
        unitPrice: String(item.unitPrice),
        amount: String(item.amount),
      })),
    );
  }

  return po!.id;
}
