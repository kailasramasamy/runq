import { eq } from 'drizzle-orm';
import { mpFarmers, mpNodes } from '@runq/db';
import type { Db, MpPourRow } from '@runq/db';
import { getInteraktProvider } from '../../utils/messaging';
import { dateShift, trimNum, money, quality, nz } from './mp-notify-format';
import { RateChartService } from './rate-chart.service';

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

// Positional body values for the milk_collection_receipt_flat template
// ({{1}}…{{7}}): adds the quality-based (matrix) rate a flat-rate farmer WOULD
// earn, next to their flat rate. Key ORDER must match the template.
export function flatPourReceiptParams(farmerName: string, pour: MpPourRow, matrixRate: number): Record<string, string> {
  return {
    name: nz(farmerName),
    dateShift: nz(dateShift(pour.collectionDate, pour.shift)),
    quantity: nz(trimNum(pour.qtyLitres)),
    quality: nz(quality(pour.fat, pour.snf, pour.water)),
    flatRate: nz(money(pour.ratePerLitre)),
    matrixRate: nz(money(String(matrixRate))),
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

  // Flat-rate farmers get the comparison template showing the quality-based rate
  // they'd earn under the matrix chart — falls back to the plain template when
  // the farmer isn't flat, no matrix chart resolves, or the flat template is unset.
  const matrixRate = await flatComparisonRate(db, tenantId, pour);
  const flatTemplate = process.env.INTERAKT_TEMPLATE_MILK_COLLECTION_RECEIPT_FLAT;
  const useFlat = matrixRate != null && !!flatTemplate;

  const res = await provider.sendWhatsApp({
    to: farmer.phone,
    templateName: useFlat ? flatTemplate! : templateName,
    templateParams: useFlat
      ? flatPourReceiptParams(farmer.name, pour, matrixRate!)
      : pourReceiptParams(farmer.name, pour),
  });
  if (!res.success) {
    console.error('Interakt pour receipt failed', { tenantId, pourId: pour.id, error: res.error });
  }
}

// The matrix-chart rate this pour would earn, but ONLY when the farmer resolved
// to a flat chart (else null → plain template). Null too when FAT/SNF absent or
// no matrix chart applies.
async function flatComparisonRate(db: Db, tenantId: string, pour: MpPourRow): Promise<number | null> {
  if (!pour.rateChartId) return null;
  const rates = new RateChartService(db, tenantId);
  if (await rates.pricingModeOf(pour.rateChartId) !== 'flat') return null;
  const ref = await rates.resolveMatrixReference({
    milkType: pour.milkType,
    fat: pour.fat != null ? Number(pour.fat) : undefined,
    snf: pour.snf != null ? Number(pour.snf) : undefined,
    scopeNodeId: pour.nodeId,
    onDate: pour.collectionDate,
  });
  return ref?.ratePerLitre ?? null;
}
