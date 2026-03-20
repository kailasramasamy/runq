
import { FastifyPluginAsync } from 'fastify';
import {
  createVendorSchema,
  updateVendorSchema,
  vendorFilterSchema,
  paginationSchema,
  uuidParamSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { VendorService } from './vendor.service';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;
const OWNER_ROLES = ['owner'] as const;

export const vendorRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const pagination = paginationSchema.parse(request.query);
      const filters = vendorFilterSchema.parse(request.query);
      const service = new VendorService(request.server.db, request.tenantId);
      return service.list({ page: pagination.page, limit: pagination.limit, search: filters.search });
    },
  );

  app.get(
    '/:id',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new VendorService(request.server.db, request.tenantId);
      const vendor = await service.getById(id);
      return { data: vendor };
    },
  );

  app.post(
    '/',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const input = createVendorSchema.parse(request.body);
      const service = new VendorService(request.server.db, request.tenantId);
      const vendor = await service.create(input);
      return reply.status(201).send({ data: vendor });
    },
  );

  app.put(
    '/:id',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = updateVendorSchema.parse(request.body);
      const service = new VendorService(request.server.db, request.tenantId);
      const vendor = await service.update(id, input);
      return { data: vendor };
    },
  );

  app.delete(
    '/:id',
    { preHandler: [rbacHook([...OWNER_ROLES])] },
    async (request, reply) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new VendorService(request.server.db, request.tenantId);
      await service.softDelete(id);
      return reply.status(204).send();
    },
  );

  app.get(
    '/:id/invoices',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      uuidParamSchema.parse(request.params);
      return { data: [], meta: { page: 1, limit: 25, total: 0, totalPages: 0 } };
    },
  );

  app.get(
    '/:id/payments',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      uuidParamSchema.parse(request.params);
      return { data: [], meta: { page: 1, limit: 25, total: 0, totalPages: 0 } };
    },
  );
};
