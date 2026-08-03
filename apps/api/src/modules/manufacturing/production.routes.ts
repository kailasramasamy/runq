import { FastifyPluginAsync } from 'fastify';
import { productionPreviewSchema, recordProductionSchema } from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { ProductionEntryService } from './production-entry.service';

/**
 * Unplanned production entry — "Record Production" without a work order.
 *
 * Open to technicians (the shop-floor persona) as well as owner/accountant:
 * this exists precisely for when no manager is on shift to author the WO.
 */
// `field_operator` spelled out: no `viewer` here for the rbac alias to widen.
const ENTRY_ROLES = ['owner', 'accountant', 'technician', 'field_operator'] as const;

export const productionRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/preview',
    { preHandler: [rbacHook([...ENTRY_ROLES])] },
    async (request) => {
      const input = productionPreviewSchema.parse(request.body);
      const service = new ProductionEntryService(request.server.db, request.tenantId);
      return { data: await service.preview(input) };
    },
  );

  app.post(
    '/',
    { preHandler: [rbacHook([...ENTRY_ROLES])] },
    async (request, reply) => {
      const input = recordProductionSchema.parse(request.body);
      const service = new ProductionEntryService(request.server.db, request.tenantId);
      const { data, warnings } = await service.record(input, request.user?.userId);
      return reply.status(201).send({ data, warnings });
    },
  );
};
