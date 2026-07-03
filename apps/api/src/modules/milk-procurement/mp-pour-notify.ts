import { eq } from 'drizzle-orm';
import { mpFarmers, mpNodes } from '@runq/db';
import type { Db, MpPourRow } from '@runq/db';
import { getInteraktProvider } from '../../utils/messaging';
import { dateShift, trimNum, money, quality, nz } from './mp-notify-format';

// WhatsApp "milk collection receipt" to the farmer, sent when a pour is recorded
// at a VMCC. Fire-and-forget from PourService.record(); may throw (the caller
// fire-and-forgets with .catch). No-op unless Interakt is configured, the node
// is a VMCC, and the farmer has a phone.

// Positional body values for the milk_collection_receipt template. Key ORDER
// must match {{1}}…{{6}}; the provider sends Object.values() as bodyValues.
export function pourReceiptParams(farmerName: string, pour: MpPourRow): Record<string, string> {
  return {
    name: nz(farmerName),
    dateShift: nz(dateShift(pour.collectionDate, pour.shift)),
    quantity: nz(trimNum(pour.qtyLitres)),
    quality: nz(quality(pour.fat, pour.snf, pour.water)),
    rate: nz(money(pour.ratePerLitre)),
    total: nz(money(pour.lineAmount)),
  };
}

export async function sendPourReceiptWhatsApp(db: Db, tenantId: string, pour: MpPourRow): Promise<void> {
  const provider = getInteraktProvider();
  const templateName = process.env.INTERAKT_TEMPLATE_MILK_COLLECTION_RECEIPT;
  if (!provider || !templateName) return;

  const [node] = await db.select({ nodeType: mpNodes.nodeType })
    .from(mpNodes).where(eq(mpNodes.id, pour.nodeId)).limit(1);
  if (node?.nodeType !== 'vmcc') return;

  const [farmer] = await db.select({ name: mpFarmers.name, phone: mpFarmers.phone })
    .from(mpFarmers).where(eq(mpFarmers.id, pour.farmerId)).limit(1);
  if (!farmer?.phone) return;

  const templateParams = pourReceiptParams(farmer.name, pour);
  const res = await provider.sendWhatsApp({ to: farmer.phone, templateName, templateParams });
  if (!res.success) {
    console.error('Interakt pour receipt failed', { tenantId, pourId: pour.id, error: res.error });
  }
}
