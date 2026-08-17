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
import { resolveHrAccessScope, resolveSelfEmployeeId } from './access-scope';
import { departmentRoutes } from './department.routes';
import { designationRoutes } from './designation.routes';
import { employeeRoutes } from './employee.routes';
import { employeePhotoRoutes } from './employee-photo.routes';
import { resumeRoutes } from './resume.routes';
import { hrDirectoryRoutes } from './directory.routes';
import { hrInviteRoutes } from './invite.routes';
import { shiftRoutes } from './shift.routes';
import { attendanceRoutes } from './attendance.routes';
import { holidayRoutes } from './holiday.routes';
import { leaveRoutes } from './leave.routes';
import { payrollRoutes } from './payroll.routes';
import { payrollStatutoryRoutes } from './payroll-statutory.routes';
import { employeePaymentRoutes } from './payroll/employee-payment.routes';
import { deductionRoutes } from './payroll/deduction.routes';
import { tdsRoutes } from './tds/tds.routes';
import { wageRegisterRoutes } from './wage-register.routes';
import { hrDashboardRoutes } from './dashboard.routes';
import { hrAnnouncementRoutes } from './announcement.routes';
import { hrRecentActivityRoutes } from './recent-activity.routes';
import { geoAttendanceRoutes } from './phase-next/geo-attendance.routes';
import { taxLoansRoutes } from './phase-next/tax-loans.routes';
import { lifecycleRoutes } from './phase-next/lifecycle.routes';
import { helpdeskPerformanceRoutes } from './phase-next/helpdesk-performance.routes';
import { ExpenseClaimPostingService } from './expense-claim-posting.service';
import { rewardRoutes } from './reward.routes';
import { contractRoutes } from './contracts/routes';
import { StatutoryCalendarService } from './statutory-calendar.service';
import { employees, users, payslips, payrollRuns } from '@runq/db';
import { and, eq, sql, desc } from 'drizzle-orm';
import { z } from 'zod';

const postExpenseClaimSchema = z.object({ employeeId: z.string().uuid() });

// `hr` reads every HR surface tenant-wide; `viewer` is gated per-scope in
// the service layer. Money-movement (expense-claim post/reimburse/delete)
// stays on WRITE_ROLES — that books GL entries, which `hr` may not do.
const ALL_ROLES = ['owner', 'accountant', 'viewer', 'hr'] as const;
const WRITE_ROLES = ['owner', 'accountant'] as const;

export const hrRoutes: FastifyPluginAsync = async (app) => {
  await app.register(departmentRoutes);
  await app.register(designationRoutes);
  await app.register(employeeRoutes);
  await app.register(employeePhotoRoutes);
  await app.register(resumeRoutes);
  await app.register(hrDirectoryRoutes);
  await app.register(hrInviteRoutes);
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
  await app.register(hrAnnouncementRoutes);
  await app.register(hrRecentActivityRoutes);
  await app.register(geoAttendanceRoutes);
  await app.register(taxLoansRoutes);
  await app.register(deductionRoutes);
  await app.register(lifecycleRoutes);
  await app.register(helpdeskPerformanceRoutes);
  await app.register(rewardRoutes);
  await app.register(contractRoutes);

  // GET /hr/me — resolve the logged-in user to their employee record (by
  // email match within the tenant) and indicate whether they should see
  // manager-only surfaces in the mobile app. `isManager` is true for system
  // roles owner/accountant OR when the matched employee has direct reports.
  // Returns 204 when the user has no employee row (web-only admin/CA login).
  app.get(
    '/me',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request, reply) => {
      const userId = request.user!.userId;
      const tenantId = request.tenantId;

      const [userRow] = await request.server.db
        .select({ email: users.email, role: users.role, phone: users.phone })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!userRow) return reply.status(404).send({ message: 'User not found' });

      // Match the employee row by email (web/email-login users) OR by
      // digit-normalised phone (mobile OTP-login users). Employees added
      // with phone-only — no email — used to fall through here, leaving
      // mobile users stranded with "No employee record linked".
      const empFields = {
        id: employees.id,
        employeeCode: employees.employeeCode,
        firstName: employees.firstName,
        lastName: employees.lastName,
        email: employees.email,
        photoUrl: employees.photoUrl,
        designationId: employees.designationId,
        departmentId: employees.departmentId,
        status: employees.status,
      };
      const phoneDigits = userRow.phone ?? '';
      const [emp] = await request.server.db
        .select(empFields)
        .from(employees)
        .where(
          and(
            eq(employees.tenantId, tenantId),
            sql`(
              lower(${employees.email}) = lower(${userRow.email})
              OR (
                ${phoneDigits} <> ''
                AND regexp_replace(coalesce(${employees.phone}, ''), '\\D', '', 'g') IN (${phoneDigits}, ${'91' + phoneDigits})
              )
            )`,
          ),
        )
        .limit(1);

      const isSystemManager = userRow.role === 'owner' || userRow.role === 'accountant';
      let hasReports = false;
      if (emp) {
        const [{ count }] = await request.server.db
          .select({ count: sql<number>`count(*)::int` })
          .from(employees)
          .where(
            and(
              eq(employees.tenantId, tenantId),
              eq(employees.reportingToId, emp.id),
            ),
          );
        hasReports = (count ?? 0) > 0;
      }

      // Surface the access scope so the mobile/web UI can label the
      // dashboard correctly ("Showing your team (N)" vs "Showing all").
      // Cheap — the resolver is memoised per request and the result is
      // a single integer (count or null).
      const { resolveHrAccessScope } = await import('./access-scope');
      const scope = await resolveHrAccessScope(request);
      const scopeKind = scope.kind;
      const visibleCount = scope.kind === 'subset' ? scope.ids.size
        : scope.kind === 'self' ? 1
        : null; // null = org-wide

      return {
        data: {
          employee: emp ?? null,
          isManager: isSystemManager || hasReports,
          systemRole: userRow.role,
          scopeKind,
          visibleCount,
        },
      };
    },
  );

  // GET /hr/me/payslips — last N payslips for the logged-in user's employee
  // record (newest first). Mobile uses this for the Pay tab without having
  // to know any payroll-run IDs. Each row includes month/year/runStatus so
  // the UI can render period + payment status without a second fetch.
  app.get(
    '/me/payslips',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request) => {
      const tenantId = request.tenantId;
      const employeeId = await resolveSelfEmployeeId(
        request.server.db, tenantId, request.user!.userId);
      if (!employeeId) return { data: [] };

      const rows = await request.server.db
        .select({
          ps: payslips,
          month: payrollRuns.month,
          year: payrollRuns.year,
          runStatus: payrollRuns.status,
        })
        .from(payslips)
        .innerJoin(payrollRuns, eq(payrollRuns.id, payslips.payrollRunId))
        .where(
          and(eq(payslips.tenantId, tenantId), eq(payslips.employeeId, employeeId)),
        )
        .orderBy(desc(payrollRuns.year), desc(payrollRuns.month))
        .limit(24);

      return {
        data: rows.map((r) => ({
          ...r.ps,
          month: r.month,
          year: r.year,
          runStatus: r.runStatus,
        })),
      };
    },
  );

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
      // Scope the list — a viewer sees only their own claims, a manager
      // their team's; owner/accountant/hr see all.
      const scope = await resolveHrAccessScope(request);
      const service = new ExpenseClaimService(request.server.db, request.tenantId, scope);
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

  // Approval — opened up to viewer so a reporting manager can decide on
  // their team's claims. The service then scope-checks (only their
  // subtree) and refuses self-approval. Owner / accountant / HR keep
  // org-wide approval rights.
  app.put(
    '/expense-claims/:id/approve',
    { preHandler: [rbacHook(['owner', 'accountant', 'hr', 'viewer'])] },
    async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = approveClaimSchema.parse(request.body);
      const scope = await resolveHrAccessScope(request);
      const service = new ExpenseClaimService(request.server.db, request.tenantId, scope);
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
