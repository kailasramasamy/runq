import { FastifyPluginAsync } from 'fastify';
import { uuidParamSchema } from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { MpAppAccessService } from './app-access.service';

// Who may sign in to Dhenu is a tenant-owner decision — the same bar as
// managing users in web Settings.
const MANAGE_ROLES = ['owner', 'client_owner'] as const;

export const appAccessRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: [rbacHook([...MANAGE_ROLES])] }, async (request) => {
    const service = new MpAppAccessService(request.server.db, request.tenantId);
    return { data: await service.list() };
  });

  app.post('/:id', { preHandler: [rbacHook([...MANAGE_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const service = new MpAppAccessService(request.server.db, request.tenantId);
    return { data: await service.grant(id) };
  });

  app.delete('/:id', { preHandler: [rbacHook([...MANAGE_ROLES])] }, async (request) => {
    const { id } = uuidParamSchema.parse(request.params);
    const service = new MpAppAccessService(request.server.db, request.tenantId);
    return { data: await service.revoke(id) };
  });
};
