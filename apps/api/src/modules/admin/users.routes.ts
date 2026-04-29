import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, asc, desc, eq, ilike, or, sql, SQL } from 'drizzle-orm';
import argon2 from 'argon2';
import { users, tenants, platformUsers } from '@runq/db';
import { NotFoundError, ConflictError } from '../../utils/errors';
import { logPlatformAction } from './audit.service';

const tenantUserListSchema = z.object({
  search: z.string().optional(),
  tenantId: z.string().uuid().optional(),
  role: z.enum(['owner', 'accountant', 'viewer']).optional(),
  isActive: z.coerce.boolean().optional(),
  limit: z.coerce.number().min(1).max(200).default(50),
  offset: z.coerce.number().min(0).default(0),
});

const platformUserCreateSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(255),
  password: z.string().min(8),
  role: z.enum(['super_admin', 'support', 'billing_ops', 'read_only']),
});

const platformUserPatchSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  role: z.enum(['super_admin', 'support', 'billing_ops', 'read_only']).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

export const adminUsersRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (request, reply) => {
    await app.authenticatePlatform(request, reply);
  });

  // ── Tenant users (cross-tenant search) ────────────────────────────
  app.get('/tenant-users', async (request) => {
    const q = tenantUserListSchema.parse(request.query);

    const where: SQL[] = [];
    if (q.search) where.push(or(ilike(users.email, `%${q.search}%`), ilike(users.name, `%${q.search}%`))!);
    if (q.tenantId) where.push(eq(users.tenantId, q.tenantId));
    if (q.role) where.push(eq(users.role, q.role));
    if (q.isActive !== undefined) where.push(eq(users.isActive, q.isActive));
    const whereClause = where.length ? and(...where) : undefined;

    const rows = await app.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        isActive: users.isActive,
        tenantId: users.tenantId,
        tenantName: tenants.name,
        tenantSlug: tenants.slug,
        createdAt: users.createdAt,
      })
      .from(users)
      .leftJoin(tenants, eq(tenants.id, users.tenantId))
      .where(whereClause)
      .orderBy(desc(users.createdAt))
      .limit(q.limit)
      .offset(q.offset);

    const [{ count }] = await app.db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(whereClause);

    return { data: { rows, total: count, limit: q.limit, offset: q.offset } };
  });

  // Force password reset (sets a random password & returns it).
  app.post<{ Params: { id: string } }>(
    '/tenant-users/:id/reset-password',
    { preHandler: [app.requirePlatformRole('super_admin', 'support')] },
    async (request) => {
      const { id } = request.params;
      const tempPassword = `Reset-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 6)}`;
      const hash = await argon2.hash(tempPassword);
      const [u] = await app.db.update(users).set({ passwordHash: hash, updatedAt: new Date() }).where(eq(users.id, id)).returning();
      if (!u) throw new NotFoundError('User not found');
      await logPlatformAction(app, request, {
        action: 'tenant_user.reset_password',
        targetType: 'user',
        targetId: id,
        targetTenantId: u.tenantId,
      });
      return { data: { tempPassword, user: { id: u.id, email: u.email } } };
    },
  );

  // Toggle active.
  app.post<{ Params: { id: string } }>(
    '/tenant-users/:id/toggle-active',
    { preHandler: [app.requirePlatformRole('super_admin', 'support') ] },
    async (request) => {
      const { id } = request.params;
      const [existing] = await app.db.select().from(users).where(eq(users.id, id)).limit(1);
      if (!existing) throw new NotFoundError('User not found');
      const [u] = await app.db
        .update(users)
        .set({ isActive: !existing.isActive, updatedAt: new Date() })
        .where(eq(users.id, id))
        .returning();
      await logPlatformAction(app, request, {
        action: existing.isActive ? 'tenant_user.deactivate' : 'tenant_user.activate',
        targetType: 'user',
        targetId: id,
        targetTenantId: u.tenantId,
      });
      return { data: u };
    },
  );

  // ── Platform users (the admin team) ───────────────────────────────
  app.get('/platform-users', async () => {
    const rows = await app.db
      .select({
        id: platformUsers.id,
        email: platformUsers.email,
        name: platformUsers.name,
        role: platformUsers.role,
        isActive: platformUsers.isActive,
        lastLoginAt: platformUsers.lastLoginAt,
        createdAt: platformUsers.createdAt,
      })
      .from(platformUsers)
      .orderBy(asc(platformUsers.email));
    return { data: rows };
  });

  app.post(
    '/platform-users',
    { preHandler: [app.requirePlatformRole('super_admin')] },
    async (request) => {
      const input = platformUserCreateSchema.parse(request.body);
      const [existing] = await app.db.select({ id: platformUsers.id }).from(platformUsers).where(eq(platformUsers.email, input.email)).limit(1);
      if (existing) throw new ConflictError('Email already in use');
      const passwordHash = await argon2.hash(input.password);
      const [created] = await app.db
        .insert(platformUsers)
        .values({ email: input.email, name: input.name, role: input.role, passwordHash })
        .returning({ id: platformUsers.id, email: platformUsers.email, name: platformUsers.name, role: platformUsers.role, isActive: platformUsers.isActive });
      await logPlatformAction(app, request, {
        action: 'platform_user.create',
        targetType: 'platform_user',
        targetId: created.id,
        metadata: { email: created.email, role: created.role },
      });
      return { data: created };
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/platform-users/:id',
    { preHandler: [app.requirePlatformRole('super_admin')] },
    async (request) => {
      const { id } = request.params;
      const input = platformUserPatchSchema.parse(request.body);
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (input.name !== undefined) updates.name = input.name;
      if (input.role !== undefined) updates.role = input.role;
      if (input.isActive !== undefined) updates.isActive = input.isActive;
      if (input.password) updates.passwordHash = await argon2.hash(input.password);

      const [updated] = await app.db
        .update(platformUsers)
        .set(updates)
        .where(eq(platformUsers.id, id))
        .returning({ id: platformUsers.id, email: platformUsers.email, name: platformUsers.name, role: platformUsers.role, isActive: platformUsers.isActive });
      if (!updated) throw new NotFoundError('Platform user not found');
      await logPlatformAction(app, request, {
        action: 'platform_user.update',
        targetType: 'platform_user',
        targetId: id,
        metadata: { changes: { ...input, password: input.password ? '***' : undefined } },
      });
      return { data: updated };
    },
  );
};
