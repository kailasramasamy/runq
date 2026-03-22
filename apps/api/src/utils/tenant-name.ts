import { eq } from 'drizzle-orm';
import { tenants } from '@runq/db';
import type { Db } from '@runq/db';

/** Fetch tenant company name for email sender name */
export async function getTenantName(db: Db, tenantId: string): Promise<string> {
  const [row] = await db
    .select({ name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  return row?.name || 'runQ';
}
