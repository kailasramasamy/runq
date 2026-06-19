import { sql } from 'drizzle-orm';
import { mpCredentials } from '@runq/db';
import type { Db } from '@runq/db';
import { normalisePhone } from '../../utils/phone';

// Accepts the request db or a transaction, so callers can provision inside the
// same txn that creates the farmer/operator.
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface UpsertCredentialInput {
  tenantId: string;
  phone: string;
  dateOfBirth: string; // YYYY-MM-DD
  role: 'farmer' | 'field_operator';
  farmerId?: string | null;
  userId?: string | null;
}

/**
 * Provision (or refresh) a Dhenu login credential — the web-admin counterpart
 * to the `/auth/mp/*` login. Lets the owner set a farmer/operator up for mobile
 * sign-in (phone + DOB) without ever touching `employees`.
 *
 * Idempotent on (tenant, phone): re-saving a farmer or adding a new operator
 * comp-term for the same phone updates the one credential rather than
 * duplicating it. A blank/short phone is skipped — phone is the login handle.
 * Editing the DOB clears the throttle so a corrected birth-date unlocks login.
 */
export async function upsertCredential(db: Db | Tx, input: UpsertCredentialInput): Promise<void> {
  const phone = normalisePhone(input.phone);
  if (phone.length < 10) return;

  await db.insert(mpCredentials)
    .values({
      tenantId: input.tenantId,
      phone,
      dateOfBirth: input.dateOfBirth,
      role: input.role,
      farmerId: input.farmerId ?? null,
      userId: input.userId ?? null,
    })
    .onConflictDoUpdate({
      target: [mpCredentials.tenantId, mpCredentials.phone],
      set: {
        dateOfBirth: input.dateOfBirth,
        role: input.role,
        // Keep links already set; fill them in if newly provided.
        farmerId: sql`coalesce(${mpCredentials.farmerId}, excluded.farmer_id)`,
        userId: sql`coalesce(${mpCredentials.userId}, excluded.user_id)`,
        bindAttempts: 0,
        isActive: true,
        updatedAt: new Date(),
      },
    });
}
