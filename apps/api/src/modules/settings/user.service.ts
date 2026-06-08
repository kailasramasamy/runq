import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { users, userTenants, employees, designations, tenants } from '@runq/db';
import type { Db } from '@runq/db';
import type { User } from '@runq/types';
import { sanitizeModuleCodes } from '@runq/types';
import argon2 from 'argon2';
import { NotFoundError, ConflictError, ForbiddenError } from '../../utils/errors';
import { sendEmail } from '../../utils/email';
import { userInvite } from '../../utils/email-templates';
import { getTenantName } from '../../utils/tenant-name';

export interface CreateUserInput {
  email: string;
  name: string;
  password: string;
  role: 'owner' | 'accountant' | 'viewer' | 'hr';
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
  email: string;
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
    // Employees that can still be turned into a login account: active, with an
    // email on file, and not already linked to a user in THIS tenant. The link
    // is by email (case-insensitive) — the same key `create()` uses below.
    const rows = await this.db
      .select({
        id: employees.id,
        firstName: employees.firstName,
        lastName: employees.lastName,
        email: employees.email,
        designation: designations.name,
      })
      .from(employees)
      .leftJoin(designations, eq(designations.id, employees.designationId))
      .leftJoin(users, sql`lower(${users.email}) = lower(${employees.email})`)
      .leftJoin(
        userTenants,
        and(eq(userTenants.userId, users.id), eq(userTenants.tenantId, this.tenantId)),
      )
      .where(and(
        eq(employees.tenantId, this.tenantId),
        eq(employees.status, 'active'),
        isNotNull(employees.email),
        isNull(employees.deletedAt),
        isNull(userTenants.id),
      ));

    return rows.map((r) => ({
      id: r.id,
      name: [r.firstName, r.lastName].filter(Boolean).join(' '),
      email: r.email!,
      designation: r.designation,
    }));
  }

  async create(input: CreateUserInput, invitedByUserId?: string): Promise<User> {
    // If the email already exists as a user globally, attach them to this
    // tenant instead of creating a duplicate. (For inviting external CAs the
    // proper flow is the join_tenant invite link — this path is for owners
    // adding internal team members.)
    const [existing] = await this.db
      .select({ id: users.id, isActive: users.isActive })
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);

    let userId: string;
    let userRow: typeof users.$inferSelect;

    if (existing) {
      // Already a member of this tenant?
      const [membership] = await this.db
        .select({ id: userTenants.id })
        .from(userTenants)
        .where(and(eq(userTenants.userId, existing.id), eq(userTenants.tenantId, this.tenantId)))
        .limit(1);
      if (membership) throw new ConflictError('User is already a member of this tenant');
      userId = existing.id;
      const [row] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
      userRow = row!;
    } else {
      const passwordHash = await argon2.hash(input.password);
      const [row] = await this.db
        .insert(users)
        .values({ tenantId: this.tenantId, email: input.email, name: input.name, role: input.role, passwordHash })
        .returning();
      userId = row!.id;
      userRow = row!;
    }

    // Attach to the active tenant.
    await this.db
      .insert(userTenants)
      .values({ userId, tenantId: this.tenantId, role: input.role })
      .onConflictDoNothing();

    this.sendInviteEmail(input, invitedByUserId).catch((err) =>
      console.error('Invite email failed:', err),
    );

    return { ...this.toUser(userRow), role: input.role };
  }

  private async sendInviteEmail(input: CreateUserInput, invitedByUserId?: string): Promise<void> {
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

  async update(id: string, input: UpdateUserInput): Promise<User> {
    // Verify membership in this tenant first.
    const [membership] = await this.db
      .select({ id: userTenants.id })
      .from(userTenants)
      .where(and(eq(userTenants.userId, id), eq(userTenants.tenantId, this.tenantId)))
      .limit(1);
    if (!membership) throw new NotFoundError('User');

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

  async delete(id: string, requestingUserId: string): Promise<void> {
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
