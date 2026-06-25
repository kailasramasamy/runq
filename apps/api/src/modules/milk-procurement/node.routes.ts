import { FastifyPluginAsync } from 'fastify';
import { nodeFilterSchema, paginationSchema, uuidParamSchema } from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { NodeService } from './node.service';
import { resolveMpPrincipal } from './access-scope';

// Shared READ surface for nodes of every type. Writes live in typed-node.routes
// (one resource per node type). Cross-type reads (parent pickers, dispatch
// destinations, the operators page) all rely on this one listing endpoint.
const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
// list is scoped: an operator sees only the node(s) they're assigned to
const LIST_ROLES = ['owner', 'accountant', 'viewer', 'field_operator'] as const;

export const nodeRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: [rbacHook([...LIST_ROLES])] }, async (request) => {
    const pagination = paginationSchema.parse(request.query);
    const filters = nodeFilterSchema.parse(request.query);
    const principal = await resolveMpPrincipal(request);
    const service = new NodeService(request.server.db, request.tenantId);
    return service.list(filters, { page: pagination.page, limit: pagination.limit }, principal);
  });

  app.get('/:id', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const service = new NodeService(request.server.db, request.tenantId);
    return { data: await service.getById(id) };
  });
};
