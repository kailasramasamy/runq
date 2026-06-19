import { FastifyPluginAsync } from 'fastify';
import {
  operatorPayoutComputeSchema, createOperatorPayoutSchema, operatorPayoutFilterSchema, paginationSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { OperatorPayoutService } from './operator-payout.service';
import { resolveMpPrincipal } from './access-scope';

// A CC/PP manager (field_operator) may compute & record operator payouts; the
// service scopes every op to their own subtree (see access-scope.ts).
const READ_ROLES = ['owner', 'accountant', 'viewer', 'field_operator'] as const;
const WRITE_ROLES = ['owner', 'accountant', 'field_operator'] as const;

export const operatorPayoutRoutes: FastifyPluginAsync = async (app) => {
  app.get('/compute', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const q = operatorPayoutComputeSchema.parse(request.query);
    const principal = await resolveMpPrincipal(request);
    const service = new OperatorPayoutService(request.server.db, request.tenantId);
    return { data: await service.compute(q, principal) };
  });

  app.get('/', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const pagination = paginationSchema.parse(request.query);
    const filters = operatorPayoutFilterSchema.parse(request.query);
    const principal = await resolveMpPrincipal(request);
    const service = new OperatorPayoutService(request.server.db, request.tenantId);
    return service.list(filters, { page: pagination.page, limit: pagination.limit }, principal);
  });

  app.post('/', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request, reply) => {
    const input = createOperatorPayoutSchema.parse(request.body);
    const today = new Date().toISOString().slice(0, 10);
    const principal = await resolveMpPrincipal(request);
    const service = new OperatorPayoutService(request.server.db, request.tenantId);
    return reply.status(201).send({ data: await service.markPaid(input, today, principal) });
  });
};
