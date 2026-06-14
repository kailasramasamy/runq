import { FastifyPluginAsync } from 'fastify';
import {
  createFarmerSchema,
  updateFarmerSchema,
  farmerFilterSchema,
  paginationSchema,
  uuidParamSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { FarmerService } from './farmer.service';
import { resolveMpPrincipal } from './access-scope';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;
// list is scoped: operators see their node's farmers; a farmer sees themselves
const LIST_ROLES = ['owner', 'accountant', 'viewer', 'field_operator', 'farmer'] as const;

export const farmerRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: [rbacHook([...LIST_ROLES])] }, async (request) => {
    const pagination = paginationSchema.parse(request.query);
    const filters = farmerFilterSchema.parse(request.query);
    const principal = await resolveMpPrincipal(request);
    const service = new FarmerService(request.server.db, request.tenantId);
    return service.list(filters, { page: pagination.page, limit: pagination.limit }, principal);
  });

  app.get('/:id', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const service = new FarmerService(request.server.db, request.tenantId);
    return { data: await service.getById(id) };
  });

  app.post('/', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request, reply) => {
    const input = createFarmerSchema.parse(request.body);
    const service = new FarmerService(request.server.db, request.tenantId);
    return reply.status(201).send({ data: await service.create(input) });
  });

  app.put('/:id', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const input = updateFarmerSchema.parse(request.body);
    const service = new FarmerService(request.server.db, request.tenantId);
    return { data: await service.update(id, input) };
  });

  app.post('/:id/deactivate', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const service = new FarmerService(request.server.db, request.tenantId);
    return { data: await service.deactivate(id) };
  });
};
