import { FastifyPluginAsync } from 'fastify';
import { createQuoteSchema, updateQuoteSchema, quoteFilterSchema, paginationSchema, uuidParamSchema } from '@runq/validators';
import { z } from 'zod';
import { rbacHook } from '../../hooks/rbac';
import { QuoteService } from './quote.service';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;

const statusUpdateSchema = z.object({
  status: z.enum(['draft', 'sent', 'accepted', 'rejected', 'expired', 'converted']),
});

export const quoteRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const pagination = paginationSchema.parse(request.query);
      const filters = quoteFilterSchema.parse(request.query);
      const service = new QuoteService(request.server.db, request.tenantId);
      return service.list({ page: pagination.page, limit: pagination.limit, filters });
    },
  );

  app.get(
    '/:id',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new QuoteService(request.server.db, request.tenantId);
      const quote = await service.getById(id);
      return { data: quote };
    },
  );

  app.post(
    '/',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const input = createQuoteSchema.parse(request.body);
      const service = new QuoteService(request.server.db, request.tenantId);
      const quote = await service.create(input, request.user.userId);
      return reply.status(201).send({ data: quote });
    },
  );

  app.put(
    '/:id',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = updateQuoteSchema.parse(request.body);
      const service = new QuoteService(request.server.db, request.tenantId);
      const quote = await service.update(id, input);
      return { data: quote };
    },
  );

  app.put(
    '/:id/status',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const { status } = statusUpdateSchema.parse(request.body);
      const service = new QuoteService(request.server.db, request.tenantId);
      const quote = await service.updateStatus(id, status);
      return { data: quote };
    },
  );

  app.post(
    '/:id/convert-to-invoice',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new QuoteService(request.server.db, request.tenantId);
      const result = await service.convertToInvoice(id);
      return reply.status(201).send({ data: result });
    },
  );

  app.post(
    '/:id/convert-to-order',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new QuoteService(request.server.db, request.tenantId);
      const result = await service.convertToOrder(id);
      return reply.status(201).send({ data: result });
    },
  );
};
