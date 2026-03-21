
import { FastifyPluginAsync } from 'fastify';
import {
  createVendorPaymentSchema,
  createAdvancePaymentSchema,
  createDirectPaymentSchema,
  adjustAdvanceSchema,
  vendorPaymentFilterSchema,
  paginationSchema,
  uuidParamSchema,
  createBatchPaymentSchema,
  importBatchPaymentSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { PaymentService } from './payment.service';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;

export const paymentRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const pagination = paginationSchema.parse(request.query);
      const filters = vendorPaymentFilterSchema.parse(request.query);
      const service = new PaymentService(request.server.db, request.tenantId);
      return service.list({ page: pagination.page, limit: pagination.limit, ...filters });
    },
  );

  app.get(
    '/:id',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new PaymentService(request.server.db, request.tenantId);
      const payment = await service.getById(id);
      return { data: payment };
    },
  );

  app.post(
    '/',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const input = createVendorPaymentSchema.parse(request.body);
      const service = new PaymentService(request.server.db, request.tenantId);
      const payment = await service.createPayment(input);
      return reply.status(201).send({ data: payment });
    },
  );

  app.post(
    '/direct',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const input = createDirectPaymentSchema.parse(request.body);
      const service = new PaymentService(request.server.db, request.tenantId);
      const payment = await service.createDirectPayment(input);
      return reply.status(201).send({ data: payment });
    },
  );

  app.post(
    '/advance',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const input = createAdvancePaymentSchema.parse(request.body);
      const service = new PaymentService(request.server.db, request.tenantId);
      const advance = await service.createAdvancePayment(input);
      return reply.status(201).send({ data: advance });
    },
  );

  app.post(
    '/:id/adjust',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { id } = uuidParamSchema.parse(request.params);
      const { invoiceId, amount } = adjustAdvanceSchema.parse(request.body);
      const service = new PaymentService(request.server.db, request.tenantId);
      await service.adjustAdvance(id, invoiceId, amount);
      return reply.status(200).send({ data: { success: true } });
    },
  );

  app.post(
    '/batch',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const input = createBatchPaymentSchema.parse(request.body);
      const service = new PaymentService(request.server.db, request.tenantId);
      const result = await service.createBatch(input);
      return reply.status(201).send({ data: result });
    },
  );

  app.post(
    '/import',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { bankAccountId, paymentDate, csvData } = importBatchPaymentSchema.parse(request.body);
      const service = new PaymentService(request.server.db, request.tenantId);
      const result = await service.importBatchFromCSV(bankAccountId, paymentDate, csvData);
      return reply.status(200).send({ data: result });
    },
  );
};
