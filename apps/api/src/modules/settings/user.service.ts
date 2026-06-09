import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { users, userTenants, employees, designations, tenants } from '@runq/db';
import type { Db } from '@runq/db';
import type { User } from '@runq/types';
import { sanitizeModuleCodes } from '@runq/types';
import argon2 from 'argon2';
import { NotFoundError, ConflictError, ForbiddenError } from '../../utils/errors';
import { sendEmail } from '../../utils/email';
import { userInvite } from '../../utils/email-templates';
import { getTenantName } from '../../utils/tenant-name';
import { normalisePhone } from '../../utils/phone';

// Roles only a tenant owner may create or assign. An `hr` admin can provision
// and manage staff logins (viewer/hr) but must never mint or promote to an
// owner/accountant account — that would be a privilege escalation.
const OWNER_ASSIGNABLE_ROLES = new Set(['owner', 'client_owner', 'accountant']);
const isOwnerRole = (role: string) => role === 'owner' || role === 'client_owner';

export interface CreateUserInput {
  name: string;
  role: 'owner' | 'accountant' | 'viewer' | 'hr';
  // Email path (web/desktop login): both required together. Phone path
  // (mobile OTP-only staff): `phone` set, email/password synthesised below.
  email?: string;
  password?: string;
  phone?: string;
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  role?: 'owner' | 'accountant' | 'viewer' | 'hr';
  isActive?: boolean;
  // Per-user module grant. `null` resets to "inherit all tenant modules";
  // an array restricts the user to that subset (capped by the tenant ceiling).
  modules?: string[] | null;
}

/** A tenant user plus their per-membership module grant (null = inherit). */
export type UserWithModules = User & { modules: string[] | null };

export interface EligibleEmployee {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  designation: string | null;
}

export class UserService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async list(): Promise<UserWithModules[]> {
    // Multi-tenant: list users by membership in the active tenant, not by
    // their home tenant. The same user may be a member of multiple tenants
    // with different roles — surface the role for THIS tenant.
    const rows = await this.db
      .select({
        id: users.id,
        homeTenantId: users.tenantId,
        email: users.email,
        name: users.name,
        membershipRole: userTenants.role,
        membershipModules: userTenants.modules,
        isActive: users.isActive,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(userTenants)
      .innerJoin(users, eq(users.id, userTenants.userId))
      .where(eq(userTenants.tenantId, this.tenantId));

    return rows.map((r) => ({
      id: r.id,
      tenantId: this.tenantId,
      email: r.email,
      name: r.name,
      role: r.membershipRole,
      modules: r.membershipModules ?? null,
      isActive: r.isActive,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  async listEligibleEmployees(): Promise<EligibleEmployee[]> {
    // Employees that can still be turned into a login account: active and not
    // already linked to a user in THIS tenant. Eligible if they have an email
    // (web/desktop login) OR a phone (mobile OTP-only staff). The user link is
    // by email (case-insensitive) OR by digit-normalised phone — the same two
    // keys `create()` and the OTP login path resolve against.
    const empDigits = sql`regexp_replace(coalesce(${employees.phone}, ''), '\\D', '', 'g')`;
    const linkExpr = or(
      sql`lower(${users.email}) = lower(${employees.email})`,
      sql`${users.phone} <> '' AND (${empDigits} = ${users.phone} OR ${empDigits} = '91' || ${users.phone})`,
    );
    const rows = await this.db
      .select({
        id: employees.id,
        firstName: employees.firstName,
        lastName: employees.lastName,
        email: employees.email,
        phone: employees.phone,
        designation: designations.name,
      })
      .from(employees)
      .leftJoin(designations, eq(designations.id, employees.designationId))
      .leftJoin(users, linkExpr)
      .leftJoin(
        userTenants,
        and(eq(userTenants.userId, users.id), eq(userTenants.tenantId, this.tenantId)),
      )
      .where(and(
        eq(employees.tenantId, this.tenantId),
        eq(employees.status, 'active'),
        or(sql`${employees.email} IS NOT NULL`, sql`${employees.phone} IS NOT NULL`),
        isNull(employees.deletedAt),
        isNull(userTenants.id),
      ));

    return rows.map((r) => ({
      id: r.id,
      name: [r.firstName, r.lastName].filter(Boolean).join(' '),
      email: r.email,
      phone: r.phone,
      designation: r.designation,
    }));
  }

  async create(input: CreateUserInput, actingRole: string, invitedByUserId?: string): Promise<User> {
    if (!isOwnerRole(actingRole) && OWNER_ASSIGNABLE_ROLES.has(input.role)) {
      throw new ForbiddenError('Only an owner can create owner or accountant users');
    }
    // Two provisioning paths: an email login (web/desktop) or an OTP-only phone
    // login (mobile staff). `buildIdentity` resolves both to a concrete user row
    // shape so the dedupe + insert below is path-agnostic.
    const identity = await this.buildIdentity(input);

    // Attach to this tenant if the person already exists globally (by email or
    // phone) instead of minting a duplicate; otherwise create the user.
    const existing = await this.findUser(identity.email, identity.phone);
    let userRow: typeof users.$inferSelect;

    if (existing) {
      const [membership] = await this.db
        .select({ id: userTenants.id })
        .from(userTenants)
        .where(and(eq(userTenants.userId, existing.id), eq(userTenants.tenantId, this.tenantId)))
        .limit(1);
      if (membership) throw new ConflictError('User is already a member of this tenant');
      if (identity.phone && !existing.phone) {
        await this.db.update(users).set({ phone: identity.phone }).where(eq(users.id, existing.id));
      }
      userRow = existing;
    } else {
      const [row] = await this.db
        .insert(users)
        .values({
          tenantId: this.tenantId,
          email: identity.email,
          name: input.name,
          phone: identity.phone,
          role: input.role,
          passwordHash: identity.passwordHash,
        })
        .returning();
      userRow = row!;
    }

    await this.db
      .insert(userTenants)
      .values({ userId: userRow.id, tenantId: this.tenantId, role: input.role })
      .onConflictDoNothing();

    // Only the email path gets an invite — synth `.local` addresses are non-routable.
    if (identity.sendInvite) {
      this.sendInviteEmail({ name: input.name, email: identity.email, role: input.role }, invitedByUserId)
        .catch((err) => console.error('Invite email failed:', err));
    }
    return { ...this.toUser(userRow), role: input.role };
  }

  // Resolve a create request to a concrete login identity. Email path needs a
  // password; phone path synthesises a non-routable email + random hash (the
  // user signs in via mobile OTP, never a password) and keys off the same
  // normalised phone the OTP login resolves against.
  private async buildIdentity(input: CreateUserInput): Promise<{
    email: string;
    phone: string | null;
    passwordHash: string;
    sendInvite: boolean;
  }> {
    const phone = input.phone ? normalisePhone(input.phone) : null;
    if (input.email) {
      if (!input.password) throw new ConflictError('A password is required for an email login');
      return { email: input.email, phone, passwordHash: await argon2.hash(input.password), sendInvite: true };
    }
    if (!phone || phone.length < 10) throw new ConflictError('A valid phone or email is required');
    const passwordHash = await argon2.hash(randomBytes(32).toString('hex'));
    return { email: `phone-${phone}@runq.local`, phone, passwordHash, sendInvite: false };
  }

  private async findUser(email: string, phone: string | null) {
    const match = phone ? or(eq(users.email, email), eq(users.phone, phone)) : eq(users.email, email);
    const [row] = await this.db.select().from(users).where(match).limit(1);
    return row;
  }

  private async sendInviteEmail(
    input: { name: string; email: string; role: string },
    invitedByUserId?: string,
  ): Promise<void> {
    const companyName = await getTenantName(this.db, this.tenantId);

    let invitedBy = companyName;
    if (invitedByUserId) {
      const [inviter] = await this.db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, invitedByUserId))
        .limit(1);
      if (inviter) invitedBy = inviter.name;
    }

    const loginUrl = process.env.CORS_ORIGIN || 'http://localhost:4003';
    const template = userInvite({
      userName: input.name,
      email: input.email,
      role: input.role,
      invitedBy,
      companyName,
      loginUrl,
    });

    await sendEmail({ to: input.email, fromName: companyName, ...template });
  }

  async update(id: string, input: UpdateUserInput, actingRole: string): Promise<User> {
    // Verify membership in this tenant first.
    const [membership] = await this.db
      .select({ id: userTenants.id, role: userTenants.role })
      .from(userTenants)
      .where(and(eq(userTenants.userId, id), eq(userTenants.tenantId, this.tenantId)))
      .limit(1);
    if (!membership) throw new NotFoundError('User');

    // Escalation guard: a non-owner admin (hr) may manage staff but never touch
    // an owner/accountant membership, nor promote anyone into those roles.
    if (!isOwnerRole(actingRole)) {
      if (OWNER_ASSIGNABLE_ROLES.has(membership.role)) {
        throw new ForbiddenError('Only an owner can modify owner or accountant users');
      }
      if (input.role && OWNER_ASSIGNABLE_ROLES.has(input.role)) {
        throw new ForbiddenError('Only an owner can assign the owner or accountant role');
      }
    }

    // Role + isActive changes are scoped to the active tenant via user_tenants.
    // Name/email changes apply to the user record (global identity).
    if (input.role) {
      await this.db
        .update(userTenants)
        .set({ role: input.role, updatedAt: new Date() })
        .where(eq(userTenants.id, membership.id));
    }
    if (input.name || input.email || input.isActive !== undefined) {
      const patch: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
      if (input.name) patch.name = input.name;
      if (input.email) patch.email = input.email;
      if (input.isActive !== undefined) patch.isActive = input.isActive;
      await this.db.update(users).set(patch).where(eq(users.id, id));
    }
    // Module grant lives on the membership row. `null` clears it (inherit all
    // tenant modules); an array is sanitized and capped by what the tenant has
    // actually enabled, so a stale code can never grant beyond the ceiling.
    if (input.modules !== undefined) {
      const value = input.modules === null ? null : await this.capToTenant(input.modules);
      await this.db
        .update(userTenants)
        .set({ modules: value, updatedAt: new Date() })
        .where(eq(userTenants.id, membership.id));
    }

    const [row] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!row) throw new NotFoundError('User');
    const finalRole = input.role ?? (await this.fetchMembershipRole(id));
    return { ...this.toUser(row), role: finalRole };
  }

  // Intersect a requested module list with the tenant's enabled modules so a
  // user can never be granted a module the tenant hasn't turned on.
  private async capToTenant(requested: string[]): Promise<string[]> {
    const [tenant] = await this.db
      .select({ enabledModules: tenants.enabledModules })
      .from(tenants)
      .where(eq(tenants.id, this.tenantId))
      .limit(1);
    const enabled = new Set(sanitizeModuleCodes(tenant?.enabledModules ?? []));
    return sanitizeModuleCodes(requested).filter((code) => enabled.has(code));
  }

  private async fetchMembershipRole(userId: string): Promise<User['role']> {
    const [row] = await this.db
      .select({ role: userTenants.role })
      .from(userTenants)
      .where(and(eq(userTenants.userId, userId), eq(userTenants.tenantId, this.tenantId)))
      .limit(1);
    return row?.role ?? 'viewer';
  }

  async delete(id: string, requestingUserId: string, actingRole: string): Promise<void> {
    // "Delete" = remove the user's membership in THIS tenant (the user record
    // itself stays, since they may belong to other tenants).
    if (id === requestingUserId) {
      throw new ForbiddenError('Cannot remove yourself from this tenant');
    }

    const [target] = await this.db
      .select({ role: userTenants.role })
      .from(userTenants)
      .where(and(eq(userTenants.userId, id), eq(userTenants.tenantId, this.tenantId)))
      .limit(1);

    if (!target) throw new NotFoundError('User');

    // Escalation guard: a non-owner admin (hr) can't remove owner/accountant users.
    if (!isOwnerRole(actingRole) && OWNER_ASSIGNABLE_ROLES.has(target.role)) {
      throw new ForbiddenError('Only an owner can remove owner or accountant users');
    }

    // Don't let the last owner be removed — would leave the tenant unmanageable.
    if (target.role === 'owner' || target.role === 'client_owner') {
      const [ownerCount] = await this.db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(userTenants)
        .where(and(
          eq(userTenants.tenantId, this.tenantId),
          sql`${userTenants.role} IN ('owner', 'client_owner')`,
        ));

      if ((ownerCount?.count ?? 0) <= 1) {
        throw new ConflictError('Cannot remove the last owner');
      }
    }

    await this.db
      .delete(userTenants)
      .where(and(eq(userTenants.userId, id), eq(userTenants.tenantId, this.tenantId)));
  }

  private toUser(row: typeof users.$inferSelect): User {
    return {
      id: row.id,
      tenantId: row.tenantId,
      email: row.email,
      name: row.name,
      role: row.role,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
