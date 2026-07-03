import { eq } from 'drizzle-orm';
import { mpFarmers, mpNodes } from '@runq/db';
import type { Db, MpPourRow } from '@runq/db';
import { getInteraktProvider } from '../../utils/messaging';

// WhatsApp "milk collection receipt" to the farmer, sent when a pour is recorded
// at a VMCC. Fire-and-forget from PourService.record(); may throw (the caller
// fire-and-forgets with .catch). No-op unless Interakt is configured, the node
// is a VMCC, and the farmer has a phone.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "2026-07-03" → "03 Jul 2026"
function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d] = m;
  return `${d} ${MONTHS[Number(mo) - 1] ?? mo} ${y}`;
}

// decimal string → trimmed number ("12.500" → "12.5", "10.00" → "10")
function trimNum(v: string | null): string {
  const n = Number(v ?? '');
  return v != null && Number.isFinite(n) ? String(n) : '-';
}

function money(v: string | null): string {
  const n = Number(v ?? '');
  return Number.isFinite(n) ? `₹${n.toFixed(2)}` : '-';
}

// Template params must be non-empty — Interakt/Meta reject blank body values.
function nz(v: string): string {
  return v.trim().length ? v : '-';
}

// Positional body values for the milk_collection_receipt template. Key ORDER
// must match {{1}}…{{6}}; the provider sends Object.values() as bodyValues.
export function pourReceiptParams(farmerName: string, pour: MpPourRow): Record<string, string> {
  const shift = pour.shift === 'am' ? 'Morning' : 'Evening';
  const water = pour.water != null ? `${trimNum(pour.water)}%` : '-';
  return {
    name: nz(farmerName),
    dateShift: nz(`${formatDate(pour.collectionDate)}, ${shift}`),
    quantity: nz(trimNum(pour.qtyLitres)),
    quality: nz(`${trimNum(pour.fat)} / ${trimNum(pour.snf)} / ${water}`),
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
