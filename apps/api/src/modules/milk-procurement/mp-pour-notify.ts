import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { mpFarmers, mpNodes, mpGlSettings, mpPours, mpRateChartRules } from '@runq/db';
import type { Db, MpPourRow } from '@runq/db';
import { getInteraktProvider } from '../../utils/messaging';
import { dateShift, trimNum, money, quality, milkTypeLabel, nz } from './mp-notify-format';
import { bonusPeriodFor } from './procurement-window';

// WhatsApp "milk collection receipt" to the farmer, sent when a pour is recorded
// at a VMCC. Fire-and-forget from PourService.record(); may throw (the caller
// fire-and-forgets with .catch). No-op unless Interakt is configured, the node
// is a VMCC, and the farmer has a phone.

// Positional body values for the milk_collection_notification template. Key ORDER
// must match {{1}}…{{6}}; the provider sends Object.values() as bodyValues.
// milk_collection_bonus_notification reuses these as {{1}}…{{6}} and appends
// {{7}} bonus earned and {{8}} bonus so far this quarter — so the two templates
// must keep this prefix identical.
export function pourReceiptParams(farmerName: string, pour: MpPourRow): Record<string, string> {
  // A pour that reversed an earlier one (containers combined, a reading replaced,
  // an entry edited) sends a SECOND receipt for the same slot. Marking it in the
  // header says "this supersedes the last one" instead of leaving the farmer to
  // read two receipts as two collections. Rides an existing variable rather than
  // a new template: Meta fixes the body text, but the values are ours to fill.
  const superseded = pour.reversalOf ? ' · UPDATED' : '';
  return {
    name: nz(farmerName),
    // Milk type rides on the date/shift line so a farmer supplying more than one
    // type can tell their per-type receipts apart (each pour is its own message).
    dateShift: nz(
      `${dateShift(pour.collectionDate, pour.shift)} · ${milkTypeLabel(pour.milkType)}${superseded}`,
    ),
    quantity: nz(trimNum(pour.qtyLitres)),
    quality: nz(quality(pour.fat, pour.snf, pour.water)),
    rate: nz(money(pour.ratePerLitre)),
    total: nz(money(pour.lineAmount)),
  };
}

/**
 * Quality bonus this pour banked, plus the farmer's running total for the
 * accrual period it falls in. Null when the pour was priced by a chart with no
 * bonus tiers, or the tenant has no accrual window — the caller then sends the
 * plain receipt.
 *
 * Keyed on the CHART carrying tiers, not on this pour earning something. A pour
 * below the lowest tier still gets the bonus receipt showing ₹0 today against
 * the quarter total; gating on the amount would make the running total vanish
 * on a low-FAT day and reappear the next, which reads like it was taken away.
 *
 * Reads the same `quarterly_bonus_amount` the quarter-close run will sum, so the
 * number a farmer is quoted daily is the number they are eventually paid.
 */
async function bonusLines(
  db: Db, tenantId: string, pour: MpPourRow,
): Promise<{ today: string; periodToDate: string } | null> {
  if (!pour.rateChartId) return null;
  const [tier] = await db.select({ id: mpRateChartRules.id }).from(mpRateChartRules).where(and(
    eq(mpRateChartRules.tenantId, tenantId),
    eq(mpRateChartRules.rateChartId, pour.rateChartId),
    eq(mpRateChartRules.ruleType, 'quarterly_fat_bonus'),
  )).limit(1);
  if (!tier) return null;
  const [cfg] = await db.select({
    months: mpGlSettings.bonusPeriodMonths, anchor: mpGlSettings.bonusAnchorDate,
  }).from(mpGlSettings).where(eq(mpGlSettings.tenantId, tenantId)).limit(1);
  if (!cfg?.anchor) return null;
  const period = bonusPeriodFor(cfg.anchor, cfg.months, pour.collectionDate);
  if (!period) return null;
  const [agg] = await db.select({
    total: sql<string>`coalesce(sum(${mpPours.quarterlyBonusAmount}), 0)`,
  }).from(mpPours).where(and(
    eq(mpPours.tenantId, tenantId), eq(mpPours.farmerId, pour.farmerId),
    eq(mpPours.status, 'recorded'),
    gte(mpPours.collectionDate, period.start), lte(mpPours.collectionDate, period.end),
  ));
  return { today: money(pour.quarterlyBonusAmount), periodToDate: money(agg?.total ?? '0') };
}

export async function sendPourReceiptWhatsApp(db: Db, tenantId: string, pour: MpPourRow): Promise<void> {
  const provider = getInteraktProvider();
  const plainTemplate = process.env.INTERAKT_TEMPLATE_MILK_COLLECTION_NOTIFICATION;
  const bonusTemplate = process.env.INTERAKT_TEMPLATE_MILK_COLLECTION_BONUS;
  if (!provider || !plainTemplate) return;

  const [node] = await db.select({ nodeType: mpNodes.nodeType })
    .from(mpNodes).where(eq(mpNodes.id, pour.nodeId)).limit(1);
  if (node?.nodeType !== 'vmcc') return;

  const [farmer] = await db.select({ name: mpFarmers.name, phone: mpFarmers.phone })
    .from(mpFarmers).where(eq(mpFarmers.id, pour.farmerId)).limit(1);
  if (!farmer?.phone) return;

  // A separate template rather than two extra vars on the plain one: milk types
  // with no bonus tiers (buffalo, A2) would otherwise print "Bonus ₹0.00" on
  // every receipt, which reads as "you missed out" rather than "not applicable".
  const bonus = bonusTemplate ? await bonusLines(db, tenantId, pour) : null;
  const templateName = bonus ? bonusTemplate! : plainTemplate;
  const templateParams = bonus
    ? { ...pourReceiptParams(farmer.name, pour), bonusToday: bonus.today, bonusPeriod: bonus.periodToDate }
    : pourReceiptParams(farmer.name, pour);

  const res = await provider.sendWhatsApp({ to: farmer.phone, templateName, templateParams });
  if (!res.success) {
    console.error('Interakt pour receipt failed', { tenantId, pourId: pour.id, error: res.error });
  }
}
