import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { uuidParamSchema } from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { UserService } from './user.service';

const OWNER_ROLES = ['owner'] as const;

const createUserBodySchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(255),
  password: z.string().min(8),
  role: z.enum(['owner', 'accountant', 'viewer']),
});

const updateUserBodySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().optional(),
  role: z.enum(['owner', 'accountant', 'viewer']).optional(),
  isActive: z.boolean().optional(),
});

export const userRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/',
    { preHandler: [rbacHook([...OWNER_ROLES])] },
    async (request) => {
      const service = new UserService(request.server.db, request.tenantId);
      const data = await service.list();
      return { data };
    },
  );

  app.post(
    '/',
    { preHandler: [rbacHook([...OWNER_ROLES])] },
    async (request, reply) => {
      const input = createUserBodySchema.parse(request.body);
      const service = new UserService(request.server.db, request.tenantId);
      const data = await service.create(input);
      return reply.status(201).send({ data });
    },
  );

  app.put(
    '/:id',
    { preHandler: [rbacHook([...OWNER_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = updateUserBodySchema.parse(request.body);
      const service = new UserService(request.server.db, request.tenantId);
      const data = await service.update(id, input);
      return { data };
    },
  );

  app.delete(
    '/:id',
    { preHandler: [rbacHook([...OWNER_ROLES])] },
    async (request, reply) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new UserService(request.server.db, request.tenantId);
      await service.delete(id, request.user.userId);
      return reply.status(204).send();
    },
  );
};
