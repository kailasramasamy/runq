import { FastifyPluginAsync } from 'fastify';
import { createSalesOrderSchema, updateSalesOrderSchema, salesOrderFilterSchema, paginationSchema, uuidParamSchema } from '@runq/validators';
import { z } from 'zod';
import { rbacHook } from '../../hooks/rbac';
import { SalesOrderService } from './sales-order.service';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;

const statusUpdateSchema = z.object({
  status: z.enum(['draft', 'confirmed', 'partially_invoiced', 'fully_invoiced', 'cancelled']),
});

export const salesOrderRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const pagination = paginationSchema.parse(request.query);
      const filters = salesOrderFilterSchema.parse(request.query);
      const service = new SalesOrderService(request.server.db, request.tenantId);
      return service.list({ page: pagination.page, limit: pagination.limit, filters });
    },
  );

  app.get(
    '/:id',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new SalesOrderService(request.server.db, request.tenantId);
      const order = await service.getById(id);
      return { data: order };
    },
  );

  app.post(
    '/',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const input = createSalesOrderSchema.parse(request.body);
      const service = new SalesOrderService(request.server.db, request.tenantId);
      const order = await service.create(input, request.user.userId);
      return reply.status(201).send({ data: order });
    },
  );

  app.put(
    '/:id',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = updateSalesOrderSchema.parse(request.body);
      const service = new SalesOrderService(request.server.db, request.tenantId);
      const order = await service.update(id, input);
      return { data: order };
    },
  );

  app.put(
    '/:id/status',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const { status } = statusUpdateSchema.parse(request.body);
      const service = new SalesOrderService(request.server.db, request.tenantId);
      const order = await service.updateStatus(id, status);
      return { data: order };
    },
  );

  app.post(
    '/:id/convert-to-invoice',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new SalesOrderService(request.server.db, request.tenantId);
      const result = await service.convertToInvoice(id);
      return reply.status(201).send({ data: result });
    },
  );
};
