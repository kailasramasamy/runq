import { FastifyPluginAsync } from 'fastify';
import {
  createCustomerDebitNoteSchema,
  updateCustomerDebitNoteSchema,
  customerDebitNoteFilterSchema,
  paginationSchema,
  uuidParamSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { CustomerDebitNoteService } from './customer-debit-note.service';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;
const OWNER_ROLES = ['owner'] as const;

export const customerDebitNoteRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const pagination = paginationSchema.parse(request.query);
    const filters = customerDebitNoteFilterSchema.parse(request.query);
    const service = new CustomerDebitNoteService(request.server.db, request.tenantId);
    return service.list({ page: pagination.page, limit: pagination.limit, filters });
  });

  app.get('/:id', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const service = new CustomerDebitNoteService(request.server.db, request.tenantId);
    return { data: await service.getById(id) };
  });

  app.post('/', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request, reply) => {
    const input = createCustomerDebitNoteSchema.parse(request.body);
    const service = new CustomerDebitNoteService(request.server.db, request.tenantId);
    const note = await service.create(input);
    return reply.status(201).send({ data: note });
  });

  app.put('/:id', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const input = updateCustomerDebitNoteSchema.parse(request.body);
    const service = new CustomerDebitNoteService(request.server.db, request.tenantId);
    return { data: await service.update(id, input) };
  });

  app.post('/:id/issue', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const service = new CustomerDebitNoteService(request.server.db, request.tenantId);
    return { data: await service.issue(id) };
  });

  app.post('/:id/apply', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const service = new CustomerDebitNoteService(request.server.db, request.tenantId);
    return { data: await service.apply(id) };
  });

  app.delete('/:id', { preHandler: [rbacHook([...OWNER_ROLES])] }, async (request, reply) => {
    const { id } = uuidParamSchema.parse(request.params);
    const service = new CustomerDebitNoteService(request.server.db, request.tenantId);
    await service.cancel(id);
    return reply.status(204).send();
  });
};
