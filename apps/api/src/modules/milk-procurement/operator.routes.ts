import { FastifyPluginAsync } from 'fastify';
import {
  createNodeOperatorSchema,
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

  app.post('/:id/deactivate', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const service = new NodeOperatorService(request.server.db, request.tenantId);
    return { data: await service.deactivate(id) };
  });
};
