import { FastifyPluginAsync } from 'fastify';
import { createItemSchema, updateItemSchema, itemFilterSchema, paginationSchema, uuidParamSchema } from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { ItemService } from './item.service';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;

export const itemRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const pagination = paginationSchema.parse(request.query);
      const filters = itemFilterSchema.parse(request.query);
      const service = new ItemService(request.server.db, request.tenantId);
      return service.list({ page: pagination.page, limit: pagination.limit, filters });
    },
  );

  app.get(
    '/:id',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new ItemService(request.server.db, request.tenantId);
      const item = await service.getById(id);
      return { data: item };
    },
  );

  app.post(
    '/',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const input = createItemSchema.parse(request.body);
      const service = new ItemService(request.server.db, request.tenantId);
      const item = await service.create(input);
      return reply.status(201).send({ data: item });
    },
  );

  app.put(
    '/:id',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = updateItemSchema.parse(request.body);
      const service = new ItemService(request.server.db, request.tenantId);
      const item = await service.update(id, input);
      return { data: item };
    },
  );

  app.put(
    '/:id/toggle',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new ItemService(request.server.db, request.tenantId);
      const item = await service.toggleActive(id);
      return { data: item };
    },
  );
};
