import { and, eq } from 'drizzle-orm';
import { mpNodes, vendors, tenants } from '@runq/db';
import type { Db } from '@runq/db';

// Shared recipient/tenant lookups for the bill + payment WhatsApp notifiers.

/** The AP payee vendor's phone for a VMCC (its via_vmcc payout identity), or null. */
export async function payeeVendorPhone(db: Db, tenantId: string, vmccNodeId: string): Promise<string | null> {
  const [row] = await db.select({ phone: vendors.phone }).from(mpNodes)
    .innerJoin(vendors, eq(vendors.id, mpNodes.payeeVendorId))
    .where(and(eq(mpNodes.tenantId, tenantId), eq(mpNodes.id, vmccNodeId))).limit(1);
  return row?.phone ?? null;
}

/** Tenant/dairy display name for the message body; falls back to 'Dhenu'. */
export async function tenantDisplayName(db: Db, tenantId: string): Promise<string> {
  const [t] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  return t?.name ?? 'Dhenu';
}
