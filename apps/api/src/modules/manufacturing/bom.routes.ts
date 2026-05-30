import { FastifyPluginAsync } from 'fastify';
import {
  createBomSchema,
  updateBomSchema,
  bomFilterSchema,
  paginationSchema,
  uuidParamSchema,
} from '@runq/validators';
import { z } from 'zod';
import { rbacHook } from '../../hooks/rbac';
import { BomService } from './bom.service';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;

const cloneBodySchema = z.object({
  bomCode: z.string().min(1).max(50),
});

export const bomRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const pagination = paginationSchema.parse(request.query);
      const filters = bomFilterSchema.parse(request.query);
      const service = new BomService(request.server.db, request.tenantId);
      return service.list(filters, { page: pagination.page, limit: pagination.limit });
    },
  );

  app.get(
    '/:id',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new BomService(request.server.db, request.tenantId);
      const data = await service.getById(id);
      return { data };
    },
  );

  app.post(
    '/',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const input = createBomSchema.parse(request.body);
      const service = new BomService(request.server.db, request.tenantId);
      const data = await service.create(input, request.user?.userId);
      return reply.status(201).send({ data });
    },
  );

  app.put(
    '/:id',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = updateBomSchema.parse(request.body);
      const service = new BomService(request.server.db, request.tenantId);
      const data = await service.update(id, input, request.user?.userId);
      return { data };
    },
  );

  app.post(
    '/:id/clone',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { id } = uuidParamSchema.parse(request.params);
      const { bomCode } = cloneBodySchema.parse(request.body);
      const service = new BomService(request.server.db, request.tenantId);
      const data = await service.clone(id, bomCode, request.user?.userId);
      return reply.status(201).send({ data });
    },
  );

  app.post(
    '/:id/activate',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new BomService(request.server.db, request.tenantId);
      const data = await service.activate(id);
      return { data };
    },
  );

  app.post(
    '/:id/deactivate',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new BomService(request.server.db, request.tenantId);
      const data = await service.deactivate(id);
      return { data };
    },
  );
};
