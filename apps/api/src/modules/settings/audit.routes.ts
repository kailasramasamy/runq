import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { auditLog } from '@runq/db';
import { rbacHook } from '../../hooks/rbac';
import { paginationSchema } from '@runq/validators';

const OWNER_ROLES = ['owner'] as const;

const auditFilterSchema = z.object({
  entityType: z.string().optional(),
  entityId: z.string().uuid().optional(),
  action: z.string().optional(),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
});

export const auditRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/',
    { preHandler: [rbacHook([...OWNER_ROLES])] },
    async (request) => {
      const { page, limit } = paginationSchema.parse(request.query);
      const filters = auditFilterSchema.parse(request.query);
      const offset = (page - 1) * limit;

      const where = and(
        eq(auditLog.tenantId, request.tenantId),
        filters.entityType ? eq(auditLog.entityType, filters.entityType) : undefined,
        filters.entityId ? eq(auditLog.entityId, filters.entityId) : undefined,
        filters.action ? eq(auditLog.action, filters.action) : undefined,
        filters.dateFrom ? gte(auditLog.createdAt, new Date(filters.dateFrom)) : undefined,
        filters.dateTo ? lte(auditLog.createdAt, new Date(filters.dateTo)) : undefined,
      );

      const [rows, countResult] = await Promise.all([
        request.server.db
          .select()
          .from(auditLog)
          .where(where)
          .orderBy(desc(auditLog.createdAt))
          .limit(limit)
          .offset(offset),
        request.server.db
          .select({ count: auditLog.id })
          .from(auditLog)
          .where(where),
      ]);

      const total = countResult.length;
      const totalPages = Math.ceil(total / limit);

      return {
        data: rows,
        meta: { page, limit, total, totalPages },
      };
    },
  );
};
