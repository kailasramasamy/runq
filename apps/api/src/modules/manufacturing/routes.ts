import { FastifyPluginAsync } from 'fastify';
import { bomRoutes } from './bom.routes';
import { woRoutes } from './wo.routes';
import { dashboardRoute, reportsRoutes } from './reports.routes';
import { productionRoutes } from './production.routes';
import { reclaimRoutes } from './reclaim.routes';
import { drawRoutes } from './draw.routes';
import { mfgStockRoutes, mfgWarehouseRoutes } from './stock.routes';

export const manufacturingRoutes: FastifyPluginAsync = async (app) => {
  await app.register(bomRoutes, { prefix: '/boms' });
  await app.register(woRoutes, { prefix: '/wos' });
  // Unplanned production at POST /api/v1/manufacturing/production{,/preview}
  await app.register(productionRoutes, { prefix: '/production' });
  // FG teardown back to raw material at /api/v1/manufacturing/reclaims
  await app.register(reclaimRoutes, { prefix: '/reclaims' });
  // Milk out now, product recorded later, at /api/v1/manufacturing/draws
  await app.register(drawRoutes, { prefix: '/draws' });
  // Stock the floor can read without the inventory module — see
  // stock.routes.ts. Same services as /inventory, a different gate.
  await app.register(mfgStockRoutes, { prefix: '/stock' });
  await app.register(mfgWarehouseRoutes, { prefix: '/warehouses' });
  // Dashboard at GET /api/v1/manufacturing/dashboard
  await app.register(dashboardRoute, { prefix: '/dashboard' });
  // Reports at GET /api/v1/manufacturing/reports/{wo-summary,yield-trend,bom-usage,wo-pending-close}
  await app.register(reportsRoutes, { prefix: '/reports' });
};
