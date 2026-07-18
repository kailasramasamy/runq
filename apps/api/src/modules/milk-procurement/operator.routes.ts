import { FastifyPluginAsync } from 'fastify';
import {
  createNodeOperatorSchema,
  updateNodeOperatorSchema,
  nodeOperatorFilterSchema,
  operatorCompQuerySchema,
  paginationSchema,
  uuidParamSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { NodeOperatorService } from './operator.service';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;

export const operatorRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const pagination = paginationSchema.parse(request.query);
    const filters = nodeOperatorFilterSchema.parse(request.query);
    const service = new NodeOperatorService(request.server.db, request.tenantId);
    return service.list(filters, { page: pagination.page, limit: pagination.limit });
  });

  // commission for a node over a period — static path before /:id
  app.get('/commission', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const q = operatorCompQuerySchema.parse(request.query);
    const service = new NodeOperatorService(request.server.db, request.tenantId);
    return { data: await service.computeComp(q) };
  });

  // The signed-in operator's own comp terms + this month's earning. Self-scoped
  // by user_id, so field_operator is allowed (unlike the admin reads above).
  app.get('/me', { preHandler: [rbacHook([...READ_ROLES, 'field_operator'])] }, async (request) => {
    const service = new NodeOperatorService(request.server.db, request.tenantId);
    const today = new Date().toISOString().slice(0, 10);
    return { data: await service.self(request.user!.userId, today) };
  });

  app.get('/:id', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const service = new NodeOperatorService(request.server.db, request.tenantId);
    return { data: await service.getById(id) };
  });

  app.post('/', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request, reply) => {
    const input = createNodeOperatorSchema.parse(request.body);
    const service = new NodeOperatorService(request.server.db, request.tenantId);
    return reply.status(201).send({ data: await service.create(input) });
  });

  // Edit a term in place — 409 if it already has payout history (supersede instead).
  app.put('/:id', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const input = updateNodeOperatorSchema.parse(request.body);
    const service = new NodeOperatorService(request.server.db, request.tenantId);
    return { data: await service.update(id, input) };
  });

  app.post('/:id/deactivate', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const service = new NodeOperatorService(request.server.db, request.tenantId);
    return { data: await service.deactivate(id) };
  });

  // Hard delete — only for mistakenly-added operators (409 if payout history).
  app.delete('/:id', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request, reply) => {
    const { id } = uuidParamSchema.parse(request.params);
    const service = new NodeOperatorService(request.server.db, request.tenantId);
    await service.remove(id);
    return reply.status(204).send();
  });
};
