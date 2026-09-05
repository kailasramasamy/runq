import { FastifyPluginAsync } from 'fastify';
import {
  gateRejectionSchema, receiptRejectionSchema, rejectionFilterSchema,
  rejectionStatsSchema, uuidParamSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { MpRejectionService } from './rejection.service';
import { resolveMpPrincipal } from './access-scope';

// Refusing milk is a receiving decision, made by whoever is standing at the
// can — so the operator who makes it can record it, at their own node.
const READ_ROLES = ['owner', 'accountant', 'viewer', 'field_operator'] as const;
const WRITE_ROLES = ['owner', 'accountant', 'field_operator'] as const;

export const rejectionRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const filters = rejectionFilterSchema.parse(request.query);
    const principal = await resolveMpPrincipal(request);
    const service = new MpRejectionService(request.server.db, request.tenantId);
    return { data: await service.list(filters, principal) };
  });

  // Rejection rate by source, farmer or reason — the quality lever.
  app.get('/stats', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const q = rejectionStatsSchema.parse(request.query);
    const principal = await resolveMpPrincipal(request);
    const service = new MpRejectionService(request.server.db, request.tenantId);
    return { data: await service.stats(q, principal) };
  });

  // Refused at the gate: no pour is created, so nothing accrues.
  app.post('/gate', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request, reply) => {
    const input = gateRejectionSchema.parse(request.body);
    const principal = await resolveMpPrincipal(request);
    const service = new MpRejectionService(request.server.db, request.tenantId);
    return reply.status(201).send({
      data: await service.rejectAtGate(input, request.user?.userId, principal),
    });
  });

  // Refused off a load already taken in — the receipt drops to what was kept.
  app.post('/consignment/:id', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request, reply) => {
    const { id } = uuidParamSchema.parse(request.params);
    const input = receiptRejectionSchema.parse(request.body);
    const principal = await resolveMpPrincipal(request);
    const service = new MpRejectionService(request.server.db, request.tenantId);
    return reply.status(201).send({
      data: await service.rejectReceipt(id, input, request.user?.userId, principal),
    });
  });

  app.post('/:id/reverse', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const principal = await resolveMpPrincipal(request);
    const service = new MpRejectionService(request.server.db, request.tenantId);
    return { data: await service.reverse(id, request.user?.userId, principal) };
  });
};
