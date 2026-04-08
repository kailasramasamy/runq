import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createPaymentRunSchema,
  createRunFromBillsSchema,
  approveLinesSchema,
  rejectLinesSchema,
  paymentRunFilterSchema,
  paginationSchema,
  uuidParamSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { PaymentRunService } from './payment-run.service';

const executeRunSchema = z.object({
  bankAccountId: z.string().uuid(),
});

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner'] as const;
const EXPORT_ROLES = ['owner', 'accountant'] as const;

export const paymentRunRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const input = createPaymentRunSchema.parse(request.body);
      const service = new PaymentRunService(request.server.db, request.tenantId);
      const run = await service.createRun(input);
      return reply.status(201).send({ data: run });
    },
  );

  app.post(
    '/from-bills',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const input = createRunFromBillsSchema.parse(request.body);
      const service = new PaymentRunService(request.server.db, request.tenantId);
      const run = await service.createRunFromBills(input);
      return reply.status(201).send({ data: run });
    },
  );

  app.get(
    '/',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const pagination = paginationSchema.parse(request.query);
      const filters = paymentRunFilterSchema.parse(request.query);
      const service = new PaymentRunService(request.server.db, request.tenantId);
      return service.listRuns({ page: pagination.page, limit: pagination.limit, ...filters });
    },
  );

  app.get(
    '/:id',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new PaymentRunService(request.server.db, request.tenantId);
      const run = await service.getRun(id);
      return { data: run };
    },
  );

  app.post(
    '/:id/approve',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = approveLinesSchema.parse(request.body);
      const service = new PaymentRunService(request.server.db, request.tenantId);
      const result = await service.approveLines(id, input);
      return reply.status(200).send({ data: result });
    },
  );

  app.post(
    '/:id/reject',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = rejectLinesSchema.parse(request.body);
      const service = new PaymentRunService(request.server.db, request.tenantId);
      const run = await service.rejectLines(id, input);
      return reply.status(200).send({ data: run });
    },
  );

  app.post(
    '/:id/execute',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { id } = uuidParamSchema.parse(request.params);
      const { bankAccountId } = executeRunSchema.parse(request.body);
      const service = new PaymentRunService(request.server.db, request.tenantId);
      const result = await service.executeRun(id, bankAccountId);
      return reply.status(200).send({ data: result });
    },
  );

  app.get(
    '/:id/export-csv',
    { preHandler: [rbacHook([...EXPORT_ROLES])] },
    async (request, reply) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new PaymentRunService(request.server.db, request.tenantId);
      const csv = await service.exportRunCSV(id);
      return reply
        .header('Content-Type', 'text/csv')
        .header('Content-Disposition', `attachment; filename="payment-run-${id}.csv"`)
        .send(csv);
    },
  );
};
