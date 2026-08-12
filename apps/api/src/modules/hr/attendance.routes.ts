import { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  upsertAttendanceSchema, bulkAttendanceSchema, attendanceFilterSchema,
  biometricImportSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { AttendanceService } from './attendance.service';
import { resolveHrAccessScope } from './access-scope';
import { HrNotifier } from './hr-notifier';
import { fetchLeaveNoticeData } from './leave.routes';

const ALL = ['owner', 'accountant', 'viewer', 'hr'] as const;
const WRITE = ['owner', 'accountant', 'hr'] as const;
// Viewers (employees) can stamp their own attendance only — guarded
// in-handler against the resolved employee.id. Admin write-roles can
// stamp anyone.
const SELF_OR_WRITE = ['owner', 'accountant', 'hr', 'viewer'] as const;

const dateOnlyQuery = z.object({ date: z.string().date() });
const clearDayQuery = z.object({
  employeeId: z.string().uuid(),
  date: z.string().date(),
});

/// Viewers are gated to their access scope on any attendance write:
///   - kind:'self'   → only their own row
///   - kind:'subset' → anyone in their reporting subtree (a manager
///                     marking for their team)
///   - kind:'all'    → never reached; admin write-roles skip this check
/// Returns the refusal message, or null when the write is allowed.
async function refuseOutOfScope(
  req: FastifyRequest, employeeId: string,
): Promise<string | null> {
  if (req.activeRole !== 'viewer') return null;
  const scope = await resolveHrAccessScope(req);
  if (scope.kind === 'self' && scope.selfEmployeeId === employeeId) return null;
  if (scope.kind === 'subset' && scope.ids.has(employeeId)) return null;
  return scope.kind === 'subset'
    ? 'You can only change attendance for yourself or your team'
    : 'Viewers can only change their own attendance';
}

export const attendanceRoutes: FastifyPluginAsync = async (app) => {
  app.get('/attendance', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const filter = attendanceFilterSchema.parse(req.query);
    const scope = await resolveHrAccessScope(req);
    const svc = new AttendanceService(req.server.db, req.tenantId, scope);
    return { data: await svc.list(filter) };
  });

  app.post('/attendance', { preHandler: [rbacHook([...SELF_OR_WRITE])] }, async (req, reply) => {
    const input = upsertAttendanceSchema.parse(req.body);
    const refusal = await refuseOutOfScope(req, input.employeeId);
    if (refusal) return reply.status(403).send({ message: refusal });
    const svc = new AttendanceService(req.server.db, req.tenantId);
    return reply.status(201).send({ data: await svc.upsert(input) });
  });

  // Undo for a mis-marked day. Keyed on employee + date rather than the
  // row id: the calendar knows the day, and a leave-backed day may have
  // no row of its own to point at.
  app.delete('/attendance', { preHandler: [rbacHook([...SELF_OR_WRITE])] }, async (req, reply) => {
    const input = clearDayQuery.parse(req.query);
    const refusal = await refuseOutOfScope(req, input.employeeId);
    if (refusal) return reply.status(403).send({ message: refusal });
    const svc = new AttendanceService(req.server.db, req.tenantId);
    const data = await svc.clearDay(input.employeeId, input.date);

    // Wiping a day can take an approved leave with it — same notice the
    // explicit cancel route sends, so the manager isn't left with a stale
    // picture of who's off.
    const gone = data.cancelledLeave;
    if (gone) {
      fetchLeaveNoticeData(req.server.db, req.tenantId, input.employeeId, gone.leaveTypeId)
        .then(({ fullName, leaveTypeName }) =>
          new HrNotifier(req.server.db, req.tenantId).notifyManagerOf(input.employeeId, {
            source: 'hr_leave',
            title: 'Leave cancelled',
            body: `Approved ${leaveTypeName} for ${fullName} (${gone.fromDate}–${gone.toDate}) was cleared from the calendar.`,
            targetUrl: '/hr/leave-requests',
          }),
        )
        .catch((e) => req.log.error(e, 'attendance:clear notify failed'));
    }

    return { data };
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

    if (data.errorCount > 0) {
      const notifier = new HrNotifier(req.server.db, req.tenantId);
      notifier.notifyUser(req.user!.userId, {
        type: 'warn',
        source: 'hr_attendance',
        title: 'Attendance import had errors',
        body: `${data.errorCount} of ${data.totalRecords} rows failed to import.`,
        targetUrl: '/hr/attendance-punches',
      }).catch((e) => req.log.error(e, 'biometric-import notify failed'));
    }

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
