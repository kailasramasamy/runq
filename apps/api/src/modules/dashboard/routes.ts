import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { rbacHook } from '../../hooks/rbac';
import { DashboardService } from './dashboard.service';
import { AISummaryService } from './ai-summary.service';

const ALL_ROLES = ['owner', 'accountant', 'viewer'] as const;
const aiSummaryQuerySchema = z.object({ refresh: z.string().optional() });

export const dashboardRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/summary',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request) => {
      const service = new DashboardService(request.server.db, request.tenantId);
      const data = await service.getSummary();
      return { data };
    },
  );

  app.get(
    '/payables-aging',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request) => {
      const service = new DashboardService(request.server.db, request.tenantId);
      const data = await service.getPayablesAging();
      return { data };
    },
  );

  app.get(
    '/receivables-aging',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request) => {
      const service = new DashboardService(request.server.db, request.tenantId);
      const data = await service.getReceivablesAging();
      return { data };
    },
  );

  app.get(
    '/ai-summary',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request) => {
      const { refresh } = aiSummaryQuerySchema.parse(request.query);
      const service = new AISummaryService(request.server.db, request.tenantId, request.server.redis);
      const data = await service.getSummary(refresh === 'true');
      return { data };
    },
  );
};
