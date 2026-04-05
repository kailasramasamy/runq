import { FastifyPluginAsync } from 'fastify';
import {
  createWebhookEndpointSchema,
  updateWebhookEndpointSchema,
  uuidParamSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { WebhookEndpointService } from './webhook-endpoint.service';

const OWNER_ROLES = ['owner'] as const;

export const webhookEndpointRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/',
    { preHandler: [rbacHook([...OWNER_ROLES])] },
    async (request) => {
      const service = new WebhookEndpointService(request.server.db, request.tenantId);
      const data = await service.list();
      return { data };
    },
  );

  app.post(
    '/',
    { preHandler: [rbacHook([...OWNER_ROLES])] },
    async (request, reply) => {
      const input = createWebhookEndpointSchema.parse(request.body);
      const service = new WebhookEndpointService(request.server.db, request.tenantId);
      const data = await service.create(input);
      return reply.status(201).send({ data });
    },
  );

  app.get(
    '/:id',
    { preHandler: [rbacHook([...OWNER_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new WebhookEndpointService(request.server.db, request.tenantId);
      const data = await service.getById(id);
      return { data };
    },
  );

  app.put(
    '/:id',
    { preHandler: [rbacHook([...OWNER_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = updateWebhookEndpointSchema.parse(request.body);
      const service = new WebhookEndpointService(request.server.db, request.tenantId);
      const data = await service.update(id, input);
      return { data };
    },
  );

  app.delete(
    '/:id',
    { preHandler: [rbacHook([...OWNER_ROLES])] },
    async (request, reply) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new WebhookEndpointService(request.server.db, request.tenantId);
      await service.delete(id);
      return reply.status(204).send();
    },
  );

  app.post(
    '/test/:id',
    { preHandler: [rbacHook([...OWNER_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new WebhookEndpointService(request.server.db, request.tenantId);
      const endpoint = await service.getById(id);
      await service.deliver('test.ping', {
        message: 'This is a test webhook delivery',
        endpointId: endpoint.id,
      });
      return { data: { message: 'Test webhook dispatched' } };
    },
  );
};
