import { FastifyPluginAsync } from 'fastify';
import {
  createBankAccountSchema,
  updateBankAccountSchema,
  paginationSchema,
  uuidParamSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { BankAccountService } from './bank-account.service';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const OWNER_ROLES = ['owner'] as const;

export const bankAccountRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const pagination = paginationSchema.parse(request.query);
      const service = new BankAccountService(request.server.db, request.tenantId);
      return service.list({ page: pagination.page, limit: pagination.limit });
    },
  );

  app.get(
    '/:id',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new BankAccountService(request.server.db, request.tenantId);
      const account = await service.getById(id);
      return { data: account };
    },
  );

  app.post(
    '/',
    { preHandler: [rbacHook([...OWNER_ROLES])] },
    async (request, reply) => {
      const input = createBankAccountSchema.parse(request.body);
      const service = new BankAccountService(request.server.db, request.tenantId);
      const account = await service.create(input);
      return reply.status(201).send({ data: account });
    },
  );

  app.put(
    '/:id',
    { preHandler: [rbacHook([...OWNER_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = updateBankAccountSchema.parse(request.body);
      const service = new BankAccountService(request.server.db, request.tenantId);
      const account = await service.update(id, input);
      return { data: account };
    },
  );

  app.get(
    '/:id/balance',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new BankAccountService(request.server.db, request.tenantId);
      const balance = await service.getBalance(id);
      return { data: balance };
    },
  );

  app.delete(
    '/:id',
    { preHandler: [rbacHook([...OWNER_ROLES])] },
    async (request, reply) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new BankAccountService(request.server.db, request.tenantId);
      await service.softDelete(id);
      return reply.status(204).send();
    },
  );
};
