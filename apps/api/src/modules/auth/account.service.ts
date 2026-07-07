import { and, eq } from 'drizzle-orm';
import { users, userTenants } from '@runq/db';
import type { Db } from '@runq/db';

/**
 * Self-serve account deletion for the runq mobile app (Apple guideline
 * 5.1.1(v)). Removes the caller's login and access: their membership in the
 * active tenant is dropped, and if that was their only tenant the shared user
 * row is anonymised and deactivated so the login can never be used again.
 *
 * The employee's HR record (payroll, attendance, ledgers) is the organisation's
 * data, not the individual's account — it is intentionally left intact, exactly
 * as deleting a Xero/QuickBooks user login does not erase the company's books.
 * A person removed this way can be re-invited by their admin later.
 *
 * Everything runs in one transaction, so a failure leaves the account intact
 * rather than half-deleted.
 */
export class AccountService {
  constructor(private db: Db, private tenantId: string) {}

  async deleteSelf(userId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(userTenants)
        .where(and(eq(userTenants.userId, userId), eq(userTenants.tenantId, this.tenantId)));

      // Only scrub the shared user row when this was their last tenant — a
      // multi-tenant user keeps their login for the tenants they remain in.
      const [other] = await tx
        .select({ id: userTenants.id })
        .from(userTenants)
        .where(eq(userTenants.userId, userId))
        .limit(1);
      if (!other) {
        await tx
          .update(users)
          .set({
            name: 'Deleted user',
            email: `deleted-${userId}@deleted.invalid`,
            phone: null,
            firebaseUid: null,
            authProvider: null,
            isActive: false,
            updatedAt: new Date(),
          })
          .where(eq(users.id, userId));
      }
    });
  }
}
