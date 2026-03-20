import { FastifyPluginAsync } from 'fastify';
import { rbacHook } from '../../hooks/rbac';
import { DashboardService } from './dashboard.service';

const ALL_ROLES = ['owner', 'accountant', 'viewer'] as const;

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
};
