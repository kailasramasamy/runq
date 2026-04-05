import { FastifyPluginAsync } from 'fastify';
import {
  autoReconcileSchema,
  manualMatchSchema,
  unmatchSchema,
  closePeriodSchema,
} from '@runq/validators';
import { z } from 'zod';
import { rbacHook } from '../../hooks/rbac';
import { ReconciliationService } from './reconciliation.service';
import { AutoReconcileService } from './auto-reconcile.service';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;
const OWNER_ROLES = ['owner'] as const;

const accountParamSchema = z.object({ accountId: z.string().uuid() });

const autoMatchBodySchema = z.object({
  bankTransactionId: z.string().uuid(),
  matchType: z.enum(['receipt', 'payment']),
  invoiceId: z.string().uuid(),
});

export const reconciliationRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/accounts/:accountId/reconciliation',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { accountId } = accountParamSchema.parse(request.params);
      const service = new ReconciliationService(request.server.db, request.tenantId);
      const result = await service.getUnreconciled(accountId);
      return { data: result };
    },
  );

  app.post(
    '/accounts/:accountId/reconcile/auto',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { accountId } = accountParamSchema.parse(request.params);
      const input = autoReconcileSchema.parse(request.body);
      const service = new ReconciliationService(request.server.db, request.tenantId);
      const result = await service.autoReconcile(accountId, input);
      return { data: result };
    },
  );

  app.post(
    '/reconciliation/match',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const input = manualMatchSchema.parse(request.body);
      const userId = request.user!.userId;
      const service = new ReconciliationService(request.server.db, request.tenantId);
      const match = await service.manualMatch(input, userId);
      return { data: match };
    },
  );

  app.post(
    '/reconciliation/unmatch',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { bankTransactionId } = unmatchSchema.parse(request.body);
      const service = new ReconciliationService(request.server.db, request.tenantId);
      await service.unmatch(bankTransactionId);
      return { data: { success: true } };
    },
  );

  app.post(
    '/reconciliation/close-period',
    { preHandler: [rbacHook([...OWNER_ROLES])] },
    async (request) => {
      const input = closePeriodSchema.parse(request.body);
      const completedBy = request.user!.userId;
      const service = new ReconciliationService(request.server.db, request.tenantId);
      const result = await service.closePeriod(input, completedBy);
      return { data: result };
    },
  );

  app.post(
    '/reconciliation/auto-match',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { bankTransactionId, matchType, invoiceId } = autoMatchBodySchema.parse(request.body);
      const service = new AutoReconcileService(request.server.db, request.tenantId);
      const result = await service.processMatch(bankTransactionId, matchType, invoiceId);
      return reply.status(201).send({ data: result });
    },
  );

  app.get(
    '/accounts/:accountId/reconciliation/periods',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { accountId } = accountParamSchema.parse(request.params);
      const service = new ReconciliationService(request.server.db, request.tenantId);
      const periods = await service.getClosedPeriods(accountId);
      return { data: periods };
    },
  );
};
