import { FastifyPluginAsync } from 'fastify';
import { bomRoutes } from './bom.routes';
import { woRoutes } from './wo.routes';
import { dashboardRoute, reportsRoutes } from './reports.routes';

export const manufacturingRoutes: FastifyPluginAsync = async (app) => {
  await app.register(bomRoutes, { prefix: '/boms' });
  await app.register(woRoutes, { prefix: '/wos' });
  // Dashboard at GET /api/v1/manufacturing/dashboard
  await app.register(dashboardRoute, { prefix: '/dashboard' });
  // Reports at GET /api/v1/manufacturing/reports/{wo-summary,yield-trend,bom-usage,wo-pending-close}
  await app.register(reportsRoutes, { prefix: '/reports' });
};
