import { FastifyPluginAsync } from 'fastify';
import {
  createLedgerEntrySchema,
  ledgerFilterSchema,
  farmerLinesFilterSchema,
  createPayoutCycleSchema,
  payoutCycleFilterSchema,
  markLinePaidSchema,
  paginationSchema,
  uuidParamSchema,
} from '@runq/validators';
import { z } from 'zod';
import { rbacHook } from '../../hooks/rbac';
import { PayoutService } from './payout.service';
import { resolveMpPrincipal } from './access-scope';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;
// field_operator may run cycles & ledger entries, but the service scopes every
// op to the nodes (and farmers) they're assigned to (see access-scope.ts).
const CYCLE_READ_ROLES = ['owner', 'accountant', 'viewer', 'field_operator'] as const;
const CYCLE_WRITE_ROLES = ['owner', 'accountant', 'field_operator'] as const;
// a farmer may read their own ledger (the service forces it to their farmerId)
const LEDGER_READ_ROLES = ['owner', 'accountant', 'viewer', 'farmer', 'field_operator'] as const;

export const payoutRoutes: FastifyPluginAsync = async (app) => {
  // farmer ledger (advances / feed-loans / repayments)
  app.get('/ledger', { preHandler: [rbacHook([...LEDGER_READ_ROLES])] }, async (request) => {
    const { farmerId } = ledgerFilterSchema.parse(request.query);
    const principal = await resolveMpPrincipal(request);
    const service = new PayoutService(request.server.db, request.tenantId);
    return { data: await service.ledgerForFarmer(farmerId, principal) };
  });

  // a farmer's own payout statements (lines joined with cycle window + status)
  app.get('/my-lines', { preHandler: [rbacHook([...LEDGER_READ_ROLES])] }, async (request) => {
    const { farmerId, limit } = farmerLinesFilterSchema.parse(request.query);
    const principal = await resolveMpPrincipal(request);
    const service = new PayoutService(request.server.db, request.tenantId);
    return { data: await service.linesForFarmer(farmerId, principal, limit) };
  });

  app.post('/ledger', { preHandler: [rbacHook([...CYCLE_WRITE_ROLES])] }, async (request, reply) => {
    const input = createLedgerEntrySchema.parse(request.body);
    const principal = await resolveMpPrincipal(request);
    const service = new PayoutService(request.server.db, request.tenantId);
    return reply.status(201).send({ data: await service.addLedgerEntry(input, request.user?.userId, principal) });
  });

  // payout cycles
  app.get('/cycles', { preHandler: [rbacHook([...CYCLE_READ_ROLES])] }, async (request) => {
    const pagination = paginationSchema.parse(request.query);
    const filters = payoutCycleFilterSchema.parse(request.query);
    const principal = await resolveMpPrincipal(request);
    const service = new PayoutService(request.server.db, request.tenantId);
    return service.listCycles(filters, { page: pagination.page, limit: pagination.limit }, principal);
  });

  app.get('/cycles/:id', { preHandler: [rbacHook([...CYCLE_READ_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const principal = await resolveMpPrincipal(request);
    const service = new PayoutService(request.server.db, request.tenantId);
    return { data: await service.getCycle(id, principal) };
  });

  app.post('/cycles', { preHandler: [rbacHook([...CYCLE_WRITE_ROLES])] }, async (request, reply) => {
    const input = createPayoutCycleSchema.parse(request.body);
    const principal = await resolveMpPrincipal(request);
    const service = new PayoutService(request.server.db, request.tenantId);
    return reply.status(201).send({ data: await service.createCycle(input, principal) });
  });

  app.post('/cycles/:id/lock', { preHandler: [rbacHook([...CYCLE_WRITE_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const principal = await resolveMpPrincipal(request);
    const service = new PayoutService(request.server.db, request.tenantId);
    return { data: await service.lockCycle(id, principal) };
  });

  app.post('/cycles/:id/pay', { preHandler: [rbacHook([...CYCLE_WRITE_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const principal = await resolveMpPrincipal(request);
    const service = new PayoutService(request.server.db, request.tenantId);
    return { data: await service.payCycle(id, principal, request.user?.userId) };
  });

  // per-farmer disbursement tracking (operational paid/unpaid flag)
  const lineParams = z.object({ id: z.string().uuid(), lineId: z.string().uuid() });
  app.post('/cycles/:id/lines/:lineId/paid', { preHandler: [rbacHook([...CYCLE_WRITE_ROLES])] }, async (request) => {
    const { id, lineId } = lineParams.parse(request.params);
    const { paid } = markLinePaidSchema.parse(request.body);
    const principal = await resolveMpPrincipal(request);
    const service = new PayoutService(request.server.db, request.tenantId);
    return { data: await service.markLinePaid(id, lineId, paid, request.user?.userId, principal) };
  });

  app.post('/cycles/:id/mark-all-paid', { preHandler: [rbacHook([...CYCLE_WRITE_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const { paid } = markLinePaidSchema.parse(request.body);
    const principal = await resolveMpPrincipal(request);
    const service = new PayoutService(request.server.db, request.tenantId);
    return { data: await service.markAllLinesPaid(id, paid, request.user?.userId, principal) };
  });
};
