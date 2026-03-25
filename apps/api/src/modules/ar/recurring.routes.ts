import { FastifyPluginAsync } from 'fastify';
import { createRecurringInvoiceSchema, updateRecurringInvoiceSchema, recurringFilterSchema, uuidParamSchema } from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { RecurringInvoiceService } from './recurring.service';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;

export const recurringRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { status } = recurringFilterSchema.parse(request.query);
      const service = new RecurringInvoiceService(request.server.db, request.tenantId);
      const data = await service.list(status);
      return { data };
    },
  );

  app.get(
    '/:id',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new RecurringInvoiceService(request.server.db, request.tenantId);
      const data = await service.getById(id);
      return { data };
    },
  );

  app.post(
    '/',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const input = createRecurringInvoiceSchema.parse(request.body);
      const service = new RecurringInvoiceService(request.server.db, request.tenantId);
      const data = await service.create(input);
      return reply.status(201).send({ data });
    },
  );

  app.put(
    '/:id',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = updateRecurringInvoiceSchema.parse(request.body);
      const service = new RecurringInvoiceService(request.server.db, request.tenantId);
      const data = await service.update(id, input);
      return { data };
    },
  );

  app.post(
    '/:id/pause',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new RecurringInvoiceService(request.server.db, request.tenantId);
      const data = await service.pause(id);
      return { data };
    },
  );

  app.post(
    '/:id/resume',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new RecurringInvoiceService(request.server.db, request.tenantId);
      const data = await service.resume(id);
      return { data };
    },
  );

  app.delete(
    '/:id',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new RecurringInvoiceService(request.server.db, request.tenantId);
      await service.delete(id);
      return reply.status(204).send();
    },
  );

  app.post(
    '/generate',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const service = new RecurringInvoiceService(request.server.db, request.tenantId);
      const result = await service.generateDueInvoices();
      return { data: result };
    },
  );
};
