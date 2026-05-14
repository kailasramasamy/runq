import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  upsertAttendanceSchema, bulkAttendanceSchema, attendanceFilterSchema,
  biometricImportSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { AttendanceService } from './attendance.service';

const ALL = ['owner', 'accountant', 'viewer'] as const;
const WRITE = ['owner', 'accountant'] as const;

const dateOnlyQuery = z.object({ date: z.string().date() });

export const attendanceRoutes: FastifyPluginAsync = async (app) => {
  app.get('/attendance', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const filter = attendanceFilterSchema.parse(req.query);
    const svc = new AttendanceService(req.server.db, req.tenantId);
    return { data: await svc.list(filter) };
  });

  app.post('/attendance', { preHandler: [rbacHook([...WRITE])] }, async (req, reply) => {
    const input = upsertAttendanceSchema.parse(req.body);
    const svc = new AttendanceService(req.server.db, req.tenantId);
    return reply.status(201).send({ data: await svc.upsert(input) });
  });

  app.post('/attendance/bulk', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { records } = bulkAttendanceSchema.parse(req.body);
    const svc = new AttendanceService(req.server.db, req.tenantId);
    return { data: await svc.bulkUpsert(records) };
  });

  app.post('/attendance/biometric-import', { preHandler: [rbacHook([...WRITE])] }, async (req, reply) => {
    const input = biometricImportSchema.parse(req.body);
    const svc = new AttendanceService(req.server.db, req.tenantId);
    const data = await svc.importBiometric(input, req.user!.userId);
    return reply.status(201).send({ data });
  });

  app.get('/attendance/imports', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const svc = new AttendanceService(req.server.db, req.tenantId);
    return { data: await svc.listImports() };
  });

  app.get('/attendance/muster', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const { date } = dateOnlyQuery.parse(req.query);
    const svc = new AttendanceService(req.server.db, req.tenantId);
    return { data: await svc.dailyMuster(date) };
  });
};
