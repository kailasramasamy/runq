import { FastifyPluginAsync } from 'fastify';
import { hsnSacSearchSchema, createHsnSacSchema, updateHsnSacSchema } from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { HsnSacService } from './hsn-sac.service';

const ALL_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;

export const hsnSacRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request) => {
      const { q, type, limit } = hsnSacSearchSchema.parse(request.query);
      const service = new HsnSacService(request.server.db);
      const data = await service.search(q, type, limit);
      return { data };
    },
  );

  app.get(
    '/:code',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request) => {
      const { code } = request.params as { code: string };
      const service = new HsnSacService(request.server.db);
      const data = await service.getByCode(code);
      return { data };
    },
  );

  app.post(
    '/',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const input = createHsnSacSchema.parse(request.body);
      const service = new HsnSacService(request.server.db);
      const data = await service.create(input);
      return reply.status(201).send({ data });
    },
  );

  app.put(
    '/:code',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { code } = request.params as { code: string };
      const input = updateHsnSacSchema.parse(request.body);
      const service = new HsnSacService(request.server.db);
      const data = await service.update(code, input);
      return { data };
    },
  );
};
