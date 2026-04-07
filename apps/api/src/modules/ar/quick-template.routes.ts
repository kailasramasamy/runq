import { FastifyPluginAsync } from 'fastify';
import { createQuickTemplateSchema, updateQuickTemplateSchema, generateFromTemplateSchema, uuidParamSchema } from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { QuickTemplateService } from './quick-template.service';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;

export const quickTemplateRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const service = new QuickTemplateService(request.server.db, request.tenantId);
      const data = await service.list();
      return { data };
    },
  );

  app.get(
    '/:id',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new QuickTemplateService(request.server.db, request.tenantId);
      const data = await service.getById(id);
      return { data };
    },
  );

  app.post(
    '/',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const input = createQuickTemplateSchema.parse(request.body);
      const service = new QuickTemplateService(request.server.db, request.tenantId);
      const data = await service.create(input);
      return reply.status(201).send({ data });
    },
  );

  app.put(
    '/:id',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = updateQuickTemplateSchema.parse(request.body);
      const service = new QuickTemplateService(request.server.db, request.tenantId);
      const data = await service.update(id, input);
      return { data };
    },
  );

  app.delete(
    '/:id',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new QuickTemplateService(request.server.db, request.tenantId);
      await service.delete(id);
      return reply.status(204).send();
    },
  );

  app.post(
    '/:id/generate',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = generateFromTemplateSchema.parse(request.body);
      const service = new QuickTemplateService(request.server.db, request.tenantId);
      const data = await service.generateInvoice(id, input, request.user.userId);
      return reply.status(201).send({ data });
    },
  );
};
