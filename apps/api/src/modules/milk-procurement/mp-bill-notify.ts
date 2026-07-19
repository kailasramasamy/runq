import { and, eq, inArray, isNull } from 'drizzle-orm';
import { mpNodes, mpPayoutCycles, mpPayoutLines, mpFarmers, mpFarmerMemberships, mpGlSettings } from '@runq/db';
import type { Db, MpVmccBillRow } from '@runq/db';
import type { BillingPeriod } from '@runq/validators';
import { getInteraktProvider } from '../../utils/messaging';
import { statementPdfUrl } from './mp-statement-token';
import { payeeVendorPhone } from './mp-notify-lookup';
import { cycleLabel, trimNum, rupees, nz, pdfName } from './mp-notify-format';

// WhatsApp "bill ready" notices with the statement PDF attached (document header).
// A via_vmcc VMCC bill goes to the payee vendor's phone when generated; direct
// farmers get their per-cycle statement when the cycle locks (amounts frozen).
// Fire-and-forget from the route/service; each no-ops unless Interakt + its
// template env var are configured, the PDF URL can be signed, and there's a phone.

/** One via_vmcc bill → its VMCC's payee vendor. `period` is the generate input. */
export async function sendVmccBillWhatsApp(
  db: Db, tenantId: string, bill: MpVmccBillRow, period: BillingPeriod,
): Promise<void> {
  const provider = getInteraktProvider();
  const templateName = process.env.INTERAKT_TEMPLATE_VMCC_BILL;
  if (!provider || !templateName) return;
  const phone = await payeeVendorPhone(db, tenantId, bill.vmccNodeId);
  if (!phone) return;

  const [vmcc] = await db.select({ name: mpNodes.name, code: mpNodes.code }).from(mpNodes)
    .where(and(eq(mpNodes.tenantId, tenantId), eq(mpNodes.id, bill.vmccNodeId))).limit(1);
  const [cycle] = await db.select({ from: mpPayoutCycles.periodStart, to: mpPayoutCycles.periodEnd })
    .from(mpPayoutCycles).where(eq(mpPayoutCycles.id, bill.payoutCycleId)).limit(1);
  if (!vmcc || !cycle) return;
  const periodLabel = cycleLabel(cycle.from, cycle.to);
  // A document-header template can't be sent without the PDF, so bail if unsigned.
  const url = statementPdfUrl(
    { k: 'vb', t: tenantId, n: bill.vmccNodeId, y: period.year, m: period.month, h: period.half },
    pdfName('VMCC bill', vmcc.name, periodLabel),
  );
  if (!url) return;
  const commission = Number(bill.commission) + Number(bill.salary) + Number(bill.rent);
  // Body vars for mp_vmcc_bill_notification ({{1}}..{{7}}), in template order.
  const templateParams = {
    name: nz(vmcc.name), period: nz(periodLabel), code: nz(vmcc.code),
    litres: nz(trimNum(bill.qtyLitres)), milkCost: nz(rupees(bill.milkCost)),
    commission: nz(rupees(commission)), net: nz(rupees(bill.totalAmount)),
  };
  const res = await provider.sendWhatsApp({ to: phone, templateName, templateParams, mediaUrl: url });
  if (!res.success) console.error('Interakt VMCC bill notice failed', { tenantId, billId: bill.id, error: res.error });
}

/** All direct-mode farmers in a just-locked cycle → their per-cycle statement. */
export async function sendFarmerBillNotifications(db: Db, tenantId: string, cycleId: string): Promise<void> {
  const provider = getInteraktProvider();
  const templateName = process.env.INTERAKT_TEMPLATE_FARMER_BILL;
  if (!provider || !templateName) return;
  const [cycle] = await db.select({ from: mpPayoutCycles.periodStart, to: mpPayoutCycles.periodEnd })
    .from(mpPayoutCycles).where(and(eq(mpPayoutCycles.tenantId, tenantId), eq(mpPayoutCycles.id, cycleId))).limit(1);
  if (!cycle) return;
  const directIds = await directModeVmccIds(db, tenantId);
  if (!directIds.size) return;
  const period = cycleLabel(cycle.from, cycle.to);

  const rows = await db.select({
    farmerId: mpPayoutLines.farmerId, name: mpFarmers.name, phone: mpFarmers.phone, nodeId: mpFarmerMemberships.nodeId,
    qty: mpPayoutLines.qtyLitres, gross: mpPayoutLines.grossAmount,
    ded: mpPayoutLines.deductionTotal, net: mpPayoutLines.netAmount,
  }).from(mpPayoutLines)
    .innerJoin(mpFarmers, eq(mpFarmers.id, mpPayoutLines.farmerId))
    .innerJoin(mpFarmerMemberships, and(
      eq(mpFarmerMemberships.farmerId, mpPayoutLines.farmerId), eq(mpFarmerMemberships.tenantId, tenantId),
      eq(mpFarmerMemberships.isPrimary, true), isNull(mpFarmerMemberships.leftOn),
    ))
    .where(and(eq(mpPayoutLines.tenantId, tenantId), eq(mpPayoutLines.payoutCycleId, cycleId)));

  for (const r of rows) {
    if (!r.phone || !directIds.has(r.nodeId)) continue;
    const url = statementPdfUrl(
      { k: 'fs', t: tenantId, f: r.farmerId, from: cycle.from, to: cycle.to },
      pdfName('Milk statement', r.name, period),
    );
    if (!url) continue;
    // Body vars for mp_farmer_bill_notification ({{1}}..{{6}}), in template order.
    const templateParams = {
      name: nz(r.name), period: nz(period), litres: nz(trimNum(r.qty)),
      gross: nz(rupees(r.gross)), deductions: nz(rupees(r.ded)), net: nz(rupees(r.net)),
    };
    const res = await provider.sendWhatsApp({ to: r.phone, templateName, templateParams, mediaUrl: url });
    if (!res.success) console.error('Interakt farmer bill notice failed', { tenantId, farmerId: r.farmerId, error: res.error });
  }
}

/** VMCC node ids whose EFFECTIVE payout mode is direct_to_farmer
 *  (node.payoutMode ?? parent CC.payoutMode ?? tenant default). */
export async function directModeVmccIds(db: Db, tenantId: string): Promise<Set<string>> {
  const [gl] = await db.select({ m: mpGlSettings.defaultPayoutMode }).from(mpGlSettings)
    .where(eq(mpGlSettings.tenantId, tenantId)).limit(1);
  const def = gl?.m ?? 'direct_to_farmer';
  const nodes = await db.select({
    id: mpNodes.id, type: mpNodes.nodeType, parent: mpNodes.parentNodeId, mode: mpNodes.payoutMode,
  }).from(mpNodes).where(and(
    eq(mpNodes.tenantId, tenantId), eq(mpNodes.isActive, true), inArray(mpNodes.nodeType, ['vmcc', 'cc']),
  ));
  const ccMode = new Map(nodes.filter((n) => n.type === 'cc').map((n) => [n.id, n.mode ?? def]));
  const out = new Set<string>();
  for (const n of nodes) {
    if (n.type !== 'vmcc') continue;
    const mode = n.mode ?? (n.parent ? ccMode.get(n.parent) : undefined) ?? def;
    if (mode === 'direct_to_farmer') out.add(n.id);
  }
  return out;
}
