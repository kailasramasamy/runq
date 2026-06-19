import Fastify, { type FastifyPluginAsync } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import websocket from '@fastify/websocket';
import { dbPlugin } from './plugins/db';
import { redisPlugin } from './plugins/redis';
import { authPlugin } from './plugins/auth';
import { tenantContextPlugin } from './plugins/tenant-context';
import { errorHandlerPlugin } from './plugins/error-handler';
import { requireModule } from './hooks/module-access';
import type { ModuleCode } from '@runq/types';
import { authRoutes } from './modules/auth/routes';
import { socialAuthRoutes } from './modules/auth/social-auth.routes';
import { mpAuthRoutes } from './modules/milk-procurement/mp-auth.routes';
import { apRoutes } from './modules/ap/routes';
import { purchaseRoutes } from './modules/purchase/routes';
import { manufacturingRoutes } from './modules/manufacturing/routes';
import { milkProcurementRoutes } from './modules/milk-procurement/routes';
import { arRoutes } from './modules/ar/routes';
import { invoicePrintRoutes } from './modules/ar/invoice-print.routes';
import { billPrintRoutes } from './modules/ap/bill-print.routes';
import { bankingRoutes } from './modules/banking/routes';
import { pgReconRoutes } from './modules/pg-recon/routes';
import { dashboardRoutes } from './modules/dashboard/routes';
import { analyticsRoutes } from './modules/analytics/routes';
import { settingsRoutes } from './modules/settings/routes';
import { webhookRoutes } from './modules/webhook/routes';
import { glRoutes } from './modules/gl/routes';
import { tallyRoutes } from './modules/tally/routes';
import { mastersRoutes } from './modules/masters/routes';
import { attachmentRoutes } from './modules/common/attachment.routes';
import { portalRoutes } from './modules/ar/portal.routes';
import { vendorPortalRoutes } from './modules/ap/vendor-portal.routes';
import { reportsRoutes } from './modules/reports/routes';
import { integrationRoutes } from './modules/integrations/routes';
import { billSyncPushRoutes } from './modules/bill-sync/push.routes';
import { billSyncAdminRoutes } from './modules/bill-sync/admin.routes';
import { workflowRoutes } from './modules/workflows/routes';
import { vendorManagementRoutes } from './modules/vendor-management/routes';
import { caPortalRoutes } from './modules/ca-portal/routes';
import { hrRoutes } from './modules/hr/routes';
import { inventoryRoutes } from './modules/inventory/routes';
import { inboxRoutes } from './modules/inbox/routes';
import { webhookEndpointRoutes } from './modules/webhooks/webhook-endpoint.routes';
import { trailRoutes } from './modules/audit/trail.routes';
import { faRoutes } from './modules/fa/routes';
import { gstRoutes } from './modules/gst/routes';
import { contactRoutes } from './modules/public/contact.routes';
import { appConfigRoutes } from './modules/public/app-config.routes';
import { otpRoutes } from './modules/public/otp.routes';
import { agentRoutes } from './modules/agent/routes';
import { supportRoutes } from './modules/support/routes';
import { helpRoutes } from './modules/help/routes';
import { supportWsRoutes } from './modules/support/ws';
import { hrHelpdeskWsRoutes } from './modules/hr/agent/ws';
import { adminRoutes } from './modules/admin/routes';

export async function buildApp() {
  const app = Fastify({ logger: true });

  // CORS
  const corsOrigin = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim())
    : true; // Allow all in dev when CORS_ORIGIN is not set
  await app.register(cors, { origin: corsOrigin, credentials: true });

  // Security
  await app.register(helmet, {
    contentSecurityPolicy: false, // Disable CSP for API — frontend handles its own
  });
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  // Infrastructure plugins
  await app.register(errorHandlerPlugin);
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
  await app.register(dbPlugin);
  await app.register(redisPlugin);
  await app.register(authPlugin);
  await app.register(tenantContextPlugin);
  await app.register(websocket);

  // Public routes (no auth required)
  await app.register(async (authScope) => {
    // Stricter rate limit on auth: 10 attempts per minute
    await authScope.register(rateLimit, { max: 10, timeWindow: '1 minute' });
    await authScope.register(authRoutes);
    await authScope.register(socialAuthRoutes);
    await authScope.register(mpAuthRoutes);
  }, { prefix: '/api/v1/auth' });
  await app.register(async (publicScope) => {
    await publicScope.register(rateLimit, { max: 5, timeWindow: '1 minute' });
    await publicScope.register(contactRoutes);
    await publicScope.register(otpRoutes);
    await publicScope.register(appConfigRoutes);
  }, { prefix: '/api/v1/public' });
  await app.register(webhookRoutes, { prefix: '/api/v1/webhooks' });
  await app.register(billSyncPushRoutes, { prefix: '/api/v1/bill-sync' });
  await app.register(invoicePrintRoutes, { prefix: '/api/v1/ar/invoices' });
  await app.register(billPrintRoutes, { prefix: '/api/v1/ap/purchase-invoices' });
  await app.register(portalRoutes, { prefix: '/api/v1/ar' });
  await app.register(vendorPortalRoutes, { prefix: '/api/v1/ap' });
  await app.register(caPortalRoutes, { prefix: '/api/v1' });

  // Protected routes
  await app.register(async (scope) => {
    scope.addHook('onRequest', scope.authenticate);
    scope.addHook('preHandler', scope.resolveTenantContext);

    // Register a module's routes behind a `requireModule` gate. The gate reads
    // request.effectiveModules (set by resolveTenantContext above), so a user
    // without the module gets a 403 before any handler runs. Encapsulated in a
    // child plugin so the preHandler applies only to that module's routes.
    const guarded = (routes: FastifyPluginAsync, prefix: string, module: ModuleCode) =>
      scope.register(async (s) => {
        s.addHook('preHandler', requireModule(module));
        await s.register(routes, { prefix });
      });

    // Finance: AR, AP, banking, GST, fixed assets, GL, Tally, PG recon.
    await guarded(apRoutes, '/api/v1/ap', 'finance');
    await guarded(arRoutes, '/api/v1/ar', 'finance');
    await guarded(bankingRoutes, '/api/v1/banking', 'finance');
    await guarded(pgReconRoutes, '/api/v1/pg-recon', 'finance');
    await guarded(glRoutes, '/api/v1/gl', 'finance');
    await guarded(tallyRoutes, '/api/v1/tally', 'finance');
    await guarded(faRoutes, '/api/v1/fa', 'finance');
    await guarded(gstRoutes, '/api/v1/gst', 'finance');
    // The four operational modules.
    await guarded(purchaseRoutes, '/api/v1/purchase', 'purchase');
    await guarded(manufacturingRoutes, '/api/v1/manufacturing', 'manufacturing');
    await guarded(inventoryRoutes, '/api/v1/inventory', 'inventory');
    await guarded(hrRoutes, '/api/v1/hr', 'hr');
    await guarded(milkProcurementRoutes, '/api/v1/milk-procurement', 'milk_procurement');

    // Shared / cross-cutting — NOT module-gated. A single-module user still
    // needs masters, settings, attachments, reports, audit, agent, etc.
    await scope.register(dashboardRoutes, { prefix: '/api/v1/dashboard' });
    await scope.register(analyticsRoutes, { prefix: '/api/v1/analytics' });
    await scope.register(settingsRoutes, { prefix: '/api/v1/settings' });
    await scope.register(mastersRoutes, { prefix: '/api/v1/masters' });
    await scope.register(attachmentRoutes, { prefix: '/api/v1/common' });
    await scope.register(reportsRoutes, { prefix: '/api/v1/reports' });
    await scope.register(integrationRoutes, { prefix: '/api/v1/integrations' });
    await scope.register(billSyncAdminRoutes, { prefix: '/api/v1/bill-sync/admin' });
    await scope.register(workflowRoutes, { prefix: '/api/v1/workflows' });
    await scope.register(vendorManagementRoutes, { prefix: '/api/v1/vendor-management' });
    await scope.register(inboxRoutes, { prefix: '/api/v1/inbox' });
    await scope.register(webhookEndpointRoutes, { prefix: '/api/v1/webhook-endpoints' });
    await scope.register(trailRoutes, { prefix: '/api/v1/audit' });
    await scope.register(agentRoutes, { prefix: '/api/v1/agent' });
    await scope.register(supportRoutes, { prefix: '/api/v1/support' });
    await scope.register(helpRoutes, { prefix: '/api/v1/help' });
  });

  // Support WebSocket — auth handled via query param token, must NOT be
  // inside the authenticated scope (which would block WS upgrade requests).
  await app.register(supportWsRoutes, { prefix: '/api/v1/support' });

  // HR helpdesk WebSocket — same query-token auth pattern, registered outside
  // the auth scope so the upgrade handshake passes.
  await app.register(hrHelpdeskWsRoutes, { prefix: '/api/v1/hr' });

  // Platform admin routes (super-admin only — gated per-route by authenticatePlatform)
  await app.register(adminRoutes, { prefix: '/api/v1/admin' });

  // Health check
  app.get('/health', async () => ({ status: 'ok' }));

  return app;
}
