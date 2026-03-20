import { FastifyPluginAsync } from 'fastify';
import {
  createCustomerSchema,
  updateCustomerSchema,
  customerFilterSchema,
  paginationSchema,
  uuidParamSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { CustomerService } from './customer.service';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;
const OWNER_ROLES = ['owner'] as const;

export const customerRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const pagination = paginationSchema.parse(request.query);
      const filters = customerFilterSchema.parse(request.query);
      const service = new CustomerService(request.server.db, request.tenantId);
      return service.list({
        page: pagination.page,
        limit: pagination.limit,
        search: filters.search,
        type: filters.type,
        hasOutstanding: filters.hasOutstanding,
      });
    },
  );

  app.get(
    '/:id',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new CustomerService(request.server.db, request.tenantId);
      const customer = await service.getById(id);
      return { data: customer };
    },
  );

  app.post(
    '/',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const input = createCustomerSchema.parse(request.body);
      const service = new CustomerService(request.server.db, request.tenantId);
      const customer = await service.create(input);
      return reply.status(201).send({ data: customer });
    },
  );

  app.put(
    '/:id',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = updateCustomerSchema.parse(request.body);
      const service = new CustomerService(request.server.db, request.tenantId);
      const customer = await service.update(id, input);
      return { data: customer };
    },
  );

  app.delete(
    '/:id',
    { preHandler: [rbacHook([...OWNER_ROLES])] },
    async (request, reply) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new CustomerService(request.server.db, request.tenantId);
      await service.softDelete(id);
      return reply.status(204).send();
    },
  );
};
