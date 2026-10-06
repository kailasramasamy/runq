import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { mpNodes, mpNodeOperators, users, userTenants } from '@runq/db';
import type { Db, MpConsignmentRow } from '@runq/db';
import { getInteraktProvider } from '../../utils/messaging';
import { dateShift, litres, rupees, nz } from './mp-notify-format';

// WhatsApp shortage alert when a CC→PP load is received short of what was
// dispatched (any shortfall, no tolerance). Goes to the dispatching CC's operators and the
// tenant's owners. Fire-and-forget from ConsignmentService.receive(); may throw
// (caller fire-and-forgets with .catch). No-op unless Interakt + the template
// env var are configured.

const ADMIN_ROLES = ['owner', 'client_owner'] as const;

interface Recipient { name: string; phone: string }

/** Received less than dispatched, CC→PP only. */
export function isReportableShortage(c: MpConsignmentRow): boolean {
  return c.kind === 'cc_to_pp' && Number(c.varianceQty ?? 0) < 0;
}

// Positional body values for mp_receipt_shortage_alert ({{1}}…{{10}}).
export function shortageParams(
  recipientName: string, c: MpConsignmentRow, fromName: string, toName: string,
): Record<string, string> {
  const loss = c.varianceValue != null ? rupees(Math.abs(Number(c.varianceValue))) : '-';
  return {
    name: nz(recipientName),
    consignmentNo: nz(c.consignmentNo),
    from: nz(fromName),
    dateShift: nz(dateShift(c.collectionDate, c.shift)),
    to: nz(toName),
    dispatched: nz(litres(c.dispatchQty)),
    received: nz(litres(c.receiptQty)),
    short: nz(litres(String(Math.abs(Number(c.varianceQty ?? 0))))),
    pct: Math.abs(Number(c.variancePct ?? 0)).toFixed(1),
    loss: nz(loss),
  };
}

export async function sendShortageWhatsApp(db: Db, tenantId: string, c: MpConsignmentRow): Promise<void> {
  const provider = getInteraktProvider();
  const templateName = process.env.INTERAKT_TEMPLATE_RECEIPT_SHORTAGE;
  if (!provider || !templateName || !isReportableShortage(c)) return;

  const nodes = await db.select({ id: mpNodes.id, name: mpNodes.name }).from(mpNodes)
    .where(and(eq(mpNodes.tenantId, tenantId), inArray(mpNodes.id, [c.fromNodeId, c.toNodeId])));
  const nameOf = (id: string) => nodes.find((n) => n.id === id)?.name ?? 'centre';
  const fromName = nameOf(c.fromNodeId);
  const toName = nameOf(c.toNodeId);

  for (const r of await recipients(db, tenantId, c.fromNodeId, fromName)) {
    const templateParams = shortageParams(r.name, c, fromName, toName);
    const res = await provider.sendWhatsApp({ to: r.phone, templateName, templateParams });
    if (!res.success) {
      console.error('Interakt shortage alert failed', { tenantId, consignmentId: c.id, phone: r.phone, error: res.error });
    }
  }
}

/** CC operators + tenant owners with a phone, deduped on the last 10 digits
 * (the web admin stores +91, Dhenu OTP strips it). */
async function recipients(db: Db, tenantId: string, ccNodeId: string, ccName: string): Promise<Recipient[]> {
  const operators = await db.select({ name: mpNodeOperators.name, phone: mpNodeOperators.phone })
    .from(mpNodeOperators).where(and(
      eq(mpNodeOperators.tenantId, tenantId),
      eq(mpNodeOperators.nodeId, ccNodeId),
      eq(mpNodeOperators.isActive, true),
    ));
  const admins = await db.select({ name: users.name, phone: users.phone })
    .from(userTenants).innerJoin(users, eq(users.id, userTenants.userId))
    .where(and(
      eq(userTenants.tenantId, tenantId),
      inArray(userTenants.role, [...ADMIN_ROLES]),
      eq(users.isActive, true),
      isNotNull(users.phone),
    ));

  const seen = new Set<string>();
  const out: Recipient[] = [];
  for (const r of [...operators.map((o) => ({ ...o, name: o.name ?? ccName })), ...admins]) {
    const key = (r.phone ?? '').replace(/\D/g, '').slice(-10);
    if (key.length < 10 || seen.has(key)) continue;
    seen.add(key);
    out.push({ name: r.name, phone: r.phone! });
  }
  return out;
}
