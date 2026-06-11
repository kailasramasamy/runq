import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createHolidaySchema, updateHolidaySchema, uuidParamSchema,
  bulkCreateHolidaysSchema, suggestHolidaysSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { AppError } from '../../utils/errors';
import { isAIEnabled } from '../../utils/ai/claude.service';
import { HolidayService } from './holiday.service';
import { generateHolidaysForYear } from './holiday-generator';

const ALL = ['owner', 'accountant', 'viewer', 'hr'] as const;
const WRITE = ['owner', 'accountant', 'hr'] as const;

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

  // AI assistant: propose Indian holidays for a year (does NOT persist).
  app.post('/holidays/suggest', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    if (!isAIEnabled()) throw new AppError(503, 'AI features are not enabled');
    const { year, state } = suggestHolidaysSchema.parse(req.body);
    return { data: await generateHolidaysForYear({ year, state }) };
  });

  // Bulk-insert reviewed holidays, skipping ones that already exist.
  app.post('/holidays/bulk', { preHandler: [rbacHook([...WRITE])] }, async (req, reply) => {
    const { holidays } = bulkCreateHolidaysSchema.parse(req.body);
    const svc = new HolidayService(req.server.db, req.tenantId);
    return reply.status(201).send({ data: await svc.bulkCreate(holidays) });
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
