import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, asc, desc, eq, ilike, isNull, or, sql, SQL } from 'drizzle-orm';
import { tenants, users, plans } from '@runq/db';
import { NotFoundError } from '../../utils/errors';
import { logPlatformAction } from './audit.service';

const listQuerySchema = z.object({
  search: z.string().trim().optional(),
  status: z.enum(['trial', 'active', 'past_due', 'suspended', 'churned']).optional(),
  sort: z.enum(['createdAt', 'lastActiveAt', 'mrrCents', 'name']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  limit: z.coerce.number().min(1).max(200).default(50),
  offset: z.coerce.number().min(0).default(0),
});

const updateSchema = z.object({
  notes: z.string().nullable().optional(),
  planId: z.string().uuid().nullable().optional(),
  mrrCents: z.number().int().min(0).optional(),
});

const suspendSchema = z.object({
  reason: z.string().min(1).max(500),
});

const extendTrialSchema = z.object({
  days: z.number().int().min(1).max(365),
});

export const tenantAdminRoutes: FastifyPluginAsync = async (app) => {
  // Gate every route in this scope on platform access.
  app.addHook(
    'preHandler',
    async (request, reply) => {
      await app.authenticatePlatform(request, reply);
    },
  );

  // List tenants with search/filter/sort.
  app.get('/tenants', async (request) => {
    const q = listQuerySchema.parse(request.query);

    const where: SQL[] = [isNull(tenants.deletedAt)];
    if (q.status) where.push(eq(tenants.status, q.status));
    if (q.search) {
      where.push(or(ilike(tenants.name, `%${q.search}%`), ilike(tenants.slug, `%${q.search}%`))!);
    }
    const whereClause = and(...where);

    const sortColumn = {
      createdAt: tenants.createdAt,
      lastActiveAt: tenants.lastActiveAt,
      mrrCents: tenants.mrrCents,
      name: tenants.name,
    }[q.sort];

    const rows = await app.db
      .select({
        id: tenants.id,
        name: tenants.name,
        slug: tenants.slug,
        status: tenants.status,
        planId: tenants.planId,
        planName: plans.name,
        planCode: plans.code,
        mrrCents: tenants.mrrCents,
        trialEndsAt: tenants.trialEndsAt,
        lastActiveAt: tenants.lastActiveAt,
        createdAt: tenants.createdAt,
      })
      .from(tenants)
      .leftJoin(plans, eq(plans.id, tenants.planId))
      .where(whereClause)
      .orderBy(q.order === 'asc' ? asc(sortColumn) : desc(sortColumn))
      .limit(q.limit)
      .offset(q.offset);

    const [{ count }] = await app.db
      .select({ count: sql<number>`count(*)::int` })
      .from(tenants)
      .where(whereClause);

    return { data: { rows, total: count, limit: q.limit, offset: q.offset } };
  });

  // Get tenant detail with stats.
  app.get<{ Params: { id: string } }>('/tenants/:id', async (request) => {
    const { id } = request.params;

    const [tenant] = await app.db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
    if (!tenant) throw new NotFoundError('Tenant not found');

    const [{ userCount }] = await app.db
      .select({ userCount: sql<number>`count(*)::int` })
      .from(users)
      .where(and(eq(users.tenantId, id), eq(users.isActive, true)));

    return {
      data: {
        tenant,
        stats: { userCount },
      },
    };
  });

  // Update notes / plan / mrr.
  app.patch<{ Params: { id: string } }>(
    '/tenants/:id',
    { preHandler: [app.requirePlatformRole('super_admin', 'support', 'billing_ops')] },
    async (request) => {
      const { id } = request.params;
      const input = updateSchema.parse(request.body);

      const [updated] = await app.db
        .update(tenants)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(tenants.id, id))
        .returning();
      if (!updated) throw new NotFoundError('Tenant not found');

      await logPlatformAction(app, request, {
        action: 'tenant.update',
        targetType: 'tenant',
        targetId: id,
        targetTenantId: id,
        metadata: { changes: input },
      });

      return { data: updated };
    },
  );

  // Suspend tenant.
  app.post<{ Params: { id: string } }>(
    '/tenants/:id/suspend',
    { preHandler: [app.requirePlatformRole('super_admin', 'billing_ops')] },
    async (request) => {
      const { id } = request.params;
      const { reason } = suspendSchema.parse(request.body);

      const [updated] = await app.db
        .update(tenants)
        .set({ status: 'suspended', suspendedAt: new Date(), suspendedReason: reason, updatedAt: new Date() })
        .where(eq(tenants.id, id))
        .returning();
      if (!updated) throw new NotFoundError('Tenant not found');

      await logPlatformAction(app, request, {
        action: 'tenant.suspend',
        targetType: 'tenant',
        targetId: id,
        targetTenantId: id,
        metadata: { reason },
      });

      return { data: updated };
    },
  );

  // Reactivate tenant.
  app.post<{ Params: { id: string } }>(
    '/tenants/:id/reactivate',
    { preHandler: [app.requirePlatformRole('super_admin', 'billing_ops')] },
    async (request) => {
      const { id } = request.params;

      const [updated] = await app.db
        .update(tenants)
        .set({ status: 'active', suspendedAt: null, suspendedReason: null, updatedAt: new Date() })
        .where(eq(tenants.id, id))
        .returning();
      if (!updated) throw new NotFoundError('Tenant not found');

      await logPlatformAction(app, request, {
        action: 'tenant.reactivate',
        targetType: 'tenant',
        targetId: id,
        targetTenantId: id,
      });

      return { data: updated };
    },
  );

  // Extend trial by N days.
  app.post<{ Params: { id: string } }>(
    '/tenants/:id/extend-trial',
    { preHandler: [app.requirePlatformRole('super_admin', 'support')] },
    async (request) => {
      const { id } = request.params;
      const { days } = extendTrialSchema.parse(request.body);

      const [tenant] = await app.db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
      if (!tenant) throw new NotFoundError('Tenant not found');

      const base = tenant.trialEndsAt ?? new Date();
      const newEnd = new Date(base.getTime() + days * 86_400_000);

      const [updated] = await app.db
        .update(tenants)
        .set({ status: 'trial', trialEndsAt: newEnd, updatedAt: new Date() })
        .where(eq(tenants.id, id))
        .returning();

      await logPlatformAction(app, request, {
        action: 'tenant.extend_trial',
        targetType: 'tenant',
        targetId: id,
        targetTenantId: id,
        metadata: { days, newEnd },
      });

      return { data: updated };
    },
  );

  // Soft-delete tenant.
  app.delete<{ Params: { id: string } }>(
    '/tenants/:id',
    { preHandler: [app.requirePlatformRole('super_admin')] },
    async (request) => {
      const { id } = request.params;

      const [updated] = await app.db
        .update(tenants)
        .set({ status: 'churned', deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(tenants.id, id))
        .returning();
      if (!updated) throw new NotFoundError('Tenant not found');

      await logPlatformAction(app, request, {
        action: 'tenant.delete',
        targetType: 'tenant',
        targetId: id,
        targetTenantId: id,
      });

      return { data: updated };
    },
  );
};
