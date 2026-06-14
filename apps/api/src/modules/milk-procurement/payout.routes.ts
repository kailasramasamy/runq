import { FastifyPluginAsync } from 'fastify';
import {
  createLedgerEntrySchema,
  ledgerFilterSchema,
  createPayoutCycleSchema,
  payoutCycleFilterSchema,
  paginationSchema,
  uuidParamSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { PayoutService } from './payout.service';
import { resolveMpPrincipal } from './access-scope';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;
// a farmer may read their own ledger (the service forces it to their farmerId)
const LEDGER_READ_ROLES = ['owner', 'accountant', 'viewer', 'farmer'] as const;

export const payoutRoutes: FastifyPluginAsync = async (app) => {
  // farmer ledger (advances / feed-loans / repayments)
  app.get('/ledger', { preHandler: [rbacHook([...LEDGER_READ_ROLES])] }, async (request) => {
    const { farmerId } = ledgerFilterSchema.parse(request.query);
    const principal = await resolveMpPrincipal(request);
    const service = new PayoutService(request.server.db, request.tenantId);
    return { data: await service.ledgerForFarmer(farmerId, principal) };
  });

  app.post('/ledger', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request, reply) => {
    const input = createLedgerEntrySchema.parse(request.body);
    const service = new PayoutService(request.server.db, request.tenantId);
    return reply.status(201).send({ data: await service.addLedgerEntry(input, request.user?.userId) });
  });

  // payout cycles
  app.get('/cycles', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const pagination = paginationSchema.parse(request.query);
    const filters = payoutCycleFilterSchema.parse(request.query);
    const service = new PayoutService(request.server.db, request.tenantId);
    return service.listCycles(filters, { page: pagination.page, limit: pagination.limit });
  });

  app.get('/cycles/:id', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const service = new PayoutService(request.server.db, request.tenantId);
    return { data: await service.getCycle(id) };
  });

  app.post('/cycles', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request, reply) => {
    const input = createPayoutCycleSchema.parse(request.body);
    const service = new PayoutService(request.server.db, request.tenantId);
    return reply.status(201).send({ data: await service.createCycle(input) });
  });

  app.post('/cycles/:id/lock', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const service = new PayoutService(request.server.db, request.tenantId);
    return { data: await service.lockCycle(id) };
  });

  app.post('/cycles/:id/pay', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const service = new PayoutService(request.server.db, request.tenantId);
    return { data: await service.payCycle(id) };
  });
};
