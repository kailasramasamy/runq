import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, desc, eq, sql, SQL } from 'drizzle-orm';
import { webhookEvents, tenants } from '@runq/db';
import { logPlatformAction } from './audit.service';

export const systemRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (request, reply) => {
    await app.authenticatePlatform(request, reply);
  });

  // Webhook events explorer (read-only across tenants).
  app.get('/system/webhook-events', async (request) => {
    const q = z
      .object({
        tenantId: z.string().uuid().optional(),
        status: z.enum(['received', 'processing', 'processed', 'failed']).optional(),
        limit: z.coerce.number().min(1).max(200).default(50),
        offset: z.coerce.number().min(0).default(0),
      })
      .parse(request.query);

    const where: SQL[] = [];
    if (q.tenantId) where.push(eq(webhookEvents.tenantId, q.tenantId));
    if (q.status) where.push(eq(webhookEvents.status, q.status));
    const whereClause = where.length ? and(...where) : undefined;

    const rows = await app.db
      .select({
        id: webhookEvents.id,
        tenantId: webhookEvents.tenantId,
        tenantName: tenants.name,
        eventType: webhookEvents.eventType,
        source: webhookEvents.source,
        status: webhookEvents.status,
        errorMessage: webhookEvents.errorMessage,
        retries: webhookEvents.retries,
        createdAt: webhookEvents.createdAt,
        processedAt: webhookEvents.processedAt,
      })
      .from(webhookEvents)
      .leftJoin(tenants, eq(tenants.id, webhookEvents.tenantId))
      .where(whereClause)
      .orderBy(desc(webhookEvents.createdAt))
      .limit(q.limit)
      .offset(q.offset);

    const [{ count }] = await app.db
      .select({ count: sql<number>`count(*)::int` })
      .from(webhookEvents)
      .where(whereClause);

    return { data: { rows, total: count, limit: q.limit, offset: q.offset } };
  });

  // Replay a single webhook event by resetting it to 'received'.
  app.post<{ Params: { id: string } }>(
    '/system/webhook-events/:id/replay',
    { preHandler: [app.requirePlatformRole('super_admin')] },
    async (request) => {
      const { id } = request.params;
      const [updated] = await app.db
        .update(webhookEvents)
        .set({ status: 'received', errorMessage: null, retries: 0, updatedAt: new Date() })
        .where(eq(webhookEvents.id, id))
        .returning();
      await logPlatformAction(app, request, {
        action: 'webhook.replay',
        targetType: 'webhook_event',
        targetId: id,
        targetTenantId: updated?.tenantId,
      });
      return { data: updated };
    },
  );

  // Soft-delete data tooling: mark a tenant as scheduled for hard-deletion in 30 days.
  // We just stamp deleted_at via tenant delete route; this endpoint is for the
  // "schedule purge" workflow and only super_admin can trigger it.
  app.post<{ Params: { tenantId: string } }>(
    '/system/tenant-data/:tenantId/schedule-purge',
    { preHandler: [app.requirePlatformRole('super_admin')] },
    async (request) => {
      const { tenantId } = request.params;
      // For now we just record the request in the audit log; the actual
      // purge job (Phase 8 v2) will pick up tenants where deleted_at < NOW() - 30 days.
      await logPlatformAction(app, request, {
        action: 'tenant_data.schedule_purge',
        targetType: 'tenant',
        targetId: tenantId,
        targetTenantId: tenantId,
      });
      return { data: { ok: true, scheduledFor: new Date(Date.now() + 30 * 86_400_000).toISOString() } };
    },
  );
};
