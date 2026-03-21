import { FastifyPluginAsync } from 'fastify';
import {
  createCreditNoteSchema,
  updateCreditNoteSchema,
  creditNoteFilterSchema,
  paginationSchema,
  uuidParamSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { CreditNoteService } from './credit-note.service';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;
const OWNER_ROLES = ['owner'] as const;

export const creditNoteRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const pagination = paginationSchema.parse(request.query);
      const filters = creditNoteFilterSchema.parse(request.query);
      const service = new CreditNoteService(request.server.db, request.tenantId);
      return service.list({ page: pagination.page, limit: pagination.limit, filters });
    },
  );

  app.get(
    '/:id',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new CreditNoteService(request.server.db, request.tenantId);
      const creditNote = await service.getById(id);
      return { data: creditNote };
    },
  );

  app.post(
    '/',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const input = createCreditNoteSchema.parse(request.body);
      const service = new CreditNoteService(request.server.db, request.tenantId);
      const creditNote = await service.create(input);
      return reply.status(201).send({ data: creditNote });
    },
  );

  app.put(
    '/:id',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = updateCreditNoteSchema.parse(request.body);
      const service = new CreditNoteService(request.server.db, request.tenantId);
      const creditNote = await service.update(id, input);
      return { data: creditNote };
    },
  );

  app.post(
    '/:id/issue',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new CreditNoteService(request.server.db, request.tenantId);
      const creditNote = await service.issue(id);
      return { data: creditNote };
    },
  );

  app.post(
    '/:id/apply',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new CreditNoteService(request.server.db, request.tenantId);
      const creditNote = await service.apply(id);
      return { data: creditNote };
    },
  );

  app.delete(
    '/:id',
    { preHandler: [rbacHook([...OWNER_ROLES])] },
    async (request, reply) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new CreditNoteService(request.server.db, request.tenantId);
      await service.cancel(id);
      return reply.status(204).send();
    },
  );
};
