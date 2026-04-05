import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  saveWidgetLayoutSchema,
  createScheduledReportSchema,
  uuidParamSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { DashboardService } from './dashboard.service';
import { AISummaryService } from './ai-summary.service';
import { WidgetService } from './widget.service';
import { ScheduledReportService } from './scheduled-report.service';
import { runReportNow } from '../../scheduler/report-scheduler';

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
    '/bank-balances',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request) => {
      const service = new DashboardService(request.server.db, request.tenantId);
      const data = await service.getBankBalances();
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

  // Widget layout
  app.get(
    '/widgets',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request) => {
      const svc = new WidgetService(request.server.db, request.tenantId);
      const data = await svc.getWidgets(request.user?.userId ?? '');
      return { data };
    },
  );

  app.put(
    '/widgets',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request) => {
      const input = saveWidgetLayoutSchema.parse(request.body);
      const svc = new WidgetService(request.server.db, request.tenantId);
      const data = await svc.saveLayout(request.user?.userId ?? '', input);
      return { data };
    },
  );

  // Scheduled reports
  app.get(
    '/scheduled-reports',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request) => {
      const svc = new ScheduledReportService(request.server.db, request.tenantId);
      const data = await svc.list();
      return { data };
    },
  );

  app.post(
    '/scheduled-reports',
    { preHandler: [rbacHook(['owner', 'accountant'])] },
    async (request, reply) => {
      const input = createScheduledReportSchema.parse(request.body);
      const svc = new ScheduledReportService(request.server.db, request.tenantId);
      const data = await svc.create(input, request.user?.userId ?? '');
      return reply.status(201).send({ data });
    },
  );

  app.put(
    '/scheduled-reports/:id/toggle',
    { preHandler: [rbacHook(['owner', 'accountant'])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const svc = new ScheduledReportService(request.server.db, request.tenantId);
      const data = await svc.toggleActive(id);
      return { data };
    },
  );

  app.delete(
    '/scheduled-reports/:id',
    { preHandler: [rbacHook(['owner'])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const svc = new ScheduledReportService(request.server.db, request.tenantId);
      await svc.delete(id);
      return { success: true };
    },
  );

  app.post(
    '/scheduled-reports/:id/run',
    { preHandler: [rbacHook(['owner', 'accountant'])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      await runReportNow(request.server.db, id, request.tenantId);
      return { success: true, message: 'Report sent successfully' };
    },
  );
};
