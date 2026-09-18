import { FastifyPluginAsync } from 'fastify';
import {
  createCategorySchema, updateCategorySchema, categoryFilterSchema,
  categoryTreeQuerySchema, uuidParamSchema, reorderCategoriesSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { CategoryService } from './category.service';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;

export const categoryRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const filters = categoryFilterSchema.parse(request.query);
      const service = new CategoryService(request.server.db, request.tenantId);
      const data = await service.list(filters);
      return { data };
    },
  );

  app.get(
    '/tree',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const query = categoryTreeQuerySchema.parse(request.query);
      const service = new CategoryService(request.server.db, request.tenantId);
      const data = await service.listTree(query);
      return { data };
    },
  );

  app.get(
    '/:id',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new CategoryService(request.server.db, request.tenantId);
      const category = await service.getById(id);
      return { data: category };
    },
  );

  app.post(
    '/',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const input = createCategorySchema.parse(request.body);
      const service = new CategoryService(request.server.db, request.tenantId);
      const category = await service.create(input);
      return reply.status(201).send({ data: category });
    },
  );

  // Declared before '/:id' for readability; Fastify's router prefers the
  // static segment over the parametric one regardless of registration order.
  app.put(
    '/reorder',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const input = reorderCategoriesSchema.parse(request.body);
      const service = new CategoryService(request.server.db, request.tenantId);
      await service.reorder(input);
      return { data: { updated: input.length } };
    },
  );

  app.put(
    '/:id',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = updateCategorySchema.parse(request.body);
      const service = new CategoryService(request.server.db, request.tenantId);
      const category = await service.update(id, input);
      return { data: category };
    },
  );

  app.put(
    '/:id/toggle',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new CategoryService(request.server.db, request.tenantId);
      const category = await service.toggleActive(id);
      return { data: category };
    },
  );

  app.delete(
    '/:id',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new CategoryService(request.server.db, request.tenantId);
      await service.remove(id);
      return reply.status(204).send();
    },
  );
};
