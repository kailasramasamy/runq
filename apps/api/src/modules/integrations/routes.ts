import { FastifyPluginAsync } from 'fastify';
import {
  createIntegrationSchema,
  updateIntegrationSchema,
  triggerSyncSchema,
  uuidParamSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { IntegrationService } from './integration.service';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const OWNER_ROLES = ['owner'] as const;

export const integrationRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const svc = new IntegrationService(request.server.db, request.tenantId);
      const data = await svc.list();
      return { data };
    },
  );

  app.post(
    '/',
    { preHandler: [rbacHook([...OWNER_ROLES])] },
    async (request, reply) => {
      const input = createIntegrationSchema.parse(request.body);
      const svc = new IntegrationService(request.server.db, request.tenantId);
      const data = await svc.create(input);
      return reply.status(201).send({ data });
    },
  );

  app.put(
    '/:id',
    { preHandler: [rbacHook([...OWNER_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = updateIntegrationSchema.parse(request.body);
      const svc = new IntegrationService(request.server.db, request.tenantId);
      const data = await svc.update(id, input);
      return { data };
    },
  );

  app.delete(
    '/:id',
    { preHandler: [rbacHook([...OWNER_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const svc = new IntegrationService(request.server.db, request.tenantId);
      await svc.delete(id);
      return { success: true };
    },
  );

  app.post(
    '/:id/sync',
    { preHandler: [rbacHook([...OWNER_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const { action } = triggerSyncSchema.parse(request.body);
      const svc = new IntegrationService(request.server.db, request.tenantId);
      const data = await svc.triggerSync(id, action);
      return { data };
    },
  );

  app.get(
    '/:id/logs',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const svc = new IntegrationService(request.server.db, request.tenantId);
      const data = await svc.getLogs(id);
      return { data };
    },
  );

  app.post(
    '/tally/import',
    { preHandler: [rbacHook([...OWNER_ROLES])] },
    async (request) => {
      const svc = new IntegrationService(request.server.db, request.tenantId);
      const data = await svc.tallyImport(
        request.body as Record<string, unknown>,
      );
      return { data };
    },
  );
};
