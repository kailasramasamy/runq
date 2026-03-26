import { eq, and } from 'drizzle-orm';
import { goodsReceiptNotes, grnItems, purchaseOrders, purchaseOrderItems } from '@runq/db';
import type { Db } from '@runq/db';

interface GrnPayload {
  grnNumber: string;
  poId: string;
  receivedDate: string;
  wmsGrnId?: string;
  notes?: string;
  items: Array<{
    itemName: string;
    sku?: string;
    orderedQuantity: number;
    receivedQuantity: number;
    acceptedQuantity: number;
    rejectedQuantity?: number;
  }>;
}

export async function handleGrnCreated(db: Db, tenantId: string, payload: GrnPayload): Promise<string> {
  // Dedup by wmsGrnId
  if (payload.wmsGrnId) {
    const [existing] = await db
      .select({ id: goodsReceiptNotes.id })
      .from(goodsReceiptNotes)
      .where(and(eq(goodsReceiptNotes.tenantId, tenantId), eq(goodsReceiptNotes.wmsGrnId, payload.wmsGrnId)))
      .limit(1);
    if (existing) return existing.id;
  }

  // Resolve poId — could be a runq UUID or a wmsPoId
  const resolvedPoId = await resolvePoId(db, tenantId, payload.poId);

  const [grn] = await db
    .insert(goodsReceiptNotes)
    .values({
      tenantId,
      grnNumber: payload.grnNumber,
      poId: resolvedPoId,
      receivedDate: payload.receivedDate,
      status: 'confirmed',
      notes: payload.notes ?? null,
      wmsGrnId: payload.wmsGrnId ?? null,
    })
    .returning();

  // Try to match PO items by SKU for poItemId linkage
  const poItems = await db
    .select({ id: purchaseOrderItems.id, sku: purchaseOrderItems.sku })
    .from(purchaseOrderItems)
    .where(eq(purchaseOrderItems.poId, resolvedPoId));

  const skuToPoItemId = new Map(poItems.filter((i) => i.sku).map((i) => [i.sku, i.id]));

  if (payload.items.length > 0) {
    await db.insert(grnItems).values(
      payload.items.map((item) => ({
        tenantId,
        grnId: grn!.id,
        poItemId: (item.sku && skuToPoItemId.get(item.sku)) || null,
        itemName: item.itemName,
        sku: item.sku ?? null,
        orderedQuantity: String(item.orderedQuantity),
        receivedQuantity: String(item.receivedQuantity),
        acceptedQuantity: String(item.acceptedQuantity),
        rejectedQuantity: String(item.rejectedQuantity ?? 0),
      })),
    );
  }

  return grn!.id;
}

async function resolvePoId(db: Db, tenantId: string, poIdOrWmsId: string): Promise<string> {
  // If it's a UUID, use directly
  if (/^[0-9a-f]{8}-/.test(poIdOrWmsId)) return poIdOrWmsId;

  // Otherwise look up by wmsPoId
  const [po] = await db
    .select({ id: purchaseOrders.id })
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.tenantId, tenantId), eq(purchaseOrders.wmsPoId, poIdOrWmsId)))
    .limit(1);

  if (!po) throw new Error(`PO not found for wmsPoId: ${poIdOrWmsId}`);
  return po.id;
}
