import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
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

const ALL = ['owner', 'accountant', 'viewer', 'hr'] as const;
const WRITE = ['owner', 'accountant', 'hr'] as const;

const carryForwardSchema = z.object({
  fromYear: z.number().int().min(2000).max(2100),
  toYear: z.number().int().min(2000).max(2100),
});

const leaveTypesQuerySchema = z.object({
  // Mobile clients pass their own employee id to hide gender-gated
  // types they can't use. Omit on admin screens to see every type.
  forEmployeeId: z.string().uuid().optional(),
});

export const leaveRoutes: FastifyPluginAsync = async (app) => {
  // --- Leave types ---
  app.get('/leave-types', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const { forEmployeeId } = leaveTypesQuerySchema.parse(req.query);
    const svc = new LeaveTypeService(req.server.db, req.tenantId);
    return { data: await svc.list({ forEmployeeId }) };
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
    return reply.status(201).send({ data: await svc.create(input) });
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
    return { data: await svc.review(id, input, req.user!.userId) };
  });

  app.put('/leave-requests/:id/cancel', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const scope = await resolveHrAccessScope(req);
    const svc = new LeaveRequestService(req.server.db, req.tenantId, scope);
    return { data: await svc.cancel(id) };
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
