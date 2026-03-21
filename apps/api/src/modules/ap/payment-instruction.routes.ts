import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createPaymentBatchSchema,
  approveInstructionsSchema,
  rejectInstructionsSchema,
  paymentBatchFilterSchema,
  paginationSchema,
  uuidParamSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { PaymentInstructionService } from './payment-instruction.service';

const executeBatchSchema = z.object({
  bankAccountId: z.string().uuid(),
});

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner'] as const;
const EXPORT_ROLES = ['owner', 'accountant'] as const;

export const paymentInstructionRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const input = createPaymentBatchSchema.parse(request.body);
      const service = new PaymentInstructionService(request.server.db, request.tenantId);
      const batch = await service.createBatch(input);
      return reply.status(201).send({ data: batch });
    },
  );

  app.get(
    '/',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const pagination = paginationSchema.parse(request.query);
      const filters = paymentBatchFilterSchema.parse(request.query);
      const service = new PaymentInstructionService(request.server.db, request.tenantId);
      return service.listBatches({ page: pagination.page, limit: pagination.limit, ...filters });
    },
  );

  app.get(
    '/:id',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new PaymentInstructionService(request.server.db, request.tenantId);
      const batch = await service.getBatch(id);
      return { data: batch };
    },
  );

  app.post(
    '/:id/approve',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = approveInstructionsSchema.parse(request.body);
      const service = new PaymentInstructionService(request.server.db, request.tenantId);
      const result = await service.approveInstructions(id, input);
      return reply.status(200).send({ data: result });
    },
  );

  app.post(
    '/:id/reject',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = rejectInstructionsSchema.parse(request.body);
      const service = new PaymentInstructionService(request.server.db, request.tenantId);
      const batch = await service.rejectInstructions(id, input);
      return reply.status(200).send({ data: batch });
    },
  );

  app.post(
    '/:id/execute',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { id } = uuidParamSchema.parse(request.params);
      const { bankAccountId } = executeBatchSchema.parse(request.body);
      const service = new PaymentInstructionService(request.server.db, request.tenantId);
      const result = await service.executeBatch(id, bankAccountId);
      return reply.status(200).send({ data: result });
    },
  );

  app.get(
    '/:id/export-csv',
    { preHandler: [rbacHook([...EXPORT_ROLES])] },
    async (request, reply) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new PaymentInstructionService(request.server.db, request.tenantId);
      const csv = await service.exportBatchCSV(id);
      return reply
        .header('Content-Type', 'text/csv')
        .header('Content-Disposition', `attachment; filename="payment-batch-${id}.csv"`)
        .send(csv);
    },
  );
};
