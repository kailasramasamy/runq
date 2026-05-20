import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  upsertAttendanceSchema, bulkAttendanceSchema, attendanceFilterSchema,
  biometricImportSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { AttendanceService } from './attendance.service';
import { resolveHrAccessScope } from './access-scope';

const ALL = ['owner', 'accountant', 'viewer', 'hr'] as const;
const WRITE = ['owner', 'accountant', 'hr'] as const;
// Viewers (employees) can stamp their own attendance only — guarded
// in-handler against the resolved employee.id. Admin write-roles can
// stamp anyone.
const SELF_OR_WRITE = ['owner', 'accountant', 'hr', 'viewer'] as const;

const dateOnlyQuery = z.object({ date: z.string().date() });

export const attendanceRoutes: FastifyPluginAsync = async (app) => {
  app.get('/attendance', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const filter = attendanceFilterSchema.parse(req.query);
    const scope = await resolveHrAccessScope(req);
    const svc = new AttendanceService(req.server.db, req.tenantId, scope);
    return { data: await svc.list(filter) };
  });

  app.post('/attendance', { preHandler: [rbacHook([...SELF_OR_WRITE])] }, async (req, reply) => {
    const input = upsertAttendanceSchema.parse(req.body);
    // Viewers are gated to their access scope:
    //   - kind:'self'   → can only stamp their own row
    //   - kind:'subset' → can stamp anyone in their reporting subtree
    //                     (manager marking attendance for their team)
    //   - kind:'all'    → never reached here; admin write-roles below
    // Admin / accountant / hr fall through with no extra restriction.
    if (req.activeRole === 'viewer') {
      const scope = await resolveHrAccessScope(req);
      final: {
        if (scope.kind === 'self' && scope.selfEmployeeId === input.employeeId) break final;
        if (scope.kind === 'subset' && scope.ids.has(input.employeeId)) break final;
        return reply.status(403).send({
          message: scope.kind === 'subset'
            ? 'You can only stamp attendance for yourself or your team'
            : 'Viewers can only stamp their own attendance',
        });
      }
    }
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
    const scope = await resolveHrAccessScope(req);
    const svc = new AttendanceService(req.server.db, req.tenantId, scope);
    return { data: await svc.dailyMuster(date) };
  });
};
