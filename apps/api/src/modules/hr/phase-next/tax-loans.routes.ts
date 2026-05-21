import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq, desc, sql } from 'drizzle-orm';
import {
  taxDeclarations, taxDeclarationItems,
  employeeLoans, employeeLoanInstalments, hrLoanPolicy,
  employees,
} from '@runq/db';
import {
  uuidParamSchema,
  createTaxDeclarationSchema, updateTaxDeclarationSchema, reviewTaxDeclarationSchema,
  createLoanSchema, approveLoanSchema, rejectLoanSchema, requestLoanSchema,
  loanPolicySchema,
} from '@runq/validators';
import { rbacHook } from '../../../hooks/rbac';
import { NotFoundError, ConflictError, ForbiddenError } from '../../../utils/errors';
import { resolveSelfEmployee } from './self-employee';
import { HrNotifier } from '../hr-notifier';

const ALL = ['owner', 'accountant', 'viewer', 'hr'] as const;
const WRITE = ['owner', 'accountant', 'hr'] as const;
const REVIEW = ['owner', 'accountant', 'hr'] as const;
// Company-wide admin lists (everyone's tax declarations / loans) — viewer
// excluded; employees use the /me/* routes for their own records.
const MANAGE = ['owner', 'accountant', 'hr'] as const;

function num(n: number | undefined, dflt = '0') {
  return n === undefined ? dflt : n.toString();
}

function empName(firstName: string, lastName: string | null): string {
  return [firstName, lastName].filter(Boolean).join(' ');
}

export const taxLoansRoutes: FastifyPluginAsync = async (app) => {
  // ===== TAX DECLARATIONS =====
  // Employee self-service.
  app.get('/me/tax-declarations', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const emp = await resolveSelfEmployee(req.server.db, req.tenantId, req.user!.userId);
    const rows = await req.server.db
      .select()
      .from(taxDeclarations)
      .where(and(
        eq(taxDeclarations.tenantId, req.tenantId),
        eq(taxDeclarations.employeeId, emp.id),
      ))
      .orderBy(desc(taxDeclarations.financialYear));
    return { data: rows };
  });

  app.post('/me/tax-declarations', { preHandler: [rbacHook([...ALL])] }, async (req, reply) => {
    const input = createTaxDeclarationSchema.parse(req.body);
    const emp = await resolveSelfEmployee(req.server.db, req.tenantId, req.user!.userId);
    const data = await upsertDeclaration(req.server.db, req.tenantId, emp.id, input);
    return reply.status(201).send({ data });
  });

  app.put('/me/tax-declarations/:id/submit', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const emp = await resolveSelfEmployee(req.server.db, req.tenantId, req.user!.userId);
    const [row] = await req.server.db
      .update(taxDeclarations)
      .set({ status: 'submitted', submittedAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(taxDeclarations.id, id),
        eq(taxDeclarations.tenantId, req.tenantId),
        eq(taxDeclarations.employeeId, emp.id),
        sql`${taxDeclarations.status} IN ('draft','rejected')`,
      ))
      .returning();
    if (!row) throw new NotFoundError('Draft tax declaration');

    const notifier = new HrNotifier(req.server.db, req.tenantId);
    notifier.notifyHrAdmins({
      source: 'hr_tax',
      title: 'Tax declaration to review',
      body: `${empName(emp.firstName, emp.lastName)} submitted their ${row.financialYear} Form 12BB.`,
      targetUrl: '/hr/tax-declarations',
    }, req.user!.userId).catch((e) => req.log.error(e));

    return { data: row };
  });

  // Withdraw a submitted declaration back to draft so the employee can edit
  // it. Only the owning employee can withdraw, and only while it's still
  // pending HR review — once HR has approved or rejected, the status is
  // locked at the review verdict.
  app.put('/me/tax-declarations/:id/withdraw', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const emp = await resolveSelfEmployee(req.server.db, req.tenantId, req.user!.userId);
    const [row] = await req.server.db
      .update(taxDeclarations)
      .set({ status: 'draft', submittedAt: null, updatedAt: new Date() })
      .where(and(
        eq(taxDeclarations.id, id),
        eq(taxDeclarations.tenantId, req.tenantId),
        eq(taxDeclarations.employeeId, emp.id),
        eq(taxDeclarations.status, 'submitted'),
      ))
      .returning();
    if (!row) throw new ConflictError('Only submitted declarations can be withdrawn');
    return { data: row };
  });

  // HR / admin view.
  app.get('/tax-declarations', { preHandler: [rbacHook([...MANAGE])] }, async (req) => {
    const q = z.object({
      status: z.string().optional(),
      financialYear: z.string().optional(),
      employeeId: z.string().uuid().optional(),
    }).parse(req.query);
    const conds = [eq(taxDeclarations.tenantId, req.tenantId)];
    if (q.status) conds.push(sql`${taxDeclarations.status}::text = ${q.status}`);
    if (q.financialYear) conds.push(eq(taxDeclarations.financialYear, q.financialYear));
    if (q.employeeId) conds.push(eq(taxDeclarations.employeeId, q.employeeId));
    const rows = await req.server.db
      .select({
        d: taxDeclarations,
        firstName: employees.firstName,
        lastName: employees.lastName,
        employeeCode: employees.employeeCode,
      })
      .from(taxDeclarations)
      .innerJoin(employees, eq(employees.id, taxDeclarations.employeeId))
      .where(and(...conds))
      .orderBy(desc(taxDeclarations.createdAt))
      .limit(500);
    return { data: rows.map((r) => ({ ...r.d, firstName: r.firstName, lastName: r.lastName, employeeCode: r.employeeCode })) };
  });

  app.get('/tax-declarations/:id', { preHandler: [rbacHook([...MANAGE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const [d] = await req.server.db
      .select()
      .from(taxDeclarations)
      .where(and(eq(taxDeclarations.id, id), eq(taxDeclarations.tenantId, req.tenantId)))
      .limit(1);
    if (!d) throw new NotFoundError('Tax declaration');
    const items = await req.server.db
      .select()
      .from(taxDeclarationItems)
      .where(eq(taxDeclarationItems.declarationId, id));
    return { data: { ...d, items } };
  });

  app.put('/tax-declarations/:id', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = updateTaxDeclarationSchema.parse(req.body);
    // employee can update only own draft
    const [existing] = await req.server.db
      .select()
      .from(taxDeclarations)
      .where(and(eq(taxDeclarations.id, id), eq(taxDeclarations.tenantId, req.tenantId)))
      .limit(1);
    if (!existing) throw new NotFoundError('Tax declaration');
    if (existing.status !== 'draft' && existing.status !== 'rejected') {
      throw new ConflictError('Declaration is locked');
    }
    const data = await upsertDeclaration(
      req.server.db,
      req.tenantId,
      existing.employeeId,
      { ...input, financialYear: existing.financialYear, items: input.items },
      id,
    );
    return { data };
  });

  app.put('/tax-declarations/:id/review', { preHandler: [rbacHook([...REVIEW])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = reviewTaxDeclarationSchema.parse(req.body);
    const [row] = await req.server.db
      .update(taxDeclarations)
      .set({
        status: input.approved ? 'approved' : 'rejected',
        reviewedBy: req.user!.userId,
        reviewedAt: new Date(),
        rejectionReason: input.rejectionReason ?? null,
        updatedAt: new Date(),
      })
      .where(and(
        eq(taxDeclarations.id, id),
        eq(taxDeclarations.tenantId, req.tenantId),
        eq(taxDeclarations.status, 'submitted'),
      ))
      .returning();
    if (!row) throw new NotFoundError('Submitted declaration');

    const notifier = new HrNotifier(req.server.db, req.tenantId);
    if (input.approved) {
      notifier.notifyEmployee(row.employeeId, {
        type: 'ok',
        source: 'hr_tax',
        title: 'Tax declaration approved',
        body: `Your ${row.financialYear} tax declaration was approved.`,
        targetUrl: '/hr/tax-declarations',
      }).catch((e) => req.log.error(e));
    } else {
      notifier.notifyEmployee(row.employeeId, {
        type: 'warn',
        source: 'hr_tax',
        title: 'Tax declaration rejected',
        body: `Your ${row.financialYear} declaration was rejected. ${row.rejectionReason ?? ''}`.trimEnd(),
        targetUrl: '/hr/tax-declarations',
      }).catch((e) => req.log.error(e));
    }

    return { data: row };
  });

  // ===== LOANS =====
  app.get('/loans', { preHandler: [rbacHook([...MANAGE])] }, async (req) => {
    const q = z.object({
      status: z.string().optional(),
      employeeId: z.string().uuid().optional(),
    }).parse(req.query);
    const conds = [eq(employeeLoans.tenantId, req.tenantId)];
    if (q.status) conds.push(sql`${employeeLoans.status}::text = ${q.status}`);
    if (q.employeeId) conds.push(eq(employeeLoans.employeeId, q.employeeId));
    const rows = await req.server.db
      .select({
        l: employeeLoans,
        firstName: employees.firstName,
        lastName: employees.lastName,
        employeeCode: employees.employeeCode,
      })
      .from(employeeLoans)
      .innerJoin(employees, eq(employees.id, employeeLoans.employeeId))
      .where(and(...conds))
      .orderBy(desc(employeeLoans.createdAt))
      .limit(500);
    return { data: rows.map((r) => ({ ...r.l, firstName: r.firstName, lastName: r.lastName, employeeCode: r.employeeCode })) };
  });

  app.get('/loans/:id', { preHandler: [rbacHook([...MANAGE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const [loan] = await req.server.db
      .select()
      .from(employeeLoans)
      .where(and(eq(employeeLoans.id, id), eq(employeeLoans.tenantId, req.tenantId)))
      .limit(1);
    if (!loan) throw new NotFoundError('Loan');
    const instalments = await req.server.db
      .select()
      .from(employeeLoanInstalments)
      .where(eq(employeeLoanInstalments.loanId, id))
      .orderBy(employeeLoanInstalments.sequence);
    return { data: { ...loan, instalments } };
  });

  app.post('/loans', { preHandler: [rbacHook([...WRITE])] }, async (req, reply) => {
    const input = createLoanSchema.parse(req.body);
    const emi = Math.round((input.principal / input.totalInstalments) * 100) / 100;
    const [loan] = await req.server.db
      .insert(employeeLoans)
      .values({
        tenantId: req.tenantId,
        employeeId: input.employeeId,
        kind: input.kind,
        principal: input.principal.toString(),
        emiAmount: emi.toString(),
        totalInstalments: input.totalInstalments,
        disbursedOn: input.disbursedOn,
        firstEmiMonth: input.firstEmiMonth,
        firstEmiYear: input.firstEmiYear,
        outstanding: input.principal.toString(),
        status: 'draft',
        reason: input.reason,
        createdBy: req.user!.userId,
      })
      .returning();
    return reply.status(201).send({ data: loan });
  });

  app.put('/loans/:id/approve', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = approveLoanSchema.parse(req.body);
    const [loan] = await req.server.db
      .select()
      .from(employeeLoans)
      .where(and(eq(employeeLoans.id, id), eq(employeeLoans.tenantId, req.tenantId)))
      .limit(1);
    if (!loan) throw new NotFoundError('Loan');
    if (loan.status !== 'draft' && loan.status !== 'requested' && loan.status !== 'manager_approved') {
      throw new ConflictError('Loan is not pending approval');
    }
    // If the tenant requires manager approval, the request must clear the
    // manager step first. Owners can still override (skip manager).
    if (loan.status === 'requested') {
      const policy = await getOrInitPolicy(req.server.db, req.tenantId);
      if (policy.managerApprovalRequired && req.activeRole !== 'owner') {
        throw new ConflictError('Manager approval is required before HR can approve this request');
      }
    }

    if (!input.approved) {
      // Reject path retained for back-compat; prefer PUT /loans/:id/reject.
      const [row] = await req.server.db
        .update(employeeLoans)
        .set({ status: 'rejected', updatedAt: new Date() })
        .where(eq(employeeLoans.id, id))
        .returning();
      return { data: row };
    }

    // HR may override disbursement schedule at approval time (typical when
    // employee-requested — they pick desired EMI start, HR sets actual).
    const disbursedOn = input.disbursedOn ?? loan.disbursedOn;
    const firstMonth = input.firstEmiMonth ?? loan.firstEmiMonth;
    const firstYear = input.firstEmiYear ?? loan.firstEmiYear;

    // Generate EMI schedule, mark active, set principal as outstanding.
    const principal = Number(loan.principal);
    const n = loan.totalInstalments;
    const emi = Math.round((principal / n) * 100) / 100;
    const last = Math.round((principal - emi * (n - 1)) * 100) / 100;

    let month = firstMonth;
    let year = firstYear;
    const inst: typeof employeeLoanInstalments.$inferInsert[] = [];
    for (let i = 1; i <= n; i++) {
      inst.push({
        tenantId: req.tenantId,
        loanId: id,
        sequence: i,
        dueMonth: month,
        dueYear: year,
        amount: (i === n ? last : emi).toString(),
      });
      month += 1;
      if (month > 12) { month = 1; year += 1; }
    }
    if (inst.length) await req.server.db.insert(employeeLoanInstalments).values(inst);

    const [row] = await req.server.db
      .update(employeeLoans)
      .set({
        status: 'active',
        disbursedOn,
        firstEmiMonth: firstMonth,
        firstEmiYear: firstYear,
        outstanding: principal.toString(),
        approvedBy: req.user!.userId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(employeeLoans.id, id))
      .returning();

    const notifier = new HrNotifier(req.server.db, req.tenantId);
    notifier.notifyEmployee(row.employeeId, {
      type: 'ok',
      source: 'hr_loan',
      title: 'Loan approved',
      body: `Your ${row.kind} loan of ₹${Number(row.principal).toLocaleString('en-IN')} is approved. EMI ₹${Number(row.emiAmount).toLocaleString('en-IN')}.`,
      targetUrl: '/hr/loans',
    }).catch((e) => req.log.error(e));

    return { data: row };
  });

  app.put('/loans/:id/reject', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = rejectLoanSchema.parse(req.body);
    const [loan] = await req.server.db
      .select()
      .from(employeeLoans)
      .where(and(eq(employeeLoans.id, id), eq(employeeLoans.tenantId, req.tenantId)))
      .limit(1);
    if (!loan) throw new NotFoundError('Loan');
    if (loan.status !== 'draft' && loan.status !== 'requested' && loan.status !== 'manager_approved') {
      throw new ConflictError('Loan is not pending approval');
    }
    const [row] = await req.server.db
      .update(employeeLoans)
      .set({
        status: 'rejected',
        rejectionReason: input.rejectionReason,
        approvedBy: req.user!.userId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(employeeLoans.id, id))
      .returning();

    const notifier = new HrNotifier(req.server.db, req.tenantId);
    notifier.notifyEmployee(row.employeeId, {
      type: 'warn',
      source: 'hr_loan',
      title: 'Loan request rejected',
      body: `Your ${row.kind} loan request was rejected. ${row.rejectionReason ?? ''}`.trimEnd(),
      targetUrl: '/hr/loans',
    }).catch((e) => req.log.error(e));

    return { data: row };
  });

  app.delete('/loans/:id', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const [loan] = await req.server.db
      .select()
      .from(employeeLoans)
      .where(and(eq(employeeLoans.id, id), eq(employeeLoans.tenantId, req.tenantId)))
      .limit(1);
    if (!loan) throw new NotFoundError('Loan');
    if (loan.status === 'active' && Number(loan.outstanding) > 0) {
      throw new ConflictError('Cannot delete an active loan with outstanding balance');
    }
    const [row] = await req.server.db
      .delete(employeeLoans)
      .where(eq(employeeLoans.id, id))
      .returning();
    return { data: row };
  });

  // Employee submits a loan request. Server enforces the tenant loan policy
  // (eligibility + max amount + kind allowed).
  app.post('/me/loans', { preHandler: [rbacHook([...ALL])] }, async (req, reply) => {
    const input = requestLoanSchema.parse(req.body);
    const emp = await resolveSelfEmployee(req.server.db, req.tenantId, req.user!.userId);
    const elig = await evaluateLoanEligibility(req.server.db, req.tenantId, emp.id);
    if (!elig.eligible) {
      throw new ForbiddenError(elig.reasons.join(' '));
    }
    if (elig.policy.allowedKinds && !elig.policy.allowedKinds.includes(input.kind)) {
      throw new ForbiddenError(`Loan type "${input.kind}" is not enabled for employee requests.`);
    }
    if (input.principal > elig.maxAmount) {
      throw new ForbiddenError(`Maximum amount you can request is ₹${elig.maxAmount.toLocaleString('en-IN')}.`);
    }
    const emi = Math.round((input.principal / input.totalInstalments) * 100) / 100;
    const today = new Date().toISOString().slice(0, 10);
    const [loan] = await req.server.db
      .insert(employeeLoans)
      .values({
        tenantId: req.tenantId,
        employeeId: emp.id,
        kind: input.kind,
        principal: input.principal.toString(),
        emiAmount: emi.toString(),
        totalInstalments: input.totalInstalments,
        disbursedOn: today,
        firstEmiMonth: input.firstEmiMonth,
        firstEmiYear: input.firstEmiYear,
        outstanding: input.principal.toString(),
        status: 'requested',
        reason: input.reason,
        createdBy: req.user!.userId,
      })
      .returning();

    const notifier = new HrNotifier(req.server.db, req.tenantId);
    notifier.notifyManagerOf(emp.id, {
      source: 'hr_loan',
      title: 'New loan request',
      body: `${empName(emp.firstName, emp.lastName)} requested a ${loan.kind} loan of ₹${Number(loan.principal).toLocaleString('en-IN')}.`,
      targetUrl: '/hr/loans',
    }).catch((e) => req.log.error(e));

    return reply.status(201).send({ data: loan });
  });

  // Eligibility snapshot — mobile calls this to decide whether to show the
  // request button and to display the per-employee max amount + reasons.
  app.get('/me/loans/eligibility', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const emp = await resolveSelfEmployee(req.server.db, req.tenantId, req.user!.userId);
    const elig = await evaluateLoanEligibility(req.server.db, req.tenantId, emp.id);
    return { data: elig };
  });

  // Employee withdraws their own pending request.
  app.delete('/me/loans/:id', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const emp = await resolveSelfEmployee(req.server.db, req.tenantId, req.user!.userId);
    const [loan] = await req.server.db
      .select()
      .from(employeeLoans)
      .where(and(
        eq(employeeLoans.id, id),
        eq(employeeLoans.tenantId, req.tenantId),
        eq(employeeLoans.employeeId, emp.id),
      ))
      .limit(1);
    if (!loan) throw new NotFoundError('Loan');
    if (loan.status !== 'requested') {
      throw new ConflictError('Only pending requests can be withdrawn');
    }
    const [row] = await req.server.db
      .delete(employeeLoans)
      .where(eq(employeeLoans.id, id))
      .returning();
    return { data: row };
  });

  // Employee detail view of a single own loan, with EMI schedule.
  app.get('/me/loans/:id', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const emp = await resolveSelfEmployee(req.server.db, req.tenantId, req.user!.userId);
    const [loan] = await req.server.db
      .select()
      .from(employeeLoans)
      .where(and(
        eq(employeeLoans.id, id),
        eq(employeeLoans.tenantId, req.tenantId),
        eq(employeeLoans.employeeId, emp.id),
      ))
      .limit(1);
    if (!loan) throw new NotFoundError('Loan');
    const instalments = await req.server.db
      .select()
      .from(employeeLoanInstalments)
      .where(eq(employeeLoanInstalments.loanId, id))
      .orderBy(employeeLoanInstalments.sequence);
    return { data: { ...loan, instalments } };
  });

  // Employee view of own loans.
  app.get('/me/loans', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const emp = await resolveSelfEmployee(req.server.db, req.tenantId, req.user!.userId);
    const rows = await req.server.db
      .select()
      .from(employeeLoans)
      .where(and(
        eq(employeeLoans.tenantId, req.tenantId),
        eq(employeeLoans.employeeId, emp.id),
      ))
      .orderBy(desc(employeeLoans.createdAt));
    return { data: rows };
  });

  // Loans awaiting *this manager's* review. Reports = employees with
  // reporting_to_id pointing at the caller's employee row.
  app.get('/me/team-loan-requests', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const mgr = await resolveSelfEmployee(req.server.db, req.tenantId, req.user!.userId);
    const rows = await req.server.db
      .select({
        l: employeeLoans,
        firstName: employees.firstName,
        lastName: employees.lastName,
        employeeCode: employees.employeeCode,
      })
      .from(employeeLoans)
      .innerJoin(employees, eq(employees.id, employeeLoans.employeeId))
      .where(and(
        eq(employeeLoans.tenantId, req.tenantId),
        eq(employees.reportingToId, mgr.id),
        eq(employeeLoans.status, 'requested'),
      ))
      .orderBy(desc(employeeLoans.createdAt));
    return {
      data: rows.map((r) => ({
        ...r.l, firstName: r.firstName, lastName: r.lastName, employeeCode: r.employeeCode,
      })),
    };
  });

  // Manager-approve: moves status requested → manager_approved. Only the
  // employee's reporting manager (or owner/hr override) may call this.
  app.put('/loans/:id/manager-approve', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const { loan, emp } = await loadLoanWithEmployee(req.server.db, req.tenantId, id);
    await assertCanManagerAct(req.server.db, req.tenantId, req.user!.userId, emp.reportingToId, req.activeRole);
    if (loan.status !== 'requested') throw new ConflictError('Loan is not awaiting manager review');
    const [row] = await req.server.db
      .update(employeeLoans)
      .set({
        status: 'manager_approved',
        managerApprovedBy: req.user!.userId,
        managerApprovedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(employeeLoans.id, id))
      .returning();

    const notifier = new HrNotifier(req.server.db, req.tenantId);
    notifier.notifyHrAdmins({
      source: 'hr_loan',
      title: 'Loan needs HR approval',
      body: `${empName(emp.firstName, emp.lastName)}'s ${loan.kind} loan (₹${Number(loan.principal).toLocaleString('en-IN')}) was approved by their manager.`,
      targetUrl: '/hr/loans',
    }, req.user!.userId).catch((e) => req.log.error(e));

    return { data: row };
  });

  app.put('/loans/:id/manager-reject', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = rejectLoanSchema.parse(req.body);
    const { loan, emp } = await loadLoanWithEmployee(req.server.db, req.tenantId, id);
    await assertCanManagerAct(req.server.db, req.tenantId, req.user!.userId, emp.reportingToId, req.activeRole);
    if (loan.status !== 'requested') throw new ConflictError('Loan is not awaiting manager review');
    const [row] = await req.server.db
      .update(employeeLoans)
      .set({
        status: 'rejected',
        rejectionReason: input.rejectionReason,
        managerApprovedBy: req.user!.userId,
        managerApprovedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(employeeLoans.id, id))
      .returning();
    return { data: row };
  });

  // Tenant loan policy. GET is open to all HR-side roles so the settings
  // page can preview; PUT is owner / hr only.
  app.get('/loan-policy', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const policy = await getOrInitPolicy(req.server.db, req.tenantId);
    return { data: policy };
  });
  app.put('/loan-policy', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const input = loanPolicySchema.parse(req.body);
    await getOrInitPolicy(req.server.db, req.tenantId); // ensure row exists
    const [row] = await req.server.db
      .update(hrLoanPolicy)
      .set({
        employeeRequestsEnabled: input.employeeRequestsEnabled,
        minTenureDays: input.minTenureDays,
        maxPctOfMonthlyCtc: input.maxPctOfMonthlyCtc,
        maxActiveLoans: input.maxActiveLoans,
        managerApprovalRequired: input.managerApprovalRequired,
        allowedKinds: input.allowedKinds && input.allowedKinds.length > 0
          ? input.allowedKinds.join(',')
          : null,
        updatedAt: new Date(),
      })
      .where(eq(hrLoanPolicy.tenantId, req.tenantId))
      .returning();
    return { data: hydratePolicy(row) };
  });
};

// --- Loan policy + eligibility helpers -----------------------------------

type LoanPolicyRow = {
  employeeRequestsEnabled: boolean;
  minTenureDays: number;
  maxPctOfMonthlyCtc: number;
  maxActiveLoans: number;
  managerApprovalRequired: boolean;
  allowedKinds: string[] | null;
};

function hydratePolicy(row: typeof hrLoanPolicy.$inferSelect): LoanPolicyRow {
  return {
    employeeRequestsEnabled: row.employeeRequestsEnabled,
    minTenureDays: row.minTenureDays,
    maxPctOfMonthlyCtc: row.maxPctOfMonthlyCtc,
    maxActiveLoans: row.maxActiveLoans,
    managerApprovalRequired: row.managerApprovalRequired,
    allowedKinds: row.allowedKinds ? row.allowedKinds.split(',').filter(Boolean) : null,
  };
}

async function getOrInitPolicy(
  db: import('@runq/db').Db,
  tenantId: string,
): Promise<LoanPolicyRow> {
  const [existing] = await db
    .select()
    .from(hrLoanPolicy)
    .where(eq(hrLoanPolicy.tenantId, tenantId))
    .limit(1);
  if (existing) return hydratePolicy(existing);
  const [created] = await db
    .insert(hrLoanPolicy)
    .values({ tenantId })
    .returning();
  return hydratePolicy(created);
}

async function evaluateLoanEligibility(
  db: import('@runq/db').Db,
  tenantId: string,
  employeeId: string,
) {
  const policy = await getOrInitPolicy(db, tenantId);
  const [emp] = await db
    .select({
      id: employees.id,
      joiningDate: employees.joiningDate,
      ctcAnnual: employees.ctcAnnual,
      reportingToId: employees.reportingToId,
      status: employees.status,
    })
    .from(employees)
    .where(and(eq(employees.id, employeeId), eq(employees.tenantId, tenantId)))
    .limit(1);

  const reasons: string[] = [];
  if (!emp) {
    return {
      eligible: false, reasons: ['Employee record not found.'],
      policy, maxAmount: 0, activeLoanCount: 0, tenureDays: 0,
      monthlyCtc: 0, hasReportingManager: false,
    };
  }
  if (!policy.employeeRequestsEnabled) {
    reasons.push('Employee loan requests are disabled by your HR team.');
  }
  if (emp.status !== 'active') {
    reasons.push('Your employment is not currently active.');
  }
  const joining = new Date(emp.joiningDate);
  const tenureDays = Math.max(0, Math.floor((Date.now() - joining.getTime()) / 86400000));
  if (tenureDays < policy.minTenureDays) {
    const remaining = policy.minTenureDays - tenureDays;
    reasons.push(`Minimum tenure is ${policy.minTenureDays} days — ${remaining} more to go.`);
  }
  const monthlyCtc = emp.ctcAnnual ? Number(emp.ctcAnnual) / 12 : 0;
  const maxAmount = Math.floor((monthlyCtc * policy.maxPctOfMonthlyCtc) / 100);
  if (monthlyCtc <= 0) {
    reasons.push('Your CTC is not on file — please ask HR to update your salary.');
  }

  const activeRows = await db
    .select({ id: employeeLoans.id })
    .from(employeeLoans)
    .where(and(
      eq(employeeLoans.tenantId, tenantId),
      eq(employeeLoans.employeeId, employeeId),
      sql`${employeeLoans.status} IN ('requested','manager_approved','active')`,
    ));
  const activeLoanCount = activeRows.length;
  if (activeLoanCount >= policy.maxActiveLoans) {
    reasons.push(`You already have ${activeLoanCount} pending or active loan(s); limit is ${policy.maxActiveLoans}.`);
  }

  return {
    eligible: reasons.length === 0,
    reasons,
    policy,
    maxAmount,
    activeLoanCount,
    tenureDays,
    monthlyCtc,
    hasReportingManager: !!emp.reportingToId,
  };
}

async function loadLoanWithEmployee(
  db: import('@runq/db').Db,
  tenantId: string,
  loanId: string,
) {
  const [row] = await db
    .select({ l: employeeLoans, e: employees })
    .from(employeeLoans)
    .innerJoin(employees, eq(employees.id, employeeLoans.employeeId))
    .where(and(eq(employeeLoans.id, loanId), eq(employeeLoans.tenantId, tenantId)))
    .limit(1);
  if (!row) throw new NotFoundError('Loan');
  return { loan: row.l, emp: row.e };
}

// Owners + HR can act in a manager's place to keep the queue moving.
async function assertCanManagerAct(
  db: import('@runq/db').Db,
  tenantId: string,
  userId: string,
  reportingToEmployeeId: string | null,
  role: string,
) {
  if (role === 'owner' || role === 'hr' || role === 'accountant') return;
  if (!reportingToEmployeeId) {
    throw new ForbiddenError('This employee has no reporting manager assigned.');
  }
  const mgr = await resolveSelfEmployee(db, tenantId, userId);
  if (mgr.id !== reportingToEmployeeId) {
    throw new ForbiddenError('Only this employee\'s reporting manager can act on this request.');
  }
}

// Helper: insert / update declaration + replace items. Always upsert by FY.
async function upsertDeclaration(
  db: import('@runq/db').Db,
  tenantId: string,
  employeeId: string,
  input: Partial<import('@runq/validators').CreateTaxDeclarationInput> & { financialYear: string; items?: import('@runq/validators').CreateTaxDeclarationInput['items'] },
  existingId?: string,
) {
  const values = {
    tenantId,
    employeeId,
    financialYear: input.financialYear,
    regime: input.regime ?? 'new',
    hraTotal: num(input.hraTotal),
    ltaTotal: num(input.ltaTotal),
    homeLoanInterest: num(input.homeLoanInterest),
    section80c: num(input.section80c),
    section80d: num(input.section80d),
    section80g: num(input.section80g),
    section80ccd1b: num(input.section80ccd1b),
    otherDeductions: num(input.otherDeductions),
    notes: input.notes,
    status: 'draft' as const,
    updatedAt: new Date(),
  };

  let row;
  if (existingId) {
    [row] = await db
      .update(taxDeclarations)
      .set(values)
      .where(eq(taxDeclarations.id, existingId))
      .returning();
  } else {
    [row] = await db
      .insert(taxDeclarations)
      .values(values)
      .onConflictDoUpdate({
        target: [taxDeclarations.employeeId, taxDeclarations.financialYear],
        set: values,
      })
      .returning();
  }
  if (!row) throw new NotFoundError('Tax declaration');

  if (input.items !== undefined) {
    await db.delete(taxDeclarationItems).where(eq(taxDeclarationItems.declarationId, row.id));
    if (input.items.length) {
      await db.insert(taxDeclarationItems).values(
        input.items.map((it) => ({
          declarationId: row.id,
          section: it.section,
          particulars: it.particulars,
          amount: it.amount.toString(),
          meta: it.meta,
          proofUrl: it.proofUrl,
        })),
      );
    }
  }
  return row;
}
