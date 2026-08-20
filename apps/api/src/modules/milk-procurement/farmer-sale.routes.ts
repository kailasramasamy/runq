import { FastifyPluginAsync } from 'fastify';
import {
  createFarmerSaleSchema, farmerSaleFilterSchema, updateFarmerSaleSchema, uuidParamSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { FarmerSaleService, sellableItems } from './farmer-sale.service';
import { resolveMpPrincipal } from './access-scope';

// A farmer may read their own purchases (the service forces it to their id);
// the VMCC operator records them in the field, scoped to their own centres.
const READ_ROLES = ['owner', 'accountant', 'viewer', 'farmer', 'field_operator'] as const;
const WRITE_ROLES = ['owner', 'accountant', 'field_operator'] as const;

export const farmerSaleRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const filters = farmerSaleFilterSchema.parse(request.query);
    const principal = await resolveMpPrincipal(request);
    const service = new FarmerSaleService(request.server.db, request.tenantId);
    return { data: await service.list(filters, principal) };
  });

  // The counter catalogue: what an operator may sell besides bulk milk.
  app.get('/items', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    return { data: await sellableItems(request.server.db, request.tenantId) };
  });

  app.post('/', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request, reply) => {
    const input = createFarmerSaleSchema.parse(request.body);
    const principal = await resolveMpPrincipal(request);
    const service = new FarmerSaleService(request.server.db, request.tenantId);
    return reply.status(201).send({ data: await service.create(input, principal, request.user?.userId) });
  });

  // Correct a mis-keyed sale, or drop it outright. Both are blocked once a
  // payout cycle has recovered the amount — reverse the cycle first.
  app.patch('/:id', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const input = updateFarmerSaleSchema.parse(request.body);
    const principal = await resolveMpPrincipal(request);
    const service = new FarmerSaleService(request.server.db, request.tenantId);
    return { data: await service.update(id, input, principal, request.user?.userId) };
  });

  app.delete('/:id', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request, reply) => {
    const { id } = uuidParamSchema.parse(request.params);
    const principal = await resolveMpPrincipal(request);
    const service = new FarmerSaleService(request.server.db, request.tenantId);
    await service.remove(id, principal, request.user?.userId);
    return reply.status(204).send();
  });

  app.post('/:id/reverse', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const principal = await resolveMpPrincipal(request);
    const service = new FarmerSaleService(request.server.db, request.tenantId);
    return { data: await service.reverse(id, principal, request.user?.userId) };
  });
};
