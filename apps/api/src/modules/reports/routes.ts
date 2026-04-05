import { FastifyPluginAsync } from 'fastify';
import {
  reportPeriodSchema,
  balanceSheetQuerySchema,
  comparisonQuerySchema,
  forecastQuerySchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { ReportsService } from './reports.service';
import {
  profitAndLossToCSV,
  balanceSheetToCSV,
  cashFlowToCSV,
  expenseAnalyticsToCSV,
  revenueAnalyticsToCSV,
} from './csv-export';

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

  // --- CSV Exports ---

  app.get('/profit-and-loss/csv', { preHandler: [rbacHook([...READ_ROLES])] }, async (request, reply) => {
    const { dateFrom, dateTo } = reportPeriodSchema.parse(request.query);
    const svc = new ReportsService(request.server.db, request.tenantId);
    const data = await svc.getProfitAndLoss(dateFrom, dateTo);
    return reply
      .header('Content-Type', 'text/csv')
      .header('Content-Disposition', `attachment; filename="profit-and-loss-${dateFrom}-${dateTo}.csv"`)
      .send(profitAndLossToCSV(data));
  });

  app.get('/balance-sheet/csv', { preHandler: [rbacHook([...READ_ROLES])] }, async (request, reply) => {
    const { asOfDate } = balanceSheetQuerySchema.parse(request.query);
    const svc = new ReportsService(request.server.db, request.tenantId);
    const data = await svc.getBalanceSheet(asOfDate);
    return reply
      .header('Content-Type', 'text/csv')
      .header('Content-Disposition', `attachment; filename="balance-sheet-${data.asOfDate}.csv"`)
      .send(balanceSheetToCSV(data));
  });

  app.get('/cash-flow/csv', { preHandler: [rbacHook([...READ_ROLES])] }, async (request, reply) => {
    const { dateFrom, dateTo } = reportPeriodSchema.parse(request.query);
    const svc = new ReportsService(request.server.db, request.tenantId);
    const data = await svc.getCashFlowStatement(dateFrom, dateTo);
    return reply
      .header('Content-Type', 'text/csv')
      .header('Content-Disposition', `attachment; filename="cash-flow-${dateFrom}-${dateTo}.csv"`)
      .send(cashFlowToCSV(data));
  });

  app.get('/expense-analytics/csv', { preHandler: [rbacHook([...READ_ROLES])] }, async (request, reply) => {
    const { dateFrom, dateTo } = reportPeriodSchema.parse(request.query);
    const svc = new ReportsService(request.server.db, request.tenantId);
    const data = await svc.getExpenseAnalytics(dateFrom, dateTo);
    return reply
      .header('Content-Type', 'text/csv')
      .header('Content-Disposition', `attachment; filename="expense-analytics-${dateFrom}-${dateTo}.csv"`)
      .send(expenseAnalyticsToCSV(data));
  });

  app.get('/revenue-analytics/csv', { preHandler: [rbacHook([...READ_ROLES])] }, async (request, reply) => {
    const { dateFrom, dateTo } = reportPeriodSchema.parse(request.query);
    const svc = new ReportsService(request.server.db, request.tenantId);
    const data = await svc.getRevenueAnalytics(dateFrom, dateTo);
    return reply
      .header('Content-Type', 'text/csv')
      .header('Content-Disposition', `attachment; filename="revenue-analytics-${dateFrom}-${dateTo}.csv"`)
      .send(revenueAnalyticsToCSV(data));
  });
};
