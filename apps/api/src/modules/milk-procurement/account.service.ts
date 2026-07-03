import { and, eq, isNull, or, sql } from 'drizzle-orm';
import {
  mpFarmers, mpFarmerMemberships, mpCredentials, mpCredentialIdentities,
  mpNodeOperators, users, userTenants,
} from '@runq/db';
import type { Db } from '@runq/db';
import type { MpPrincipal } from './access-scope';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * Self-serve Dhenu account deletion (Apple guideline 5.1.1(v)). Revokes the
 * caller's login and scrubs their personal data, but KEEPS GL-linked financial
 * history (pours, payout lines, ledgers, operator payouts) — anonymised via the
 * retained farmer/operator row — because the dairy's books must survive a
 * member leaving. Everything runs in one transaction, so a failure leaves the
 * account intact rather than half-deleted.
 */
export class MpAccountService {
  constructor(private db: Db, private tenantId: string) {}

  async deleteSelf(params: { userId: string; principal: MpPrincipal }): Promise<void> {
    const { userId, principal } = params;
    await this.db.transaction(async (tx) => {
      if (principal.kind === 'farmer') await this.scrubFarmer(tx, principal.farmerId);
      if (principal.kind === 'operator') await this.scrubOperators(tx, userId);
      await this.revokeLogin(tx, userId);
    });
  }

  /** Anonymise the farmer master + close active memberships; drop KYC/photo refs. */
  private async scrubFarmer(tx: Tx, farmerId: string): Promise<void> {
    await tx.update(mpFarmers).set({
      name: 'Deleted farmer', nameNative: null, nameNativeVerified: false,
      phone: null, village: null, address: null, aadhaar: null,
      cattleBreeds: null, cattleCount: null, inMilkCount: null, lat: null, lng: null,
      kycDocId: null, photoDocId: null,
      isActive: false, deletedAt: new Date(), updatedAt: new Date(),
    }).where(and(eq(mpFarmers.id, farmerId), eq(mpFarmers.tenantId, this.tenantId)));

    await tx.update(mpFarmerMemberships)
      .set({ leftOn: sql`CURRENT_DATE` })
      .where(and(
        eq(mpFarmerMemberships.tenantId, this.tenantId),
        eq(mpFarmerMemberships.farmerId, farmerId),
        isNull(mpFarmerMemberships.leftOn),
      ));
  }

  /**
   * Anonymise + deactivate every operator row for this user (name/phone are PII;
   * the row stays so mp_operator_payouts FKs and the dairy's comp history hold).
   * Matches by user_id OR phone — web-admin rows link user_id only after login.
   */
  private async scrubOperators(tx: Tx, userId: string): Promise<void> {
    const [u] = await tx.select({ phone: users.phone }).from(users).where(eq(users.id, userId)).limit(1);
    const phone = (u?.phone ?? '').replace(/\D/g, '');
    await tx.update(mpNodeOperators).set({
      name: 'Deleted operator', phone: null, isActive: false, updatedAt: new Date(),
    }).where(and(
      eq(mpNodeOperators.tenantId, this.tenantId),
      or(
        eq(mpNodeOperators.userId, userId),
        phone
          ? sql`regexp_replace(coalesce(${mpNodeOperators.phone}, ''), '\\D', '', 'g') IN (${phone}, ${'91' + phone})`
          : sql`false`,
      ),
    ));
  }

  /**
   * Kill the login: delete social identities, deactivate + tombstone the
   * credential (phone is NOT NULL + unique, so scramble rather than clear), drop
   * the tenant membership, and anonymise the shared user row only if this was
   * their sole tenant.
   */
  private async revokeLogin(tx: Tx, userId: string): Promise<void> {
    const creds = await tx.select({ id: mpCredentials.id }).from(mpCredentials)
      .where(and(eq(mpCredentials.tenantId, this.tenantId), eq(mpCredentials.userId, userId)));
    for (const c of creds) {
      await tx.delete(mpCredentialIdentities).where(eq(mpCredentialIdentities.credentialId, c.id));
      await tx.update(mpCredentials).set({
        isActive: false, phone: `deleted-${c.id.slice(0, 12)}`,
        firebaseUid: null, authProvider: null, updatedAt: new Date(),
      }).where(eq(mpCredentials.id, c.id));
    }

    await tx.delete(userTenants)
      .where(and(eq(userTenants.userId, userId), eq(userTenants.tenantId, this.tenantId)));

    const [other] = await tx.select({ id: userTenants.id }).from(userTenants)
      .where(eq(userTenants.userId, userId)).limit(1);
    if (!other) {
      await tx.update(users).set({
        name: 'Deleted user', phone: null, firebaseUid: null, authProvider: null,
        email: `deleted-${userId}@deleted.invalid`, isActive: false, updatedAt: new Date(),
      }).where(eq(users.id, userId));
    }
  }
}
