import { FastifyPluginAsync } from 'fastify';
import { createReceiptSchema, receiptFilterSchema, paginationSchema, uuidParamSchema } from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { WebhookEndpointService } from '../webhooks/webhook-endpoint.service';
import { ReceiptService } from './receipt.service';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;

export const receiptRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const pagination = paginationSchema.parse(request.query);
      const filters = receiptFilterSchema.parse(request.query);
      const service = new ReceiptService(request.server.db, request.tenantId);
      return service.list({ page: pagination.page, limit: pagination.limit, filters });
    },
  );

  app.get(
    '/:id',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new ReceiptService(request.server.db, request.tenantId);
      const receipt = await service.getById(id);
      return { data: receipt };
    },
  );

  app.post(
    '/',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const input = createReceiptSchema.parse(request.body);
      const service = new ReceiptService(request.server.db, request.tenantId);
      const receipt = await service.create(input);

      const webhooks = new WebhookEndpointService(request.server.db, request.tenantId);
      void webhooks.deliver('receipt.created', {
        receiptId: receipt.id,
        customerName: receipt.customerName,
        amount: receipt.amount,
        receiptDate: receipt.receiptDate,
      });

      return reply.status(201).send({ data: receipt });
    },
  );
};
