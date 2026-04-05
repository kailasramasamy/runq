import { FastifyPluginAsync } from 'fastify';
import {
  reportPeriodSchema,
  balanceSheetQuerySchema,
  comparisonQuerySchema,
  forecastQuerySchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { ReportsService } from './reports.service';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;

export const reportsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/profit-and-loss', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const { dateFrom, dateTo } = reportPeriodSchema.parse(request.query);
    const svc = new ReportsService(request.server.db, request.tenantId);
    return { data: await svc.getProfitAndLoss(dateFrom, dateTo) };
  });

  app.get('/balance-sheet', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const { asOfDate } = balanceSheetQuerySchema.parse(request.query);
    const svc = new ReportsService(request.server.db, request.tenantId);
    return { data: await svc.getBalanceSheet(asOfDate) };
  });

  app.get('/cash-flow', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const { dateFrom, dateTo } = reportPeriodSchema.parse(request.query);
    const svc = new ReportsService(request.server.db, request.tenantId);
    return { data: await svc.getCashFlowStatement(dateFrom, dateTo) };
  });

  app.get('/expense-analytics', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const { dateFrom, dateTo } = reportPeriodSchema.parse(request.query);
    const svc = new ReportsService(request.server.db, request.tenantId);
    return { data: await svc.getExpenseAnalytics(dateFrom, dateTo) };
  });

  app.get('/revenue-analytics', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const { dateFrom, dateTo } = reportPeriodSchema.parse(request.query);
    const svc = new ReportsService(request.server.db, request.tenantId);
    return { data: await svc.getRevenueAnalytics(dateFrom, dateTo) };
  });

  app.get('/comparison', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const { type, dateFrom, dateTo } = comparisonQuerySchema.parse(request.query);
    const svc = new ReportsService(request.server.db, request.tenantId);
    return { data: await svc.getComparisonReport(type, dateFrom, dateTo) };
  });

  app.get('/cash-flow-forecast', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const { days } = forecastQuerySchema.parse(request.query);
    const svc = new ReportsService(request.server.db, request.tenantId);
    return { data: await svc.getCashFlowForecast(days) };
  });
};
