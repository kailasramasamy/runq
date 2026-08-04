import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  cancelReclaimSchema, createReclaimSchema, reclaimFilterSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { ReclaimService } from './reclaim.service';

/**
 * Reclaim — teardown of finished goods back to raw material.
 *
 * Same audience as Record Production: this is a shop-floor action, and the
 * people cutting the packets open are the ones who know how much came back.
 */
const ENTRY_ROLES = ['owner', 'accountant', 'technician', 'field_operator'] as const;
const READ_ROLES = ['owner', 'accountant', 'technician', 'field_operator', 'viewer'] as const;

const uuidParamSchema = z.object({ id: z.string().uuid() });

export const reclaimRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const filter = reclaimFilterSchema.parse(req.query);
    return new ReclaimService(req.server.db, req.tenantId).list(filter);
  });

  app.get('/:id', { preHandler: [rbacHook([...READ_ROLES])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    return { data: await new ReclaimService(req.server.db, req.tenantId).get(id) };
  });

  app.post('/', { preHandler: [rbacHook([...ENTRY_ROLES])] }, async (req, reply) => {
    const input = createReclaimSchema.parse(req.body);
    const svc = new ReclaimService(req.server.db, req.tenantId, req.user?.userId);
    return reply.status(201).send({ data: await svc.create(input) });
  });

  app.post('/:id/post', { preHandler: [rbacHook([...ENTRY_ROLES])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new ReclaimService(req.server.db, req.tenantId, req.user?.userId);
    const { data, warnings } = await svc.post(id);
    return { data, warnings };
  });

  app.post('/:id/cancel', { preHandler: [rbacHook([...ENTRY_ROLES])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = cancelReclaimSchema.parse(req.body);
    const svc = new ReclaimService(req.server.db, req.tenantId, req.user?.userId);
    return { data: await svc.cancel(id, input) };
  });
};
