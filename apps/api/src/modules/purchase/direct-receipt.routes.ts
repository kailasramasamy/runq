import { FastifyPluginAsync } from 'fastify';
import {
  createDirectReceiptSchema,
  directReceiptFilterSchema,
  paginationSchema,
  uuidParamSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { DirectReceiptService } from './direct-receipt.service';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;

export const directReceiptRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const pagination = paginationSchema.parse(request.query);
      const filters = directReceiptFilterSchema.parse(request.query);
      const svc = new DirectReceiptService(request.server.db, request.tenantId, request.user?.userId);
      return svc.list(filters, { page: pagination.page, limit: pagination.limit });
    },
  );

  app.post(
    '/',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const input = createDirectReceiptSchema.parse(request.body);
      const svc = new DirectReceiptService(request.server.db, request.tenantId, request.user?.userId);
      const data = await svc.create(input);
      return reply.status(201).send({ data });
    },
  );

  app.delete(
    '/:id',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { id } = uuidParamSchema.parse(request.params);
      const svc = new DirectReceiptService(request.server.db, request.tenantId, request.user?.userId);
      await svc.cancel(id);
      return reply.status(204).send();
    },
  );
};
