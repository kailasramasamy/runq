import { FastifyPluginAsync } from 'fastify';
import { upsertGlSettingsSchema } from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { ConfigService } from './config.service';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;
// Cadence is non-sensitive — farmers/operators read it to align their views.
const CYCLE_ROLES = ['owner', 'accountant', 'viewer', 'field_operator', 'farmer'] as const;
// Support contacts are shown on every persona's Help & Support screen.
const SUPPORT_ROLES = ['owner', 'accountant', 'viewer', 'field_operator', 'farmer'] as const;

export const configRoutes: FastifyPluginAsync = async (app) => {
  app.get('/gl-settings', { preHandler: [rbacHook([...READ_ROLES])] }, async (request) => {
    const service = new ConfigService(request.server.db, request.tenantId);
    return { data: await service.getSettings() };
  });

  app.get('/cycle', { preHandler: [rbacHook([...CYCLE_ROLES])] }, async (request) => {
    const service = new ConfigService(request.server.db, request.tenantId);
    return { data: await service.getCycleConfig() };
  });

  app.get('/support', { preHandler: [rbacHook([...SUPPORT_ROLES])] }, async (request) => {
    const service = new ConfigService(request.server.db, request.tenantId);
    return { data: await service.getSupportConfig() };
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
