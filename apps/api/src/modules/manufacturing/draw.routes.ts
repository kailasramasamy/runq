/**
 * Manufacturing — draws. Mounted at /manufacturing/draws.
 *
 * Take material now, say what it made later. See draw.service.ts for why this
 * is a work order underneath and why nothing here allocates batches for the
 * operator.
 */

import { FastifyPluginAsync } from 'fastify';
import {
  openDrawSchema,
  takeMoreSchema,
  closeDrawSchema,
  cancelDrawSchema,
  drawListQuerySchema,
  yieldHintQuerySchema,
  uuidParamSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { DrawService } from './draw.service';

const READ_ROLES = ['owner', 'accountant', 'viewer', 'technician'] as const;
// Taking material and saying what it made is shop-floor work — the same list that
// may run a work order, for the same reason.
const RUN_ROLES = ['owner', 'accountant', 'technician', 'field_operator'] as const;

export const drawRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { open } = drawListQuerySchema.parse(request.query);
      const service = new DrawService(request.server.db, request.tenantId);
      return { data: await service.list(open ?? false) };
    },
  );

  // Above /:id so the literal path is not read as a uuid.
  app.get(
    '/yield-hint',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { outputItemId } = yieldHintQuerySchema.parse(request.query);
      const service = new DrawService(request.server.db, request.tenantId);
      return { data: await service.yieldHint(outputItemId) };
    },
  );

  app.get(
    '/:id',
    { preHandler: [rbacHook([...READ_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new DrawService(request.server.db, request.tenantId);
      return { data: await service.get(id) };
    },
  );

  app.post(
    '/',
    { preHandler: [rbacHook([...RUN_ROLES])] },
    async (request, reply) => {
      const input = openDrawSchema.parse(request.body);
      const service = new DrawService(request.server.db, request.tenantId);
      const data = await service.open(input, request.user?.userId);
      return reply.code(201).send({ data });
    },
  );

  /** More material into an open draw. */
  app.post(
    '/:id/milk',
    { preHandler: [rbacHook([...RUN_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = takeMoreSchema.parse(request.body);
      const service = new DrawService(request.server.db, request.tenantId);
      return { data: await service.takeMore(id, input, request.user?.userId) };
    },
  );

  /** Abandoned — the material returns to its lots and the draw disappears. */
  app.post(
    '/:id/cancel',
    { preHandler: [rbacHook([...RUN_ROLES])] },
    async (request, reply) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = cancelDrawSchema.parse(request.body ?? {});
      const service = new DrawService(request.server.db, request.tenantId);
      await service.cancel(id, input, request.user?.userId);
      return reply.code(204).send();
    },
  );

  /** What came out — posts the output and closes the draw. */
  app.post(
    '/:id/close',
    { preHandler: [rbacHook([...RUN_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = closeDrawSchema.parse(request.body);
      const service = new DrawService(request.server.db, request.tenantId);
      return { data: await service.close(id, input, request.user?.userId) };
    },
  );
};
