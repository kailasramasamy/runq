import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { desc, eq, and, gte, lte, sql, SQL } from 'drizzle-orm';
import { platformAuditLog, platformUsers } from '@runq/db';

const listQuerySchema = z.object({
  platformUserId: z.string().uuid().optional(),
  action: z.string().optional(),
  targetType: z.string().optional(),
  targetTenantId: z.string().uuid().optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  limit: z.coerce.number().min(1).max(200).default(50),
  offset: z.coerce.number().min(0).default(0),
});

export const adminAuditRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/audit-log',
    {
      preHandler: [app.authenticatePlatform, app.requirePlatformRole('super_admin', 'support', 'read_only')],
    },
    async (request) => {
      const q = listQuerySchema.parse(request.query);

      const where: SQL[] = [];
      if (q.platformUserId) where.push(eq(platformAuditLog.platformUserId, q.platformUserId));
      if (q.action) where.push(eq(platformAuditLog.action, q.action));
      if (q.targetType) where.push(eq(platformAuditLog.targetType, q.targetType));
      if (q.targetTenantId) where.push(eq(platformAuditLog.targetTenantId, q.targetTenantId));
      if (q.fromDate) where.push(gte(platformAuditLog.createdAt, new Date(q.fromDate)));
      if (q.toDate) where.push(lte(platformAuditLog.createdAt, new Date(q.toDate)));

      const whereClause = where.length ? and(...where) : undefined;

      const rows = await app.db
        .select({
          id: platformAuditLog.id,
          platformUserId: platformAuditLog.platformUserId,
          actorEmail: platformUsers.email,
          actorName: platformUsers.name,
          action: platformAuditLog.action,
          targetType: platformAuditLog.targetType,
          targetId: platformAuditLog.targetId,
          targetTenantId: platformAuditLog.targetTenantId,
          metadata: platformAuditLog.metadata,
          ipAddress: platformAuditLog.ipAddress,
          createdAt: platformAuditLog.createdAt,
        })
        .from(platformAuditLog)
        .leftJoin(platformUsers, eq(platformUsers.id, platformAuditLog.platformUserId))
        .where(whereClause)
        .orderBy(desc(platformAuditLog.createdAt))
        .limit(q.limit)
        .offset(q.offset);

      const [{ count }] = await app.db
        .select({ count: sql<number>`count(*)::int` })
        .from(platformAuditLog)
        .where(whereClause);

      return { data: { rows, total: count, limit: q.limit, offset: q.offset } };
    },
  );
};
