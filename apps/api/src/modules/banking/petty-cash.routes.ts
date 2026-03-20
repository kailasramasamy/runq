import { FastifyPluginAsync } from 'fastify';
import {
  createPettyCashAccountSchema,
  updatePettyCashAccountSchema,
  pettyCashTransactionSchema,
  approvePettyCashSchema,
  paginationSchema,
  uuidParamSchema,
} from '@runq/validators';
import { z } from 'zod';
import { rbacHook } from '../../hooks/rbac';
import { PettyCashService } from './petty-cash.service';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;
const OWNER_ROLES = ['owner'] as const;

const accountTxnParamSchema = z.object({
  id: z.string().uuid(),
  txnId: z.string().uuid(),
});

const pettyCashFilterSchema = z.object({
  type: z.enum(['expense', 'replenishment']).optional(),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
});

export const pettyCashRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const pagination = paginationSchema.parse(request.query);
      const service = new PettyCashService(request.server.db, request.tenantId);
      return service.listAccounts(pagination.page, pagination.limit);
    },
  );

  app.get(
    '/:id',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new PettyCashService(request.server.db, request.tenantId);
      const account = await service.getAccount(id);
      return { data: account };
    },
  );

  app.post(
    '/',
    { preHandler: [rbacHook([...OWNER_ROLES])] },
    async (request, reply) => {
      const input = createPettyCashAccountSchema.parse(request.body);
      const service = new PettyCashService(request.server.db, request.tenantId);
      const account = await service.createAccount(input);
      return reply.status(201).send({ data: account });
    },
  );

  app.put(
    '/:id',
    { preHandler: [rbacHook([...OWNER_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = updatePettyCashAccountSchema.parse(request.body);
      const service = new PettyCashService(request.server.db, request.tenantId);
      const account = await service.updateAccount(id, input);
      return { data: account };
    },
  );

  app.get(
    '/:id/transactions',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const pagination = paginationSchema.parse(request.query);
      const filters = pettyCashFilterSchema.parse(request.query);
      const service = new PettyCashService(request.server.db, request.tenantId);
      return service.listTransactions(id, filters, pagination.page, pagination.limit);
    },
  );

  app.post(
    '/:id/transactions',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = pettyCashTransactionSchema.parse(request.body);
      const service = new PettyCashService(request.server.db, request.tenantId);
      const txn = await service.createTransaction(id, input);
      return reply.status(201).send({ data: txn });
    },
  );

  app.post(
    '/:id/transactions/:txnId/approve',
    { preHandler: [rbacHook([...OWNER_ROLES])] },
    async (request) => {
      const { id, txnId } = accountTxnParamSchema.parse(request.params);
      const { action } = approvePettyCashSchema.parse(request.body);
      const userId = request.user!.userId;
      const service = new PettyCashService(request.server.db, request.tenantId);
      const txn = await service.approveTransaction(id, txnId, action, userId);
      return { data: txn };
    },
  );
};
