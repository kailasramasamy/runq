import { FastifyPluginAsync } from 'fastify';
import { transactionFilterSchema, paginationSchema } from '@runq/validators';
import { z } from 'zod';
import { rbacHook } from '../../hooks/rbac';
import { TransactionService } from './transaction.service';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;

const accountParamSchema = z.object({ accountId: z.string().uuid() });

const importBodySchema = z.object({
  csvData: z.string().min(1, 'CSV data is required'),
});

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
};
