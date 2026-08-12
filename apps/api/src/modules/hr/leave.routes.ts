import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { employees, leaveRequests, leaveTypes } from '@runq/db';
import {
  createLeaveTypeSchema, updateLeaveTypeSchema,
  createLeaveRequestSchema, updateLeaveRequestSchema, reviewLeaveRequestSchema, leaveRequestFilterSchema,
  leaveBalanceQuerySchema, adjustLeaveBalanceSchema, uuidParamSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { LeaveTypeService } from './leave-type.service';
import { LeaveBalanceService } from './leave-balance.service';
import { LeaveRequestService } from './leave-request.service';
import { resolveHrAccessScope } from './access-scope';
import { HrNotifier } from './hr-notifier';

/** Fetch the minimal data needed to build leave notification copy. */
export async function fetchLeaveNoticeData(
  db: import('@runq/db').Db,
  tenantId: string,
  employeeId: string,
  leaveTypeId: string,
): Promise<{ fullName: string; leaveTypeName: string }> {
  const [[emp], [lt]] = await Promise.all([
    db.select({ firstName: employees.firstName, lastName: employees.lastName })
      .from(employees)
      .where(and(eq(employees.id, employeeId), eq(employees.tenantId, tenantId)))
      .limit(1),
    db.select({ name: leaveTypes.name })
      .from(leaveTypes)
      .where(and(eq(leaveTypes.id, leaveTypeId), eq(leaveTypes.tenantId, tenantId)))
      .limit(1),
  ]);
  const fullName = emp
    ? `${emp.firstName}${emp.lastName ? ' ' + emp.lastName : ''}`
    : 'An employee';
  return { fullName, leaveTypeName: lt?.name ?? 'leave' };
}

const ALL = ['owner', 'accountant', 'viewer', 'hr'] as const;
const WRITE = ['owner', 'accountant', 'hr'] as const;

const carryForwardSchema = z.object({
  fromYear: z.number().int().min(2000).max(2100),
  toYear: z.number().int().min(2000).max(2100),
});

const initializeBalancesSchema = z.object({
  year: z.number().int().min(2000).max(2100),
});

const leaveTypesQuerySchema = z.object({
  // Mobile clients pass their own employee id to hide gender-gated
  // types they can't use. Omit on admin screens to see every type.
  forEmployeeId: z.string().uuid().optional(),
  // Retired types stay in the table so history keeps resolving, but
  // they're hidden everywhere by default. Only the leave-types admin
  // screen asks for them, so it can show and re-activate them.
  includeInactive: z.coerce.boolean().optional(),
});

export const leaveRoutes: FastifyPluginAsync = async (app) => {
  // --- Leave types ---
  app.get('/leave-types', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const { forEmployeeId, includeInactive } = leaveTypesQuerySchema.parse(req.query);
    const svc = new LeaveTypeService(req.server.db, req.tenantId);
    return { data: await svc.list({ forEmployeeId, includeInactive }) };
  });

  app.post('/leave-types', { preHandler: [rbacHook([...WRITE])] }, async (req, reply) => {
    const input = createLeaveTypeSchema.parse(req.body);
    const svc = new LeaveTypeService(req.server.db, req.tenantId);
    return reply.status(201).send({ data: await svc.create(input) });
  });

  app.put('/leave-types/:id', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = updateLeaveTypeSchema.parse(req.body);
    const svc = new LeaveTypeService(req.server.db, req.tenantId);
    return { data: await svc.update(id, input) };
  });

  app.delete('/leave-types/:id', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new LeaveTypeService(req.server.db, req.tenantId);
    return { data: await svc.remove(id) };
  });

  app.post('/leave-types/seed-defaults', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const svc = new LeaveTypeService(req.server.db, req.tenantId);
    return { data: await svc.seedDefaults() };
  });

  // --- Leave balances ---
  app.get('/leave-balances', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const filter = leaveBalanceQuerySchema.parse(req.query);
    // Scope applies — a viewer sees only their own / their team's balances.
    const scope = await resolveHrAccessScope(req);
    const svc = new LeaveBalanceService(req.server.db, req.tenantId, scope);
    return { data: await svc.list(filter) };
  });

  app.put('/leave-balances', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const input = adjustLeaveBalanceSchema.parse(req.body);
    const svc = new LeaveBalanceService(req.server.db, req.tenantId);
    return { data: await svc.adjust(input) };
  });

  app.post('/leave-balances/carry-forward', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const input = carryForwardSchema.parse(req.body);
    const svc = new LeaveBalanceService(req.server.db, req.tenantId);
    return { data: await svc.carryForward(input.fromYear, input.toYear) };
  });

  // Bulk-provision balances for every active employee — onboard an
  // existing workforce, or open a new leave year. Idempotent.
  app.post('/leave-balances/initialize', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { year } = initializeBalancesSchema.parse(req.body);
    const svc = new LeaveBalanceService(req.server.db, req.tenantId);
    return { data: await svc.provisionAll(year) };
  });

  // --- Leave requests ---
  app.get('/leave-requests', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const filter = leaveRequestFilterSchema.parse(req.query);
    const scope = await resolveHrAccessScope(req);
    const svc = new LeaveRequestService(req.server.db, req.tenantId, scope);
    return { data: await svc.list(filter) };
  });

  app.get('/leave-requests/:id', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const scope = await resolveHrAccessScope(req);
    const svc = new LeaveRequestService(req.server.db, req.tenantId, scope);
    return { data: await svc.getById(id) };
  });

  app.post('/leave-requests', { preHandler: [rbacHook([...ALL])] }, async (req, reply) => {
    const input = createLeaveRequestSchema.parse(req.body);
    // Submission is self-serve; the service already checks the employee
    // belongs to the tenant. No scope filter needed on insert.
    const svc = new LeaveRequestService(req.server.db, req.tenantId);
    const row = await svc.create(input);

    // Notify manager — best-effort, never fails the request.
    fetchLeaveNoticeData(req.server.db, req.tenantId, row.employeeId, row.leaveTypeId)
      .then(({ fullName, leaveTypeName }) =>
        new HrNotifier(req.server.db, req.tenantId).notifyManagerOf(row.employeeId, {
          source: 'hr_leave',
          title: 'New leave request',
          body: `${fullName} applied for ${row.days} day(s) ${leaveTypeName} from ${row.fromDate}.`,
          targetUrl: '/hr/leave-requests',
        }),
      )
      .catch((e) => req.log.error(e, 'leave:submitted notify failed'));

    return reply.status(201).send({ data: row });
  });

  // `viewer` is allowed at the route level so a reporting manager can
  // approve their team's leave; the service then scope-checks (subtree
  // only) and blocks self-approval. Owner/accountant/hr review org-wide.
  app.put('/leave-requests/:id/review', { preHandler: [rbacHook(['owner', 'accountant', 'hr', 'viewer'])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = reviewLeaveRequestSchema.parse(req.body);
    // Review goes through scope — a manager can only approve their team.
    const scope = await resolveHrAccessScope(req);
    const svc = new LeaveRequestService(req.server.db, req.tenantId, scope);
    const row = await svc.review(id, input, req.user!.userId);

    // Notify employee of outcome — best-effort, never fails the request.
    fetchLeaveNoticeData(req.server.db, req.tenantId, row.employeeId, row.leaveTypeId)
      .then(({ leaveTypeName }) => {
        const notifier = new HrNotifier(req.server.db, req.tenantId);
        if (row.status === 'approved') {
          return notifier.notifyEmployee(row.employeeId, {
            type: 'ok',
            source: 'hr_leave',
            title: 'Leave approved',
            body: `Your ${leaveTypeName} from ${row.fromDate} to ${row.toDate} was approved.`,
            targetUrl: '/hr/leave-requests',
          });
        }
        return notifier.notifyEmployee(row.employeeId, {
          type: 'warn',
          source: 'hr_leave',
          title: 'Leave rejected',
          body: `Your ${leaveTypeName} request was rejected. ${row.rejectionReason ?? ''}`.trimEnd(),
          targetUrl: '/hr/leave-requests',
        });
      })
      .catch((e) => req.log.error(e, 'leave:reviewed notify failed'));

    return { data: row };
  });

  app.put('/leave-requests/:id/cancel', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const scope = await resolveHrAccessScope(req);

    // Capture pre-cancel status to decide whether to notify manager.
    const [pre] = await req.server.db
      .select({ status: leaveRequests.status, employeeId: leaveRequests.employeeId, leaveTypeId: leaveRequests.leaveTypeId, fromDate: leaveRequests.fromDate, toDate: leaveRequests.toDate })
      .from(leaveRequests)
      .where(and(eq(leaveRequests.id, id), eq(leaveRequests.tenantId, req.tenantId)))
      .limit(1);

    const svc = new LeaveRequestService(req.server.db, req.tenantId, scope);
    const row = await svc.cancel(id);

    // Only notify manager if the cancelled leave was previously approved.
    if (pre?.status === 'approved') {
      fetchLeaveNoticeData(req.server.db, req.tenantId, row.employeeId, row.leaveTypeId)
        .then(({ fullName, leaveTypeName }) =>
          new HrNotifier(req.server.db, req.tenantId).notifyManagerOf(row.employeeId, {
            source: 'hr_leave',
            title: 'Leave cancelled',
            body: `${fullName} cancelled approved ${leaveTypeName} (${row.fromDate}–${row.toDate}).`,
            targetUrl: '/hr/leave-requests',
          }),
        )
        .catch((e) => req.log.error(e, 'leave:cancelled notify failed'));
    }

    return { data: row };
  });

  // Edit a pending request. ALL roles can hit this; scope keeps viewers
  // / managers from touching out-of-team rows, and the service itself
  // refuses anything not in 'pending'.
  app.put('/leave-requests/:id', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = updateLeaveRequestSchema.parse(req.body);
    const scope = await resolveHrAccessScope(req);
    const svc = new LeaveRequestService(req.server.db, req.tenantId, scope);
    return { data: await svc.update(id, input) };
  });
};
