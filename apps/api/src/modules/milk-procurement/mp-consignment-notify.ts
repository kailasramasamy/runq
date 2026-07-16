import { and, eq } from 'drizzle-orm';
import { mpNodes, mpNodeOperators } from '@runq/db';
import type { Db, MpConsignmentRow } from '@runq/db';
import { getInteraktProvider } from '../../utils/messaging';
import { dateShift, trimNum, money, quality, nz } from './mp-notify-format';

// Rate chart applied to the receipt's QC (null when no chart resolves).
// `matrixRate` is set only when the VMCC is on a FLAT chart — the quality-based
// rate it would earn under the matrix chart (drives the flat-rate nudge).
export interface ReceiptPricing { rate: number; total: number; matrixRate: number | null }

// WhatsApp receipt to the VMCC operator when their milk is manually received at
// a CC (direct-receive). Reuses the milk_collection_receipt template. The rate
// chart values the receipt's QC (rate + total); both stay '-' when no chart
// applies. Fire-and-forget from ConsignmentService.directReceive(); may throw
// (caller fire-and-forgets with .catch). No-op unless Interakt is configured,
// the source node is a VMCC, and an operator has a phone.

// Positional body values for milk_collection_receipt ({{1}}…{{6}}).
export function directReceiptParams(recipientName: string, c: MpConsignmentRow, pricing: ReceiptPricing | null): Record<string, string> {
  return {
    name: nz(recipientName),
    dateShift: nz(dateShift(c.collectionDate, c.shift)),
    quantity: nz(trimNum(c.receiptQty)),
    quality: nz(quality(c.receiptFat, c.receiptSnf, c.receiptWater)),
    rate: pricing ? nz(money(String(pricing.rate))) : '-',
    total: pricing ? nz(money(String(pricing.total))) : '-',
  };
}

// Positional body values for milk_collection_receipt_flat ({{1}}…{{7}}): shows
// the flat rate paid plus the quality-based (matrix) rate the VMCC would earn.
export function flatDirectReceiptParams(recipientName: string, c: MpConsignmentRow, pricing: ReceiptPricing): Record<string, string> {
  return {
    name: nz(recipientName),
    dateShift: nz(dateShift(c.collectionDate, c.shift)),
    quantity: nz(trimNum(c.receiptQty)),
    quality: nz(quality(c.receiptFat, c.receiptSnf, c.receiptWater)),
    flatRate: nz(money(String(pricing.rate))),
    matrixRate: pricing.matrixRate != null ? nz(money(String(pricing.matrixRate))) : '-',
    total: nz(money(String(pricing.total))),
  };
}

export async function sendDirectReceiptWhatsApp(db: Db, tenantId: string, c: MpConsignmentRow, pricing: ReceiptPricing | null): Promise<void> {
  const provider = getInteraktProvider();
  const templateName = process.env.INTERAKT_TEMPLATE_MILK_COLLECTION_RECEIPT;
  if (!provider || !templateName) return;

  // Flat-rate VMCCs get the comparison template (matrixRate set only when flat).
  const flatTemplate = process.env.INTERAKT_TEMPLATE_MILK_COLLECTION_RECEIPT_FLAT;
  const useFlat = !!flatTemplate && pricing?.matrixRate != null;

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
    const templateParams = useFlat
      ? flatDirectReceiptParams(op.name ?? src.name, c, pricing!)
      : directReceiptParams(op.name ?? src.name, c, pricing);
    const res = await provider.sendWhatsApp({
      to: op.phone!,
      templateName: useFlat ? flatTemplate! : templateName,
      templateParams,
    });
    if (!res.success) {
      console.error('Interakt manual-receipt notice failed', { tenantId, consignmentId: c.id, phone: op.phone, error: res.error });
    }
  }
}
