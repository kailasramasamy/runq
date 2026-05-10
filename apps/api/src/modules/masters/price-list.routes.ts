import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createPriceListSchema, updatePriceListSchema, priceListFilterSchema, paginationSchema, uuidParamSchema } from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { NotFoundError } from '../../utils/errors';
import { PriceListService } from './price-list.service';
import { PriceResolverService } from './price-resolver.service';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;

const resolveQuerySchema = z.object({
  customerId: z.string().uuid(),
  itemId: z.string().uuid(),
  quantity: z.coerce.number().positive().optional(),
  date: z.string().date().optional(),
});

export const priceListRoutes: FastifyPluginAsync = async (app) => {
  // Important: register /resolve BEFORE /:id so Fastify doesn't match
  // 'resolve' as a uuid param.
  app.get(
    '/resolve',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const params = resolveQuerySchema.parse(request.query);
      const service = new PriceResolverService(request.server.db, request.tenantId);
      // Lookup endpoint: a missing customer/item is "no resolution available",
      // not an error. Return null so callers don't have to special-case 404s.
      try {
        const result = await service.resolve(params);
        return { data: result };
      } catch (err) {
        if (err instanceof NotFoundError) return { data: null };
        throw err;
      }
    },
  );

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
