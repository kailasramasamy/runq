import { FastifyPluginAsync } from 'fastify';
import { purchaseOrderRoutes } from './po.routes';
import { receiveRoutes } from './receive.routes';
import { matchRoutes } from './match.routes';
import { directReceiptRoutes } from './direct-receipt.routes';

export const purchaseRoutes: FastifyPluginAsync = async (app) => {
  await app.register(purchaseOrderRoutes, { prefix: '/pos' });
  // Receive endpoints are mounted under /pos so paths are
  // /pos/:id/receive-template and /pos/:id/receive.
  await app.register(receiveRoutes, { prefix: '/pos' });
  // 3-way match — /match/preview, /match/commit.
  await app.register(matchRoutes, { prefix: '/match' });
  // Direct receipt (Phase 4) — memo qty entry; no JE.
  await app.register(directReceiptRoutes, { prefix: '/direct-receipts' });
  // Phase 5: prRoutes → /prs ; reportsRoutes → /reports ; dashboardRoutes → /dashboard
};
