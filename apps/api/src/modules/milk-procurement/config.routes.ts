import { FastifyPluginAsync } from 'fastify';
import { upsertGlSettingsSchema } from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { ConfigService } from './config.service';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;

export const configRoutes: FastifyPluginAsync = async (app) => {
  app.get('/gl-settings', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const service = new ConfigService(request.server.db, request.tenantId);
    return { data: await service.getSettings() };
  });

  app.put('/gl-settings', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
    const input = upsertGlSettingsSchema.parse(request.body);
    const service = new ConfigService(request.server.db, request.tenantId);
    return { data: await service.upsertSettings(input) };
  });

  app.get('/sequences', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const service = new ConfigService(request.server.db, request.tenantId);
    return { data: await service.listSequences() };
  });
};
