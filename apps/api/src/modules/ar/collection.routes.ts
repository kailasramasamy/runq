import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { rbacHook } from '../../hooks/rbac';
import { CollectionService } from './collection.service';

const READ_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;

const createSchema = z.object({
  invoiceId: z.string().uuid(),
  assignedTo: z.string().uuid(),
  notes: z.string().nullish(),
  followUpDate: z.string().nullish(),
});

const updateSchema = z.object({
  status: z.enum(['open', 'contacted', 'promised', 'resolved', 'escalated']).optional(),
  notes: z.string().nullish(),
  followUpDate: z.string().nullish(),
  assignedTo: z.string().uuid().optional(),
});

const idParamSchema = z.object({ id: z.string().uuid() });
const listQuerySchema = z.object({ assigneeId: z.string().uuid().optional() });

export const collectionRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { assigneeId } = listQuerySchema.parse(request.query);
      const service = new CollectionService(request.server.db, request.tenantId);
      const data = await service.list(assigneeId);
      return { data };
    },
  );

  app.post(
    '/',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const input = createSchema.parse(request.body);
      const service = new CollectionService(request.server.db, request.tenantId);
      const data = await service.create(input);
      return reply.status(201).send({ data });
    },
  );

  app.put(
    '/:id',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = idParamSchema.parse(request.params);
      const input = updateSchema.parse(request.body);
      const service = new CollectionService(request.server.db, request.tenantId);
      const data = await service.update(id, input);
      return { data };
    },
  );

  app.delete(
    '/:id',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { id } = idParamSchema.parse(request.params);
      const service = new CollectionService(request.server.db, request.tenantId);
      await service.remove(id);
      return reply.status(204).send();
    },
  );
};
