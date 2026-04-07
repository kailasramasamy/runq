import { FastifyPluginAsync } from 'fastify';
import { createPriceListSchema, updatePriceListSchema, priceListFilterSchema, paginationSchema, uuidParamSchema } from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { PriceListService } from './price-list.service';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;

export const priceListRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const pagination = paginationSchema.parse(request.query);
      const filters = priceListFilterSchema.parse(request.query);
      const service = new PriceListService(request.server.db, request.tenantId);
      return service.list({ page: pagination.page, limit: pagination.limit, filters });
    },
  );

  app.get(
    '/:id',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new PriceListService(request.server.db, request.tenantId);
      const priceList = await service.getById(id);
      return { data: priceList };
    },
  );

  app.post(
    '/',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const input = createPriceListSchema.parse(request.body);
      const service = new PriceListService(request.server.db, request.tenantId);
      const priceList = await service.create(input);
      return reply.status(201).send({ data: priceList });
    },
  );

  app.put(
    '/:id',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = updatePriceListSchema.parse(request.body);
      const service = new PriceListService(request.server.db, request.tenantId);
      const priceList = await service.update(id, input);
      return { data: priceList };
    },
  );

  app.put(
    '/:id/toggle',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new PriceListService(request.server.db, request.tenantId);
      const priceList = await service.toggleActive(id);
      return { data: priceList };
    },
  );
};
