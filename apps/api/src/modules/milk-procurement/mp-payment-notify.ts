import { and, eq, inArray } from 'drizzle-orm';
import { mpNodes, mpPayoutCycles, mpPayoutLines, mpFarmers } from '@runq/db';
import type { Db, MpVmccBillRow } from '@runq/db';
import type { PayVmccBillInput } from '@runq/validators';
import { getInteraktProvider } from '../../utils/messaging';
import { payeeVendorPhone, tenantDisplayName } from './mp-notify-lookup';
import { cycleLabel, formatDate, rupees, paymentModeLabel, nz } from './mp-notify-format';

// WhatsApp "payment made" confirmations. Text-only (no PDF) — the recipient
// already has the statement from bill time. Fire-and-forget from the pay routes;
// each no-ops unless Interakt + its template env var are set and there's a phone.

/** A settled via_vmcc bill → its VMCC's payee vendor. */
export async function sendVmccPaymentWhatsApp(
  db: Db, tenantId: string, bill: MpVmccBillRow, input: PayVmccBillInput,
): Promise<void> {
  const provider = getInteraktProvider();
  const templateName = process.env.INTERAKT_TEMPLATE_VMCC_PAYMENT;
  if (!provider || !templateName) return;
  const phone = await payeeVendorPhone(db, tenantId, bill.vmccNodeId);
  if (!phone) return;

  const [vmcc] = await db.select({ name: mpNodes.name, code: mpNodes.code }).from(mpNodes)
    .where(and(eq(mpNodes.tenantId, tenantId), eq(mpNodes.id, bill.vmccNodeId))).limit(1);
  const [cycle] = await db.select({ from: mpPayoutCycles.periodStart, to: mpPayoutCycles.periodEnd })
    .from(mpPayoutCycles).where(eq(mpPayoutCycles.id, bill.payoutCycleId)).limit(1);
  if (!vmcc || !cycle) return;
  const tenant = await tenantDisplayName(db, tenantId);
  const templateParams = {
    name: nz(vmcc.name), period: nz(cycleLabel(cycle.from, cycle.to)), code: nz(vmcc.code),
    amount: nz(rupees(bill.totalAmount)), date: nz(formatDate(input.paymentDate)),
    mode: nz(paymentModeLabel(input.paymentMode)), reference: nz(input.txnReference ?? '-'), tenant: nz(tenant),
  };
  const res = await provider.sendWhatsApp({ to: phone, templateName, templateParams });
  if (!res.success) console.error('Interakt VMCC payment notice failed', { tenantId, billId: bill.id, error: res.error });
}

/** A settled direct-mode farmer line → the farmer. `lineId` is the payout line. */
export async function sendFarmerPaymentWhatsApp(
  db: Db, tenantId: string, lineId: string, input: PayVmccBillInput,
): Promise<void> {
  const provider = getInteraktProvider();
  const templateName = process.env.INTERAKT_TEMPLATE_FARMER_PAYMENT;
  if (!provider || !templateName) return;

  const [row] = await db.select({
    name: mpFarmers.name, phone: mpFarmers.phone, net: mpPayoutLines.netAmount,
    from: mpPayoutCycles.periodStart, to: mpPayoutCycles.periodEnd,
  }).from(mpPayoutLines)
    .innerJoin(mpFarmers, eq(mpFarmers.id, mpPayoutLines.farmerId))
    .innerJoin(mpPayoutCycles, eq(mpPayoutCycles.id, mpPayoutLines.payoutCycleId))
    .where(and(eq(mpPayoutLines.tenantId, tenantId), eq(mpPayoutLines.id, lineId))).limit(1);
  if (!row?.phone) return;
  const tenant = await tenantDisplayName(db, tenantId);
  const templateParams = {
    name: nz(row.name), period: nz(cycleLabel(row.from, row.to)), amount: nz(rupees(row.net)),
    date: nz(formatDate(input.paymentDate)), mode: nz(paymentModeLabel(input.paymentMode)),
    reference: nz(input.txnReference ?? '-'), tenant: nz(tenant),
  };
  const res = await provider.sendWhatsApp({ to: row.phone, templateName, templateParams });
  if (!res.success) console.error('Interakt farmer payment notice failed', { tenantId, lineId, error: res.error });
}

/** Bulk "Pay whole cycle" → confirm to each farmer just paid (the direct
 *  remainder). No per-payment mode/reference is captured for a batch, so it
 *  reports a bank transfer with no reference. */
export async function sendCyclePaymentNotifications(
  db: Db, tenantId: string, cycleId: string, lineIds: string[],
): Promise<void> {
  const provider = getInteraktProvider();
  const templateName = process.env.INTERAKT_TEMPLATE_FARMER_PAYMENT;
  if (!provider || !templateName || !lineIds.length) return;

  const rows = await db.select({
    name: mpFarmers.name, phone: mpFarmers.phone, net: mpPayoutLines.netAmount,
    from: mpPayoutCycles.periodStart, to: mpPayoutCycles.periodEnd,
  }).from(mpPayoutLines)
    .innerJoin(mpFarmers, eq(mpFarmers.id, mpPayoutLines.farmerId))
    .innerJoin(mpPayoutCycles, eq(mpPayoutCycles.id, mpPayoutLines.payoutCycleId))
    .where(and(eq(mpPayoutLines.tenantId, tenantId), inArray(mpPayoutLines.id, lineIds)));
  if (!rows.length) return;
  const tenant = await tenantDisplayName(db, tenantId);
  const today = new Date().toISOString().slice(0, 10);
  for (const r of rows) {
    if (!r.phone) continue;
    const templateParams = {
      name: nz(r.name), period: nz(cycleLabel(r.from, r.to)), amount: nz(rupees(r.net)),
      date: nz(formatDate(today)), mode: nz(paymentModeLabel('bank_transfer')), reference: '-', tenant: nz(tenant),
    };
    const res = await provider.sendWhatsApp({ to: r.phone, templateName, templateParams });
    if (!res.success) console.error('Interakt cycle payment notice failed', { tenantId, cycleId, error: res.error });
  }
}
