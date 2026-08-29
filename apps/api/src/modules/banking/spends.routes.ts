import { FastifyPluginAsync } from 'fastify';
import { paginationSchema, spendsFilterSchema } from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { SpendsService } from './spends.service';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;

export const spendsRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const pagination = paginationSchema.parse(request.query);
      const filters = spendsFilterSchema.parse(request.query);
      const service = new SpendsService(request.server.db, request.tenantId);
      return service.list({ page: pagination.page, limit: pagination.limit, ...filters });
    },
  );
};
