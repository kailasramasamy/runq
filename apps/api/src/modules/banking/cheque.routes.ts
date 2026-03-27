import { FastifyPluginAsync } from 'fastify';
import {
  createChequeSchema,
  chequeFilterSchema,
  depositChequeSchema,
  bounceChequeSchema,
  paginationSchema,
  uuidParamSchema,
} from '@runq/validators';
import { z } from 'zod';
import { rbacHook } from '../../hooks/rbac';
import { ChequeService } from './cheque.service';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;

const upcomingQuerySchema = z.object({
  days: z.coerce.number().int().positive().default(30),
});

export const chequeRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/upcoming',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { days } = upcomingQuerySchema.parse(request.query);
      const service = new ChequeService(request.server.db, request.tenantId);
      const data = await service.getUpcomingPDC(days);
      return { data };
    },
  );

  app.get(
    '/',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const pagination = paginationSchema.parse(request.query);
      const filters = chequeFilterSchema.parse(request.query);
      const service = new ChequeService(request.server.db, request.tenantId);
      return service.list(filters, pagination.page, pagination.limit);
    },
  );

  app.get(
    '/:id',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new ChequeService(request.server.db, request.tenantId);
      const cheque = await service.getById(id);
      return { data: cheque };
    },
  );

  app.post(
    '/',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const input = createChequeSchema.parse(request.body);
      const service = new ChequeService(request.server.db, request.tenantId);
      const cheque = await service.create(input);
      return reply.status(201).send({ data: cheque });
    },
  );

  app.post(
    '/:id/deposit',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = depositChequeSchema.parse(request.body);
      const service = new ChequeService(request.server.db, request.tenantId);
      const cheque = await service.deposit(id, input);
      return { data: cheque };
    },
  );

  app.post(
    '/:id/clear',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new ChequeService(request.server.db, request.tenantId);
      const cheque = await service.clear(id);
      return { data: cheque };
    },
  );

  app.post(
    '/:id/bounce',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = bounceChequeSchema.parse(request.body);
      const service = new ChequeService(request.server.db, request.tenantId);
      const cheque = await service.bounce(id, input);
      return { data: cheque };
    },
  );

  app.delete(
    '/:id',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new ChequeService(request.server.db, request.tenantId);
      await service.cancel(id);
      return reply.status(204).send();
    },
  );
};
