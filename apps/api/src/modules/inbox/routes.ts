import { FastifyPluginAsync } from 'fastify';
import { rbacHook } from '../../hooks/rbac';
import { InboxService } from './service';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;

export const inboxRoutes: FastifyPluginAsync = async (app) => {
  // GET /count — cheap badge query for the sidebar.
  app.get(
    '/count',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const service = new InboxService(request.server.db, request.tenantId);
      const count = await service.count();
      return { data: { count } };
    },
  );

  // GET / — full grouped payload for the inbox page.
  app.get(
    '/',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const service = new InboxService(request.server.db, request.tenantId);
      const data = await service.list();
      return { data };
    },
  );
};
