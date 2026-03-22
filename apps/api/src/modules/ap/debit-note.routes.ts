
import { FastifyPluginAsync } from 'fastify';
import {
  createDebitNoteSchema,
  updateDebitNoteSchema,
  debitNoteFilterSchema,
  applyDebitNoteToInvoiceSchema,
  paginationSchema,
  uuidParamSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { DebitNoteService } from './debit-note.service';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;
const OWNER_ROLES = ['owner'] as const;

export const debitNoteRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const pagination = paginationSchema.parse(request.query);
      const filters = debitNoteFilterSchema.parse(request.query);
      const service = new DebitNoteService(request.server.db, request.tenantId);
      return service.list({ page: pagination.page, limit: pagination.limit, filters });
    },
  );

  app.get(
    '/:id',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new DebitNoteService(request.server.db, request.tenantId);
      const debitNote = await service.getById(id);
      return { data: debitNote };
    },
  );

  app.post(
    '/',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const input = createDebitNoteSchema.parse(request.body);
      const service = new DebitNoteService(request.server.db, request.tenantId);
      const debitNote = await service.create(input);
      return reply.status(201).send({ data: debitNote });
    },
  );

  app.put(
    '/:id',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = updateDebitNoteSchema.parse(request.body);
      const service = new DebitNoteService(request.server.db, request.tenantId);
      const debitNote = await service.update(id, input);
      return { data: debitNote };
    },
  );

  app.post(
    '/:id/issue',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new DebitNoteService(request.server.db, request.tenantId);
      const debitNote = await service.issue(id);
      return { data: debitNote };
    },
  );

  app.post(
    '/:id/apply',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new DebitNoteService(request.server.db, request.tenantId);
      const debitNote = await service.apply(id);
      return { data: debitNote };
    },
  );

  app.post(
    '/:id/apply-to-invoice',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const { invoiceId } = applyDebitNoteToInvoiceSchema.parse(request.body);
      const service = new DebitNoteService(request.server.db, request.tenantId);
      const debitNote = await service.applyToInvoice(id, invoiceId);
      return { data: debitNote };
    },
  );

  app.delete(
    '/:id',
    { preHandler: [rbacHook([...OWNER_ROLES])] },
    async (request, reply) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new DebitNoteService(request.server.db, request.tenantId);
      await service.cancel(id);
      return reply.status(204).send();
    },
  );
};
