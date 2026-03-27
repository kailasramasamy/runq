import { FastifyPluginAsync } from 'fastify';
import { transactionFilterSchema, paginationSchema } from '@runq/validators';
import { z } from 'zod';
import { rbacHook } from '../../hooks/rbac';
import { TransactionService } from './transaction.service';
import { CategorizeService } from './categorize.service';
import { BankChargesService } from './bank-charges.service';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;

const accountParamSchema = z.object({ accountId: z.string().uuid() });

const importBodySchema = z.object({
  csvData: z.string().min(1, 'CSV data is required'),
});

const transactionParamSchema = z.object({ id: z.string().uuid() });
const setCategoryBodySchema = z.object({ glAccountId: z.string().uuid() });

export const transactionRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/:accountId/transactions',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { accountId } = accountParamSchema.parse(request.params);
      const pagination = paginationSchema.parse(request.query);
      const filters = transactionFilterSchema.parse(request.query);
      const service = new TransactionService(request.server.db, request.tenantId);
      return service.list(accountId, {
        page: pagination.page,
        limit: pagination.limit,
        filters,
      });
    },
  );

  app.post(
    '/:accountId/import',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { accountId } = accountParamSchema.parse(request.params);
      const { csvData } = importBodySchema.parse(request.body);
      const service = new TransactionService(request.server.db, request.tenantId);
      const result = await service.importCSV(accountId, csvData);
      return reply.status(200).send({ data: result });
    },
  );

  app.post(
    '/:accountId/categorize',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { accountId } = accountParamSchema.parse(request.params);
      const service = new CategorizeService(request.server.db, request.tenantId);
      const result = await service.categorizeTransactions(accountId);
      return reply.status(200).send({ data: result });
    },
  );

  app.post(
    '/:accountId/sync',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { accountId } = accountParamSchema.parse(request.params);
      const service = new TransactionService(request.server.db, request.tenantId);
      const result = await service.syncFromFeed(accountId);
      return reply.status(200).send({ data: result });
    },
  );

  app.get(
    '/:accountId/charges-summary',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { accountId } = accountParamSchema.parse(request.params);
      const service = new BankChargesService(request.server.db, request.tenantId);
      const data = await service.getChargesSummary(accountId);
      return { data };
    },
  );

  app.put(
    '/transactions/:id/category',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { id } = transactionParamSchema.parse(request.params);
      const { glAccountId } = setCategoryBodySchema.parse(request.body);
      const service = new CategorizeService(request.server.db, request.tenantId);
      await service.setCategory(id, glAccountId);
      return reply.status(200).send({ data: { success: true } });
    },
  );
};
