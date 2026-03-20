import Fastify from 'fastify';
import cors from '@fastify/cors';
import { dbPlugin } from './plugins/db';
import { redisPlugin } from './plugins/redis';
import { authPlugin } from './plugins/auth';
import { tenantContextPlugin } from './plugins/tenant-context';
import { errorHandlerPlugin } from './plugins/error-handler';
import { authRoutes } from './modules/auth/routes';
import { apRoutes } from './modules/ap/routes';
import { arRoutes } from './modules/ar/routes';
import { bankingRoutes } from './modules/banking/routes';
import { pgReconRoutes } from './modules/pg-recon/routes';
import { dashboardRoutes } from './modules/dashboard/routes';
import { settingsRoutes } from './modules/settings/routes';
import { webhookRoutes } from './modules/webhook/routes';

export async function buildApp() {
  const app = Fastify({ logger: true });

  // CORS
  await app.register(cors, { origin: true });

  // Infrastructure plugins
  await app.register(errorHandlerPlugin);
  await app.register(dbPlugin);
  await app.register(redisPlugin);
  await app.register(authPlugin);
  await app.register(tenantContextPlugin);

  // Public routes (no auth required)
  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(webhookRoutes, { prefix: '/api/v1/webhooks' });

  // Protected routes
  await app.register(async (scope) => {
    scope.addHook('onRequest', scope.authenticate);

    await scope.register(apRoutes, { prefix: '/api/v1/ap' });
    await scope.register(arRoutes, { prefix: '/api/v1/ar' });
    await scope.register(bankingRoutes, { prefix: '/api/v1/banking' });
    await scope.register(pgReconRoutes, { prefix: '/api/v1/pg-recon' });
    await scope.register(dashboardRoutes, { prefix: '/api/v1/dashboard' });
    await scope.register(settingsRoutes, { prefix: '/api/v1/settings' });
  });

  // Health check
  app.get('/health', async () => ({ status: 'ok' }));

  return app;
}
