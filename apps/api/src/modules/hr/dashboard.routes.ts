import { FastifyPluginAsync } from 'fastify';
import { rbacHook } from '../../hooks/rbac';
import { HrDashboardService } from './dashboard.service';

const ALL = ['owner', 'accountant', 'viewer'] as const;

export const hrDashboardRoutes: FastifyPluginAsync = async (app) => {
  app.get('/dashboard', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const svc = new HrDashboardService(req.server.db, req.tenantId);
    return { data: await svc.summary() };
  });
};
