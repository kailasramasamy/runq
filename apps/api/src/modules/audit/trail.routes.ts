import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { rbacHook } from '../../hooks/rbac';
import { TrailService } from './trail.service';
import { GapScanService } from './gap-scan.service';

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
      const service = new GapScanService(request.server.db, request.tenantId);
      const result = await service.scan();
      return { data: result };
    },
  );
};
