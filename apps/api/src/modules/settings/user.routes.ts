import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { uuidParamSchema } from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { UserService } from './user.service';

// Owner-equivalent admins plus HR may manage staff logins. The service applies
// the escalation guard (hr can't create/modify owner/accountant users).
const MANAGE_ROLES = ['owner', 'client_owner', 'hr'] as const;

const createUserBodySchema = z
  .object({
    name: z.string().min(1).max(255),
    role: z.enum(['owner', 'accountant', 'viewer', 'hr']),
    // Email path (web login) needs email + password together; phone path
    // (mobile OTP-only staff) needs just a phone — email/password are synthesised.
    email: z.string().email().optional(),
    password: z.string().min(8).optional(),
    phone: z.string().min(8).max(20).optional(),
  })
  .refine((d) => Boolean(d.email) || Boolean(d.phone), {
    message: 'An email or a phone number is required',
    path: ['email'],
  })
  .refine((d) => !d.email || Boolean(d.password), {
    message: 'A password is required for an email login',
    path: ['password'],
  });

const updateUserBodySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().optional(),
  role: z.enum(['owner', 'accountant', 'viewer', 'hr']).optional(),
  isActive: z.boolean().optional(),
  // Per-user module grant. `null` = inherit all tenant modules; an array
  // restricts to that subset. Codes are validated/capped in the service.
  modules: z.array(z.string()).nullable().optional(),
});

export const userRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/',
    { preHandler: [rbacHook([...MANAGE_ROLES])] },
    async (request) => {
      const service = new UserService(request.server.db, request.tenantId);
      const data = await service.list();
      return { data };
    },
  );

  app.get(
    '/eligible-employees',
    { preHandler: [rbacHook([...MANAGE_ROLES])] },
    async (request) => {
      const service = new UserService(request.server.db, request.tenantId);
      const data = await service.listEligibleEmployees();
      return { data };
    },
  );

  app.post(
    '/',
    { preHandler: [rbacHook([...MANAGE_ROLES])] },
    async (request, reply) => {
      const input = createUserBodySchema.parse(request.body);
      const service = new UserService(request.server.db, request.tenantId);
      const data = await service.create(input, request.activeRole, request.user.userId);
      return reply.status(201).send({ data });
    },
  );

  app.put(
    '/:id',
    { preHandler: [rbacHook([...MANAGE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = updateUserBodySchema.parse(request.body);
      const service = new UserService(request.server.db, request.tenantId);
      const data = await service.update(id, input, request.activeRole);
      return { data };
    },
  );

  app.delete(
    '/:id',
    { preHandler: [rbacHook([...MANAGE_ROLES])] },
    async (request, reply) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new UserService(request.server.db, request.tenantId);
      await service.delete(id, request.user.userId, request.activeRole);
      return reply.status(204).send();
    },
  );
};
