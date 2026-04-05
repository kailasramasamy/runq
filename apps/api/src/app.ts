import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { dbPlugin } from './plugins/db';
import { redisPlugin } from './plugins/redis';
import { authPlugin } from './plugins/auth';
import { tenantContextPlugin } from './plugins/tenant-context';
import { errorHandlerPlugin } from './plugins/error-handler';
import { authRoutes } from './modules/auth/routes';
import { apRoutes } from './modules/ap/routes';
import { arRoutes } from './modules/ar/routes';
import { invoicePrintRoutes } from './modules/ar/invoice-print.routes';
import { bankingRoutes } from './modules/banking/routes';
import { pgReconRoutes } from './modules/pg-recon/routes';
import { dashboardRoutes } from './modules/dashboard/routes';
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
import { workflowRoutes } from './modules/workflows/routes';
import { vendorManagementRoutes } from './modules/vendor-management/routes';
import { caPortalRoutes } from './modules/ca-portal/routes';
import { hrRoutes } from './modules/hr/routes';
import { webhookEndpointRoutes } from './modules/webhooks/webhook-endpoint.routes';

export async function buildApp() {
  const app = Fastify({ logger: true });

  // CORS
  await app.register(cors, { origin: true });

  // Infrastructure plugins
  await app.register(errorHandlerPlugin);
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
  await app.register(dbPlugin);
  await app.register(redisPlugin);
  await app.register(authPlugin);
  await app.register(tenantContextPlugin);

  // Public routes (no auth required)
  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(webhookRoutes, { prefix: '/api/v1/webhooks' });
  await app.register(invoicePrintRoutes, { prefix: '/api/v1/ar/invoices' });
  await app.register(portalRoutes, { prefix: '/api/v1/ar' });
  await app.register(vendorPortalRoutes, { prefix: '/api/v1/ap' });
  await app.register(caPortalRoutes, { prefix: '/api/v1' });

  // Protected routes
  await app.register(async (scope) => {
    scope.addHook('onRequest', scope.authenticate);

    await scope.register(apRoutes, { prefix: '/api/v1/ap' });
    await scope.register(arRoutes, { prefix: '/api/v1/ar' });
    await scope.register(bankingRoutes, { prefix: '/api/v1/banking' });
    await scope.register(pgReconRoutes, { prefix: '/api/v1/pg-recon' });
    await scope.register(dashboardRoutes, { prefix: '/api/v1/dashboard' });
    await scope.register(settingsRoutes, { prefix: '/api/v1/settings' });
    await scope.register(glRoutes, { prefix: '/api/v1/gl' });
    await scope.register(tallyRoutes, { prefix: '/api/v1/tally' });
    await scope.register(mastersRoutes, { prefix: '/api/v1/masters' });
    await scope.register(attachmentRoutes, { prefix: '/api/v1/common' });
    await scope.register(reportsRoutes, { prefix: '/api/v1/reports' });
    await scope.register(integrationRoutes, { prefix: '/api/v1/integrations' });
    await scope.register(workflowRoutes, { prefix: '/api/v1/workflows' });
    await scope.register(vendorManagementRoutes, { prefix: '/api/v1/vendor-management' });
    await scope.register(hrRoutes, { prefix: '/api/v1/hr' });
    await scope.register(webhookEndpointRoutes, { prefix: '/api/v1/webhook-endpoints' });
  });

  // Health check
  app.get('/health', async () => ({ status: 'ok' }));

  return app;
}
