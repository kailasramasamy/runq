import { FastifyPluginAsync } from 'fastify';
import {
  createSalesInvoiceSchema,
  updateSalesInvoiceSchema,
  salesInvoiceFilterSchema,
  sendInvoiceSchema,
  markPaidSchema,
  paginationSchema,
  uuidParamSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { InvoiceService } from './invoice.service';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;
const OWNER_ROLES = ['owner'] as const;

export const invoiceRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const pagination = paginationSchema.parse(request.query);
      const filters = salesInvoiceFilterSchema.parse(request.query);
      const service = new InvoiceService(request.server.db, request.tenantId);
      return service.list({ page: pagination.page, limit: pagination.limit, filters });
    },
  );

  app.get(
    '/:id',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new InvoiceService(request.server.db, request.tenantId);
      const invoice = await service.getById(id);
      return { data: invoice };
    },
  );

  app.post(
    '/',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const input = createSalesInvoiceSchema.parse(request.body);
      const service = new InvoiceService(request.server.db, request.tenantId);
      const invoice = await service.create(input);
      return reply.status(201).send({ data: invoice });
    },
  );

  app.put(
    '/:id',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = updateSalesInvoiceSchema.parse(request.body);
      const service = new InvoiceService(request.server.db, request.tenantId);
      const invoice = await service.update(id, input);
      return { data: invoice };
    },
  );

  app.delete(
    '/:id',
    { preHandler: [rbacHook([...OWNER_ROLES])] },
    async (request, reply) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new InvoiceService(request.server.db, request.tenantId);
      await service.cancel(id);
      return reply.status(204).send();
    },
  );

  app.post(
    '/:id/send',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = sendInvoiceSchema.parse(request.body);
      const service = new InvoiceService(request.server.db, request.tenantId);
      const invoice = await service.send(id, input);
      return { data: invoice };
    },
  );

  app.post(
    '/:id/mark-paid',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = markPaidSchema.parse(request.body);
      const service = new InvoiceService(request.server.db, request.tenantId);
      const invoice = await service.markPaid(id, input);
      return { data: invoice };
    },
  );
};
