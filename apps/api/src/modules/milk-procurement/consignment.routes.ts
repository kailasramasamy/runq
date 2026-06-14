import { FastifyPluginAsync } from 'fastify';
import {
  createConsignmentSchema,
  receiveConsignmentSchema,
  consignmentFilterSchema,
  consignmentAvailabilitySchema,
  paginationSchema,
  uuidParamSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { ConsignmentService } from './consignment.service';
import { resolveMpPrincipal } from './access-scope';

// field_operator dispatches/receives at their node; reads are node-scoped
const READ_ROLES = ['owner', 'accountant', 'viewer', 'field_operator'] as const;
const WRITE_ROLES = ['owner', 'accountant', 'field_operator'] as const;

export const consignmentRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const pagination = paginationSchema.parse(request.query);
    const filters = consignmentFilterSchema.parse(request.query);
    const principal = await resolveMpPrincipal(request);
    const service = new ConsignmentService(request.server.db, request.tenantId);
    return service.list(filters, { page: pagination.page, limit: pagination.limit }, principal);
  });

  app.get('/available', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const q = consignmentAvailabilitySchema.parse(request.query);
    const principal = await resolveMpPrincipal(request);
    const service = new ConsignmentService(request.server.db, request.tenantId);
    return { data: await service.availability(q.nodeId, q.collectionDate, principal) };
  });

  app.get('/:id', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const principal = await resolveMpPrincipal(request);
    const service = new ConsignmentService(request.server.db, request.tenantId);
    return { data: await service.getById(id, principal) };
  });

  app.post('/', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request, reply) => {
    const input = createConsignmentSchema.parse(request.body);
    const principal = await resolveMpPrincipal(request);
    const service = new ConsignmentService(request.server.db, request.tenantId);
    return reply.status(201).send({ data: await service.dispatch(input, request.user?.userId, principal) });
  });

  app.post('/:id/receive', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const input = receiveConsignmentSchema.parse(request.body);
    const principal = await resolveMpPrincipal(request);
    const service = new ConsignmentService(request.server.db, request.tenantId);
    return { data: await service.receive(id, input, request.user?.userId, principal) };
  });

  app.post('/:id/reverse', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const principal = await resolveMpPrincipal(request);
    const service = new ConsignmentService(request.server.db, request.tenantId);
    return { data: await service.reverse(id, principal) };
  });
};
