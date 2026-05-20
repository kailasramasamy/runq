import { FastifyPluginAsync } from 'fastify';
import {
  createDesignationSchema,
  updateDesignationSchema,
  uuidParamSchema,
  suggestHrSchema,
  bulkCreateDesignationsSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { DesignationService } from './designation.service';
import { suggestDesignations } from './ai-suggest.service';

const ALL = ['owner', 'accountant', 'viewer', 'hr'] as const;
const WRITE = ['owner', 'accountant', 'hr'] as const;

export const designationRoutes: FastifyPluginAsync = async (app) => {
  app.get('/designations', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const svc = new DesignationService(req.server.db, req.tenantId);
    return { data: await svc.list() };
  });

  app.post('/designations', { preHandler: [rbacHook([...WRITE])] }, async (req, reply) => {
    const input = createDesignationSchema.parse(req.body);
    const svc = new DesignationService(req.server.db, req.tenantId);
    return reply.status(201).send({ data: await svc.create(input) });
  });

  app.post('/designations/suggest', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { description } = suggestHrSchema.parse(req.body);
    return { data: { suggestions: await suggestDesignations(description) } };
  });

  app.post('/designations/bulk', { preHandler: [rbacHook([...WRITE])] }, async (req, reply) => {
    const { designations } = bulkCreateDesignationsSchema.parse(req.body);
    const svc = new DesignationService(req.server.db, req.tenantId);
    return reply.status(201).send({ data: await svc.bulkCreate(designations) });
  });

  app.put('/designations/:id', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = updateDesignationSchema.parse(req.body);
    const svc = new DesignationService(req.server.db, req.tenantId);
    return { data: await svc.update(id, input) };
  });

  app.delete('/designations/:id', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new DesignationService(req.server.db, req.tenantId);
    return { data: await svc.remove(id) };
  });
};
