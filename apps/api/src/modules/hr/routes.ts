import { FastifyPluginAsync } from 'fastify';
import {
  createExpenseClaimSchema,
  updateExpenseClaimSchema,
  approveClaimSchema,
  expenseClaimFilterSchema,
  uuidParamSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { WebhookEndpointService } from '../webhooks/webhook-endpoint.service';
import { ExpenseClaimService } from './expense-claim.service';
import { departmentRoutes } from './department.routes';
import { designationRoutes } from './designation.routes';
import { employeeRoutes } from './employee.routes';
import { shiftRoutes } from './shift.routes';
import { attendanceRoutes } from './attendance.routes';
import { holidayRoutes } from './holiday.routes';
import { leaveRoutes } from './leave.routes';
import { payrollRoutes } from './payroll.routes';
import { payrollStatutoryRoutes } from './payroll-statutory.routes';
import { employeePaymentRoutes } from './payroll/employee-payment.routes';
import { tdsRoutes } from './tds/tds.routes';
import { wageRegisterRoutes } from './wage-register.routes';
import { hrDashboardRoutes } from './dashboard.routes';
import { ExpenseClaimPostingService } from './expense-claim-posting.service';
import { StatutoryCalendarService } from './statutory-calendar.service';
import { z } from 'zod';

const postExpenseClaimSchema = z.object({ employeeId: z.string().uuid() });

const ALL_ROLES = ['owner', 'accountant', 'viewer'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;

export const hrRoutes: FastifyPluginAsync = async (app) => {
  await app.register(departmentRoutes);
  await app.register(designationRoutes);
  await app.register(employeeRoutes);
  await app.register(shiftRoutes);
  await app.register(attendanceRoutes);
  await app.register(holidayRoutes);
  await app.register(leaveRoutes);
  await app.register(payrollRoutes);
  await app.register(payrollStatutoryRoutes);
  await app.register(employeePaymentRoutes);
  await app.register(tdsRoutes);
  await app.register(wageRegisterRoutes);
  await app.register(hrDashboardRoutes);

  // Upcoming statutory deadlines (TDS deposits, Form 24Q, PT) with filing status.
  app.get(
    '/statutory-calendar',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request) => {
      const svc = new StatutoryCalendarService(request.server.db, request.tenantId);
      return { data: await svc.upcoming() };
    },
  );

  // Post an approved expense claim straight to the GL — no AP bill. Books
  // Dr <expense accounts> / Cr 2111 Employee Reimbursements Payable, which
  // is later cleared by an employee_payments row when the claimant is paid.
  app.post(
    '/expense-claims/:id/post',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const { employeeId } = postExpenseClaimSchema.parse(request.body);
      const svc = new ExpenseClaimPostingService(request.server.db, request.tenantId);
      return { data: await svc.post(id, employeeId, request.user!.userId) };
    },
  );

  // --- Expense Claims ---

  app.get(
    '/expense-claims',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request) => {
      const filters = expenseClaimFilterSchema.parse(request.query);
      const service = new ExpenseClaimService(request.server.db, request.tenantId);
      const data = await service.list(filters);
      return { data };
    },
  );

  app.post(
    '/expense-claims',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request, reply) => {
      const input = createExpenseClaimSchema.parse(request.body);
      const service = new ExpenseClaimService(request.server.db, request.tenantId);
      const data = await service.create(input, request.user!.userId);
      return reply.status(201).send({ data });
    },
  );

  app.get(
    '/expense-claims/:id',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new ExpenseClaimService(request.server.db, request.tenantId);
      const data = await service.getById(id);
      return { data };
    },
  );

  app.put(
    '/expense-claims/:id/submit',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new ExpenseClaimService(request.server.db, request.tenantId);
      const data = await service.submit(id);

      const webhooks = new WebhookEndpointService(request.server.db, request.tenantId);
      void webhooks.deliver('expense_claim.submitted', {
        claimId: data.id,
        claimNumber: data.claimNumber,
        totalAmount: data.totalAmount,
      });

      return { data };
    },
  );

  app.put(
    '/expense-claims/:id/approve',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = approveClaimSchema.parse(request.body);
      const service = new ExpenseClaimService(request.server.db, request.tenantId);
      const data = await service.approve(id, request.user!.userId, input.approved, input.rejectionReason);

      const webhooks = new WebhookEndpointService(request.server.db, request.tenantId);
      void webhooks.deliver('expense_claim.approved', {
        claimId: data.id,
        claimNumber: data.claimNumber,
        totalAmount: data.totalAmount,
      });

      return { data };
    },
  );

  app.put(
    '/expense-claims/:id/reimburse',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new ExpenseClaimService(request.server.db, request.tenantId);
      const data = await service.markReimbursed(id);
      return { data };
    },
  );

  // PUT /expense-claims/:id  — full replace (header + items). Refuses
  // when the claim is already reimbursed or rejected.
  app.put(
    '/expense-claims/:id',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = updateExpenseClaimSchema.parse(request.body);
      const service = new ExpenseClaimService(request.server.db, request.tenantId);
      const data = await service.update(id, input);
      return { data };
    },
  );

  // DELETE /expense-claims/:id  — hard delete (items cascade). Refuses
  // when the claim has been reimbursed (money already moved).
  app.delete(
    '/expense-claims/:id',
    { preHandler: [rbacHook([...WRITE_ROLES])] },
    async (request, reply) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new ExpenseClaimService(request.server.db, request.tenantId);
      await service.hardDelete(id);
      return reply.status(204).send();
    },
  );
};
