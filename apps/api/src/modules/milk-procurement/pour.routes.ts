import { FastifyPluginAsync } from 'fastify';
import {
  recordPourSchema,
  pourFilterSchema,
  paginationSchema,
  uuidParamSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { PourService } from './pour.service';
import { resolveMpPrincipal } from './access-scope';

// field_operator records/reads at their node; farmer reads their own pours.
const READ_ROLES = ['owner', 'accountant', 'viewer', 'field_operator', 'farmer'] as const;
const WRITE_ROLES = ['owner', 'accountant', 'field_operator'] as const;

export const pourRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const pagination = paginationSchema.parse(request.query);
    const filters = pourFilterSchema.parse(request.query);
    const principal = await resolveMpPrincipal(request);
    const service = new PourService(request.server.db, request.tenantId);
    return service.list(filters, { page: pagination.page, limit: pagination.limit }, principal);
  });

  app.get('/:id', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const principal = await resolveMpPrincipal(request);
    const service = new PourService(request.server.db, request.tenantId);
    return { data: await service.getById(id, principal) };
  });

  app.post('/', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request, reply) => {
    const input = recordPourSchema.parse(request.body);
    const principal = await resolveMpPrincipal(request);
    const service = new PourService(request.server.db, request.tenantId);
    return reply.status(201).send({ data: await service.record(input, request.user?.userId, principal) });
  });

  app.post('/:id/reverse', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const principal = await resolveMpPrincipal(request);
    const service = new PourService(request.server.db, request.tenantId);
    return { data: await service.reverse(id, principal) };
  });
};
