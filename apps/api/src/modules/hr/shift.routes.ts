import { FastifyPluginAsync } from 'fastify';
import {
  createShiftSchema, updateShiftSchema, assignShiftSchema, uuidParamSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { ShiftService } from './shift.service';

const ALL = ['owner', 'accountant', 'viewer'] as const;
const WRITE = ['owner', 'accountant'] as const;

export const shiftRoutes: FastifyPluginAsync = async (app) => {
  app.get('/shifts', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const svc = new ShiftService(req.server.db, req.tenantId);
    return { data: await svc.list() };
  });

  app.post('/shifts', { preHandler: [rbacHook([...WRITE])] }, async (req, reply) => {
    const input = createShiftSchema.parse(req.body);
    const svc = new ShiftService(req.server.db, req.tenantId);
    return reply.status(201).send({ data: await svc.create(input) });
  });

  app.put('/shifts/:id', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = updateShiftSchema.parse(req.body);
    const svc = new ShiftService(req.server.db, req.tenantId);
    return { data: await svc.update(id, input) };
  });

  app.delete('/shifts/:id', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new ShiftService(req.server.db, req.tenantId);
    return { data: await svc.remove(id) };
  });

  app.post('/shifts/assign', { preHandler: [rbacHook([...WRITE])] }, async (req, reply) => {
    const input = assignShiftSchema.parse(req.body);
    const svc = new ShiftService(req.server.db, req.tenantId);
    return reply.status(201).send({ data: await svc.assign(input) });
  });

  app.get('/employees/:id/shifts', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new ShiftService(req.server.db, req.tenantId);
    return { data: await svc.listAssignments(id) };
  });
};
