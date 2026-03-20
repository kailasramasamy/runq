import { z } from 'zod';
import { FastifyPluginAsync } from 'fastify';
import { paginationSchema, uuidParamSchema } from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { PgReconService } from './pg-recon.service';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;

const pgImportSchema = z.object({
  gateway: z.enum(['razorpay', 'phonepe', 'paytm']),
  csvData: z.string().min(1),
});

const settlementFilterSchema = z.object({
  gateway: z.enum(['razorpay', 'phonepe', 'paytm']).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  status: z.enum(['pending', 'reconciled', 'partially_reconciled']).optional(),
});

export const pgReconRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/import',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const input = pgImportSchema.parse(request.body);
      const service = new PgReconService(request.server.db, request.tenantId);
      const result = await service.importSettlement(input.gateway, input.csvData);
      return reply.status(201).send({ data: result });
    },
  );

  app.get(
    '/',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { page, limit } = paginationSchema.parse(request.query);
      const filters = settlementFilterSchema.parse(request.query);
      const service = new PgReconService(request.server.db, request.tenantId);
      return service.listSettlements(filters, page, limit);
    },
  );

  app.get(
    '/:id',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new PgReconService(request.server.db, request.tenantId);
      const data = await service.getSettlement(id);
      return { data };
    },
  );

  app.post(
    '/:id/reconcile',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new PgReconService(request.server.db, request.tenantId);
      const data = await service.reconcileSettlement(id);
      return { data };
    },
  );

  app.get(
    '/:id/unmatched',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new PgReconService(request.server.db, request.tenantId);
      const data = await service.getUnmatched(id);
      return { data };
    },
  );
};
