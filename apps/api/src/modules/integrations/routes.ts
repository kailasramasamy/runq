import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createIntegrationSchema,
  updateIntegrationSchema,
  triggerSyncSchema,
  uuidParamSchema,
} from '@runq/validators';

const tallyImportBodySchema = z.object({
  company: z.string().min(1).max(255),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  ledgers: z.array(z.record(z.unknown())).optional(),
  vouchers: z.array(z.record(z.unknown())).optional(),
});
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
      const input = tallyImportBodySchema.parse(request.body);
      const svc = new IntegrationService(request.server.db, request.tenantId);
      const data = await svc.tallyImport(input);
      return { data };
    },
  );
};
