import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { rbacHook } from '../../hooks/rbac';
import { TrailService } from './trail.service';
import { GapScanService } from './gap-scan.service';
import { FixService } from './fix.service';

const trailParamSchema = z.object({
  entityType: z.string(),
  entityId: z.string().uuid(),
});

export const trailRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/trail/:entityType/:entityId',
    { preHandler: [rbacHook(['owner', 'accountant', 'viewer'])] },
    async (request) => {
      const { entityType, entityId } = trailParamSchema.parse(request.params);
      const service = new TrailService(request.server.db, request.tenantId);
      const trail = await service.getTrail(entityType, entityId);
      return { data: trail };
    },
  );

  app.get(
    '/gap-scan',
    { preHandler: [rbacHook(['owner', 'accountant'])] },
    async (request) => {
      const query = request.query as { days?: string };
      const days = query.days ? parseInt(query.days, 10) : 90;
      const service = new GapScanService(request.server.db, request.tenantId);
      const result = await service.scanSummary(days);
      return { data: result };
    },
  );

  const gapItemsParamSchema = z.object({ key: z.string() });

  app.get(
    '/gap-scan/:key/items',
    { preHandler: [rbacHook(['owner', 'accountant'])] },
    async (request) => {
      const { key } = gapItemsParamSchema.parse(request.params);
      const query = request.query as { days?: string };
      const days = query.days ? parseInt(query.days, 10) : 90;
      const service = new GapScanService(request.server.db, request.tenantId);
      const result = await service.getCategoryItems(key, days);
      return { data: result };
    },
  );

  app.post(
    '/fix/:entityType/:entityId',
    { preHandler: [rbacHook(['owner', 'accountant'])] },
    async (request) => {
      const { entityType, entityId } = trailParamSchema.parse(request.params);
      const service = new FixService(request.server.db, request.tenantId);

      if (entityType === 'bank_transaction') {
        const result = await service.fixBankTransaction(entityId);
        return { data: result };
      }

      return { data: { steps: [], allFixed: false, manualRequired: [`Fix not supported for ${entityType} yet`] } };
    },
  );
};
