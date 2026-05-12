import type { FastifyPluginAsync } from 'fastify';
import { sql } from 'drizzle-orm';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import { rbacHook } from '../../hooks/rbac';
import { LiveMetricsService } from './live-metrics.service';
import { ReportSummariesService } from './report-summaries.service';
import { GstSummariesService } from './gst-summaries.service';
import { readOrCompute, istDateTag, istMonthTag } from './snapshot-reader';
import { HEAVY_REPORT_RATE_LIMIT } from './rate-limit';
import { DunningService } from '../ar/dunning.service';
import { invalidate } from './cache';
import { AppError } from '../../utils/errors';

const ALL_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;
const sendReminderBody = z.object({ channel: z.enum(['email', 'sms', 'whatsapp']).default('email') });

export const analyticsRoutes: FastifyPluginAsync = async (app) => {
  function svc(req: { server: { db: typeof app.db; redis: typeof app.redis }; tenantId: string; log: typeof app.log }) {
    return new LiveMetricsService(req.server.db, req.server.redis, req.tenantId, req.log);
  }

  // ─── Phase 1A: live metrics ────────────────────────────────────────────
  app.get('/cash-position', { preHandler: [rbacHook([...ALL_ROLES])] }, async (req) => ({ data: await svc(req).cashPosition() }));
  app.get('/ar-outstanding', { preHandler: [rbacHook([...ALL_ROLES])] }, async (req) => ({ data: await svc(req).arOutstanding() }));
  app.get('/ap-outstanding', { preHandler: [rbacHook([...ALL_ROLES])] }, async (req) => ({ data: await svc(req).apOutstanding() }));
  app.get('/sales-mtd',      { preHandler: [rbacHook([...ALL_ROLES])] }, async (req) => ({ data: await svc(req).salesMtd() }));
  app.get('/bills-due-week', { preHandler: [rbacHook([...ALL_ROLES])] }, async (req) => ({ data: await svc(req).billsDueThisWeek() }));
  app.get('/cash-forecast',  { preHandler: [rbacHook([...ALL_ROLES])] }, async (req) => ({ data: await svc(req).cashForecast() }));

  // ─── Phase 1B step 1: snapshot-backed metrics ──────────────────────────
  const snapshotMetric = (metricKey: string, periodKind: 'day' | 'month') =>
    async (req: { server: { db: typeof app.db; redis: typeof app.redis }; tenantId: string; log: typeof app.log }) => {
      const period = periodKind === 'day' ? istDateTag() : istMonthTag();
      const snap = await readOrCompute({
        db: req.server.db,
        redis: req.server.redis,
        logger: req.log,
        tenantId: req.tenantId,
        metricKey,
        period,
      });
      return { data: snap?.payload ?? null, computedAt: snap?.computedAt ?? null };
    };

  app.get('/ar-aging',                { preHandler: [rbacHook([...ALL_ROLES])] }, snapshotMetric('ar_aging', 'day'));
  app.get('/ap-aging',                { preHandler: [rbacHook([...ALL_ROLES])] }, snapshotMetric('ap_aging', 'day'));
  app.get('/top-overdue-customers',   { preHandler: [rbacHook([...ALL_ROLES])] }, snapshotMetric('top_overdue_customers', 'day'));
  app.get('/top-vendors-by-spend',    { preHandler: [rbacHook([...ALL_ROLES])] }, snapshotMetric('top_vendors_by_spend', 'day'));
  app.get('/top-expense-categories',  { preHandler: [rbacHook([...ALL_ROLES])] }, snapshotMetric('top_expense_categories', 'month'));

  // ─── Phase 1B step 2: trend metrics ────────────────────────────────────
  app.get('/revenue-vs-expense-12mo', { preHandler: [rbacHook([...ALL_ROLES])] }, snapshotMetric('revenue_vs_expense_12mo', 'month'));
  app.get('/bank-balance-trend-90d',  { preHandler: [rbacHook([...ALL_ROLES])] }, snapshotMetric('bank_balance_trend_90d', 'day'));
  app.get('/dso-trend-6mo',           { preHandler: [rbacHook([...ALL_ROLES])] }, snapshotMetric('dso_trend_6mo', 'month'));

  // ─── Phase 1C: heavy report summaries (rate-limited) ───────────────────
  function reportSvc(req: { server: { db: typeof app.db; redis: typeof app.redis }; tenantId: string; log: typeof app.log }) {
    return new ReportSummariesService(req.server.db, req.server.redis, req.tenantId, req.log);
  }

  // Unreconciled bank txns is cheap; group it with the heavy-report scope
  // for cohesion but no rate-limit pressure.
  app.get('/unreconciled-bank-txns', { preHandler: [rbacHook([...ALL_ROLES])] }, async (req) => ({
    data: await reportSvc(req).unreconciledBankTxns(),
  }));
  app.get('/suspense-summary',       { preHandler: [rbacHook([...ALL_ROLES])] }, async (req) => ({
    data: await reportSvc(req).suspenseSummary(),
  }));
  app.get('/pending-approvals',      { preHandler: [rbacHook([...ALL_ROLES])] }, async (req) => ({
    data: await reportSvc(req).pendingApprovals(),
  }));

  // Scoped sub-plugin for rate-limited heavy reports
  await app.register(async (scope) => {
    await scope.register(rateLimit, HEAVY_REPORT_RATE_LIMIT);
    scope.get<{ Querystring: { period?: 'fy' | 'qtr' | 'month' } }>(
      '/pnl-summary',
      { preHandler: [rbacHook([...ALL_ROLES])] },
      async (req) => {
        const period = req.query.period;
        const kind = period === 'qtr' || period === 'month' ? period : 'fy';
        return { data: await reportSvc(req).pnlSummary(kind) };
      },
    );
    scope.get('/bs-summary',            { preHandler: [rbacHook([...ALL_ROLES])] }, async (req) => ({ data: await reportSvc(req).bsSummary() }));
    scope.get('/trial-balance-summary', { preHandler: [rbacHook([...ALL_ROLES])] }, async (req) => ({ data: await reportSvc(req).trialBalanceSummary() }));
    scope.get('/cash-runway',           { preHandler: [rbacHook([...ALL_ROLES])] }, async (req) => ({ data: await reportSvc(req).cashRunway() }));
    scope.get('/gross-margin',          { preHandler: [rbacHook([...ALL_ROLES])] }, async (req) => ({ data: await reportSvc(req).grossMargin() }));
    scope.get('/cash-flow-summary',     { preHandler: [rbacHook([...ALL_ROLES])] }, async (req) => ({ data: await reportSvc(req).cashFlowSummary() }));

    function gstSvc(req: { server: { db: typeof app.db; redis: typeof app.redis }; tenantId: string; log: typeof app.log }) {
      return new GstSummariesService(req.server.db, req.server.redis, req.tenantId, req.log);
    }
    scope.get('/gst/gstr1-vs-3b',          { preHandler: [rbacHook([...ALL_ROLES])] }, async (req) => ({ data: await gstSvc(req).gstr1Vs3bSummary() }));
    scope.get('/gst/2b-recon',             { preHandler: [rbacHook([...ALL_ROLES])] }, async (req) => ({ data: await gstSvc(req).gstr2bReconSummary() }));
    scope.get('/gst/liability-current',    { preHandler: [rbacHook([...ALL_ROLES])] }, async (req) => ({ data: await gstSvc(req).gstLiabilityCurrent() }));
    scope.get('/gst/vendors-not-filed',    { preHandler: [rbacHook([...ALL_ROLES])] }, async (req) => ({ data: await gstSvc(req).vendorsNotFiledSummary() }));
  });

  // ─── Action endpoints ─────────────────────────────────────────────────
  /**
   * Trigger a payment reminder for a customer's overdue invoices. Resolves
   * the invoice list server-side (so the analytics card doesn't have to
   * carry it) and delegates to the existing dunning service.
   */
  app.post<{ Params: { customerId: string } }>(
    '/customers/:customerId/send-reminder',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (req) => {
      const { channel } = sendReminderBody.parse(req.body ?? {});
      const customerId = req.params.customerId;

      const res = await req.server.db.execute(sql`
        SELECT id FROM sales_invoices
        WHERE tenant_id = ${req.tenantId}
          AND customer_id = ${customerId}
          AND balance_due > 0
          AND due_date < CURRENT_DATE
          AND status IN ('sent','partially_paid','overdue')
      `);
      const ids = ((res as unknown as { rows: Array<{ id: string }> }).rows ?? []).map((r) => r.id);
      if (ids.length === 0) {
        throw new AppError(400, 'No overdue invoices for this customer');
      }

      const dunning = new DunningService(req.server.db, req.tenantId);
      const result = await dunning.sendReminders({ invoiceIds: ids, channel });

      // Invalidate the snapshot so the next dashboard refresh shows the
      // reminder counter / activity log promptly.
      await invalidate(req.server.redis, { tenantId: req.tenantId, metricKey: 'top_overdue_customers' });

      return { data: { invoiceCount: ids.length, channel, ...result } };
    },
  );
};
