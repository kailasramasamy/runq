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
import { AIChatService } from './ai-chat.service';
import { WidgetService } from './widget.service';
import { ScheduledReportService } from './scheduled-report.service';
import { AgentFeedService } from './agent-feed.service';
import { NotificationsService } from './notifications.service';
import { registerDeviceToken, unregisterDeviceToken } from '../../utils/push/push.service';
import { runReportNow } from '../../scheduler/report-scheduler';

const ALL_ROLES = ['owner', 'accountant', 'viewer'] as const;
const deviceTokenSchema = z.object({
  token: z.string().min(1).max(4096),
  platform: z.enum(['android', 'ios']),
});
const removeDeviceTokenSchema = z.object({ token: z.string().min(1).max(4096) });
const aiSummaryQuerySchema = z.object({ refresh: z.string().optional() });
const aiChatBodySchema = z.object({ question: z.string().min(1).max(500) });
const cashTrendQuerySchema = z.object({ days: z.coerce.number().int().min(2).max(90).optional() });
const activityQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).optional() });
const limitQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).optional() });

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
    '/cash-trend',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request) => {
      const { days = 14 } = cashTrendQuerySchema.parse(request.query);
      const service = new DashboardService(request.server.db, request.tenantId);
      const data = await service.getCashTrend(days);
      return { data };
    },
  );

  app.get(
    '/cashflow-forecast',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request) => {
      const service = new DashboardService(request.server.db, request.tenantId);
      const data = await service.getCashflowForecast();
      return { data };
    },
  );

  app.get(
    '/period-close',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request) => {
      const service = new DashboardService(request.server.db, request.tenantId);
      const data = await service.getPeriodClose();
      return { data };
    },
  );

  // Agent feed — tenant-wide history of automated work runQ has done.
  app.get(
    '/agent-feed',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request) => {
      const { limit = 10 } = limitQuerySchema.parse(request.query);
      const svc = new AgentFeedService(request.server.db, request.tenantId);
      const data = await svc.list(limit);
      return { data };
    },
  );

  // Per-user notifications.
  app.get(
    '/notifications',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request) => {
      const { limit = 20 } = limitQuerySchema.parse(request.query);
      const svc = new NotificationsService(request.server.db, request.tenantId, request.user?.userId ?? '');
      const [items, unread] = await Promise.all([svc.list(limit), svc.unreadCount()]);
      return { data: { items, unread } };
    },
  );

  app.put(
    '/notifications/mark-all-read',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request) => {
      const svc = new NotificationsService(request.server.db, request.tenantId, request.user?.userId ?? '');
      await svc.markAllRead();
      return { success: true };
    },
  );

  app.put(
    '/notifications/:id/read',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const svc = new NotificationsService(request.server.db, request.tenantId, request.user?.userId ?? '');
      await svc.markRead(id);
      return { success: true };
    },
  );

  // FCM device-token registration for mobile push.
  app.post(
    '/device-token',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request) => {
      const { token, platform } = deviceTokenSchema.parse(request.body);
      await registerDeviceToken(
        request.server.db,
        request.tenantId,
        request.user?.userId ?? '',
        token,
        platform,
      );
      return { success: true };
    },
  );

  app.post(
    '/device-token/remove',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request) => {
      const { token } = removeDeviceTokenSchema.parse(request.body);
      await unregisterDeviceToken(request.server.db, token);
      return { success: true };
    },
  );

  app.get(
    '/activity',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request) => {
      const { limit = 20 } = activityQuerySchema.parse(request.query);
      const service = new DashboardService(request.server.db, request.tenantId);
      const data = await service.getActivity(limit);
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

  app.post(
    '/ai-chat',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request) => {
      const { question } = aiChatBodySchema.parse(request.body);
      const service = new AIChatService(request.server.db, request.tenantId);
      const data = await service.ask(question);
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
