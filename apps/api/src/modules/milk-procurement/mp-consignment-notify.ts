import { and, eq } from 'drizzle-orm';
import { mpNodes, mpNodeOperators } from '@runq/db';
import type { Db, MpConsignmentRow } from '@runq/db';
import { getInteraktProvider } from '../../utils/messaging';
import { dateShift, trimNum, quality, nz } from './mp-notify-format';

// WhatsApp receipt to the VMCC operator when their milk is manually received at
// a CC (direct-receive). Reuses the milk_collection_receipt template — a
// VMCC→CC transfer has no farmer rate/amount, so those two params are '-'.
// Fire-and-forget from ConsignmentService.directReceive(); may throw (caller
// fire-and-forgets with .catch). No-op unless Interakt is configured, the
// source node is a VMCC, and an operator has a phone.

// Positional body values for milk_collection_receipt ({{1}}…{{6}}).
export function directReceiptParams(recipientName: string, c: MpConsignmentRow): Record<string, string> {
  return {
    name: nz(recipientName),
    dateShift: nz(dateShift(c.collectionDate, c.shift)),
    quantity: nz(trimNum(c.receiptQty)),
    quality: nz(quality(c.receiptFat, c.receiptSnf, c.receiptWater)),
    rate: '-',
    total: '-',
  };
}

export async function sendDirectReceiptWhatsApp(db: Db, tenantId: string, c: MpConsignmentRow): Promise<void> {
  const provider = getInteraktProvider();
  const templateName = process.env.INTERAKT_TEMPLATE_MILK_COLLECTION_RECEIPT;
  if (!provider || !templateName) return;

  // Only VMCC → CC receipts notify (the source is the VMCC operator's node).
  const [src] = await db.select({ nodeType: mpNodes.nodeType, name: mpNodes.name })
    .from(mpNodes).where(eq(mpNodes.id, c.fromNodeId)).limit(1);
  if (src?.nodeType !== 'vmcc') return;

  const operators = await db.select({ name: mpNodeOperators.name, phone: mpNodeOperators.phone })
    .from(mpNodeOperators).where(and(
      eq(mpNodeOperators.tenantId, tenantId),
      eq(mpNodeOperators.nodeId, c.fromNodeId),
      eq(mpNodeOperators.isActive, true),
    ));

  // Active operators of the VMCC, deduped by phone (a VMCC may have >1 operator).
  const seen = new Set<string>();
  const recipients = operators.filter((o) => o.phone && !seen.has(o.phone) && seen.add(o.phone));
  if (!recipients.length) return;

  for (const op of recipients) {
    const templateParams = directReceiptParams(op.name ?? src.name, c);
    const res = await provider.sendWhatsApp({ to: op.phone!, templateName, templateParams });
    if (!res.success) {
      console.error('Interakt manual-receipt notice failed', { tenantId, consignmentId: c.id, phone: op.phone, error: res.error });
    }
  }
}
