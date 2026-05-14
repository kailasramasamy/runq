import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createHolidaySchema, updateHolidaySchema, uuidParamSchema } from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { HolidayService } from './holiday.service';

const ALL = ['owner', 'accountant', 'viewer'] as const;
const WRITE = ['owner', 'accountant'] as const;

const yearQuery = z.object({ year: z.coerce.number().int().min(2000).max(2100).optional() });

export const holidayRoutes: FastifyPluginAsync = async (app) => {
  app.get('/holidays', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const { year } = yearQuery.parse(req.query);
    const svc = new HolidayService(req.server.db, req.tenantId);
    return { data: await svc.list(year) };
  });

  app.post('/holidays', { preHandler: [rbacHook([...WRITE])] }, async (req, reply) => {
    const input = createHolidaySchema.parse(req.body);
    const svc = new HolidayService(req.server.db, req.tenantId);
    return reply.status(201).send({ data: await svc.create(input) });
  });

  app.put('/holidays/:id', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = updateHolidaySchema.parse(req.body);
    const svc = new HolidayService(req.server.db, req.tenantId);
    return { data: await svc.update(id, input) };
  });

  app.delete('/holidays/:id', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new HolidayService(req.server.db, req.tenantId);
    return { data: await svc.remove(id) };
  });
};
