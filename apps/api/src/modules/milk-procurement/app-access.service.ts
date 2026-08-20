import { and, eq, sql } from 'drizzle-orm';
import { mpCredentials, users, userTenants } from '@runq/db';
import type { Db } from '@runq/db';
import { normalisePhone } from '../../utils/phone';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { upsertCredential } from './credentials.service';

// Web roles that may operate the app as a tenant admin. A farmer/operator gets
// their credential from their own record; this list is deliberately narrow so
// granting app access can't quietly hand a viewer the whole network.
const GRANTABLE_ROLES = new Set(['owner', 'client_owner', 'accountant']);

export interface AppAccessRow {
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  /** True when an active credential exists — they can sign in to Dhenu. */
  granted: boolean;
  /** Which persona the credential grants (null when never provisioned). */
  credentialRole: string | null;
  /** False when the role is not one we grant app access to. */
  grantable: boolean;
}

/**
 * Who in this tenant can sign in to the Dhenu app, and the grant/revoke that
 * changes it — the web counterpart to `/auth/mp/*`.
 *
 * Login resolves a phone against `mp_credentials`, so a tenant owner with no
 * credential is turned away however privileged their web account is. This is
 * the only place that provisions one for a web user.
 */
export class MpAppAccessService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  /** Every member of the tenant with their current Dhenu app-access state. */
  async list(): Promise<AppAccessRow[]> {
    const rows = await this.db
      .select({
        userId: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
        role: userTenants.role,
        credentialRole: mpCredentials.role,
        credentialActive: mpCredentials.isActive,
      })
      .from(userTenants)
      .innerJoin(users, eq(users.id, userTenants.userId))
      // Match on the user link OR the phone: web-created credentials start
      // unlinked (user_id is filled on first login), and a farmer/operator who
      // later gets a web account is the same person on the same number.
      .leftJoin(mpCredentials, and(
        eq(mpCredentials.tenantId, this.tenantId),
        sql`(${mpCredentials.userId} = ${users.id} OR ${digits(mpCredentials.phone)} = ${digits(users.phone)})`,
      ))
      .where(eq(userTenants.tenantId, this.tenantId));

    // One row per user: the join can match twice (once by link, once by phone)
    // when a user has both an old unlinked credential and a linked one — an
    // active credential is the answer that matters, so it wins.
    const byUser = new Map<string, AppAccessRow>();
    for (const r of rows) {
      const row: AppAccessRow = {
        userId: r.userId,
        name: r.name,
        email: r.email,
        phone: r.phone ?? null,
        role: r.role,
        granted: r.credentialActive === true,
        credentialRole: r.credentialRole ?? null,
        grantable: GRANTABLE_ROLES.has(r.role),
      };
      const seen = byUser.get(r.userId);
      if (!seen || (row.granted && !seen.granted)) byUser.set(r.userId, row);
    }
    return [...byUser.values()];
  }

  /** Provision (or re-activate) the admin credential for a tenant member. */
  async grant(userId: string): Promise<AppAccessRow> {
    const member = await this.requireMember(userId);
    if (!GRANTABLE_ROLES.has(member.role)) {
      throw new ValidationError(
        `App access is granted to owners and accountants; ${member.name} is a ${member.role}`,
      );
    }
    const phone = normalisePhone(member.phone ?? '');
    if (phone.length < 10) {
      throw new ValidationError(`${member.name} has no phone number — that is the Dhenu login handle`);
    }
    // Credentials are unique per (tenant, phone), so granting on a number that
    // already belongs to a farmer or operator would REWRITE their credential to
    // 'admin' and strand them out of their own app. Refuse instead.
    const existing = await this.credentialFor(phone);
    if (existing && existing.role !== 'admin') {
      throw new ValidationError(
        `${member.phone} is already the Dhenu login for a ${existing.role.replace('_', ' ')} — use a different number`,
      );
    }
    await upsertCredential(this.db, { tenantId: this.tenantId, phone, role: 'admin', userId });
    return this.rowFor(userId);
  }

  /**
   * Withdraw app access. Deactivates rather than deletes: the credential also
   * carries the social binding and bind-attempt counter, and a re-grant should
   * pick up where it left off rather than reset it.
   */
  async revoke(userId: string): Promise<AppAccessRow> {
    const member = await this.requireMember(userId);
    const phone = normalisePhone(member.phone ?? '');
    // Scoped to 'admin' rows: a farmer/operator credential is owned by their own
    // record, and revoking web access must never cut off their app login.
    await this.db.update(mpCredentials)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(
        eq(mpCredentials.tenantId, this.tenantId),
        eq(mpCredentials.role, 'admin'),
        sql`(${mpCredentials.userId} = ${userId}${phone.length >= 10 ? sql` OR ${digits(mpCredentials.phone)} = ${phone}` : sql``})`,
      ));
    return this.rowFor(userId);
  }

  private async requireMember(userId: string) {
    const [member] = await this.db
      .select({ name: users.name, phone: users.phone, role: userTenants.role })
      .from(userTenants)
      .innerJoin(users, eq(users.id, userTenants.userId))
      .where(and(eq(userTenants.tenantId, this.tenantId), eq(userTenants.userId, userId)))
      .limit(1);
    if (!member) throw new NotFoundError('User is not a member of this tenant');
    return member;
  }

  /** Any credential on this phone in this tenant (unique per tenant+phone). */
  private async credentialFor(phone: string) {
    const [row] = await this.db
      .select({ role: mpCredentials.role })
      .from(mpCredentials)
      .where(and(eq(mpCredentials.tenantId, this.tenantId), sql`${digits(mpCredentials.phone)} = ${phone}`))
      .limit(1);
    return row ?? null;
  }

  private async rowFor(userId: string): Promise<AppAccessRow> {
    const row = (await this.list()).find((r) => r.userId === userId);
    if (!row) throw new NotFoundError('User is not a member of this tenant');
    return row;
  }
}

// Phones are stored inconsistently (+91, spaces, leading 91), so every match
// compares digits only.
function digits(col: unknown) {
  return sql`regexp_replace(coalesce(${col}, ''), '\\D', '', 'g')`;
}
