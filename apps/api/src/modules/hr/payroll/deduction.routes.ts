import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { employeeLoans, employeeLoanInstalments } from '@runq/db';
import {
  uuidParamSchema,
  createEmployeeDeductionSchema, updateEmployeeDeductionSchema,
  listEmployeeDeductionsSchema, disburseLoanSchema, quickAdvanceSchema,
  updateLoanSchema, writeOffLoanSchema,
} from '@runq/validators';
import { rbacHook } from '../../../hooks/rbac';
import { EmployeeDeductionService } from './deduction.service';
import { EmployeeLoanService } from './loan.service';
import { EmployeePaymentService } from './employee-payment.service';
import { resolveSelfEmployee } from '../phase-next/self-employee';
import { HrNotifier } from '../hr-notifier';
import { ConflictError } from '../../../utils/errors';

// Per-employee debts — admin roles only. Viewer excluded; employees read
// their own via /me/*.
const MANAGE = ['owner', 'accountant', 'hr'] as const;
const WRITE = ['owner', 'accountant', 'hr'] as const;
const ALL = ['owner', 'accountant', 'viewer', 'hr'] as const;
// Disbursement moves cash, so it stays with the money roles.
const PAY = ['owner', 'accountant'] as const;

const inr = (n: number | string): string =>
  `₹${Math.round(Number(n)).toLocaleString('en-IN')}`;

// Mirrors the labels payroll puts on the payslip deduction line, so the
// notification an employee gets calls it the same thing their payslip will.
const LOAN_KIND_LABEL: Record<string, string> = {
  advance: 'Advance',
  personal: 'Personal loan',
  festival: 'Festival advance',
  education: 'Education loan',
  other: 'Loan',
};

export const deductionRoutes: FastifyPluginAsync = async (app) => {
  // ===== AD-HOC DEDUCTIONS =====
  app.get('/deductions', { preHandler: [rbacHook([...MANAGE])] }, async (req) => {
    const filter = listEmployeeDeductionsSchema.parse(req.query);
    const svc = new EmployeeDeductionService(req.server.db, req.tenantId);
    return { data: await svc.list(filter) };
  });

  app.get('/deductions/:id', { preHandler: [rbacHook([...MANAGE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new EmployeeDeductionService(req.server.db, req.tenantId);
    return { data: await svc.getById(id) };
  });

  app.post('/deductions', { preHandler: [rbacHook([...WRITE])] }, async (req, reply) => {
    const input = createEmployeeDeductionSchema.parse(req.body);
    const svc = new EmployeeDeductionService(req.server.db, req.tenantId);
    const row = await svc.create(input, req.user!.userId);

    const notifier = new HrNotifier(req.server.db, req.tenantId);
    notifier.notifyEmployee(row.employeeId, {
      type: 'info',
      source: 'hr_payroll',
      title: 'Deduction added',
      body: `${inr(row.amount)}${row.description ? ` for ${row.description}` : ''} will be recovered from your salary.`,
      targetUrl: '/hr/loans',
    }).catch((e) => req.log.error(e, 'hr-notify: deduction raised'));

    return reply.status(201).send({ data: row });
  });

  app.put('/deductions/:id', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = updateEmployeeDeductionSchema.parse(req.body);
    const svc = new EmployeeDeductionService(req.server.db, req.tenantId);
    return { data: await svc.update(id, input) };
  });

  app.put('/deductions/:id/cancel', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new EmployeeDeductionService(req.server.db, req.tenantId);
    return { data: await svc.cancel(id) };
  });

  app.delete('/deductions/:id', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new EmployeeDeductionService(req.server.db, req.tenantId);
    return { data: await svc.remove(id) };
  });

  // ===== RECOVERY SUMMARY =====
  app.get('/employees/:id/recovery-summary', { preHandler: [rbacHook([...MANAGE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new EmployeeDeductionService(req.server.db, req.tenantId);
    return { data: await svc.recoverySummary(id) };
  });

  // Employee self-view — what's coming off my next payslip.
  app.get('/me/recovery-summary', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const emp = await resolveSelfEmployee(req.server.db, req.tenantId, req.user!.userId);
    const svc = new EmployeeDeductionService(req.server.db, req.tenantId);
    return { data: await svc.recoverySummary(emp.id) };
  });

  // ===== ADVANCE / LOAN EDIT =====
  // Registered before taxLoansRoutes' own /loans handlers in routes.ts order,
  // but on distinct methods so there is no shadowing.
  app.put('/loans/:id', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = updateLoanSchema.parse(req.body);
    const svc = new EmployeeLoanService(req.server.db, req.tenantId);
    return { data: await svc.update(id, input) };
  });

  app.put('/loans/:id/write-off', { preHandler: [rbacHook([...PAY])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = writeOffLoanSchema.parse(req.body);
    const svc = new EmployeeLoanService(req.server.db, req.tenantId);
    return { data: await svc.writeOff(id, input) };
  });

  // ===== DISBURSEMENT =====
  app.post('/loans/:id/disburse', { preHandler: [rbacHook([...PAY])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = disburseLoanSchema.parse(req.body);
    const svc = new EmployeePaymentService(req.server.db, req.tenantId);
    const payment = await svc.recordLoanDisbursement(id, input, req.user!.userId);

    if (payment.employeeId) {
      const notifier = new HrNotifier(req.server.db, req.tenantId);
      notifier.notifyEmployee(payment.employeeId, {
        type: 'ok',
        source: 'hr_loan',
        title: 'Advance paid',
        body: `${inr(payment.amount)} has been paid out to you.`,
        targetUrl: '/hr/loans',
      }).catch((e) => req.log.error(e, 'hr-notify: loan disbursed'));
    }
    return { data: payment };
  });

  /**
   * Record an advance that has already been handed over. Collapses create →
   * approve → schedule → disburse into the single action HR performs at a
   * counter, which is the whole point of having this on the phone.
   */
  app.post('/advances', { preHandler: [rbacHook([...PAY])] }, async (req, reply) => {
    const input = quickAdvanceSchema.parse(req.body);
    if (input.paymentMethod !== 'cash' && !input.bankAccountId) {
      throw new ConflictError('Pick the bank account the advance was paid from');
    }
    const loan = await createActiveAdvance(req, input);

    const paySvc = new EmployeePaymentService(req.server.db, req.tenantId);
    const payment = await paySvc.recordLoanDisbursement(loan.id, {
      paymentDate: input.disbursedOn,
      bankAccountId: input.bankAccountId ?? null,
      paymentMethod: input.paymentMethod,
      reference: input.reference ?? null,
      notes: input.reason ?? null,
    }, req.user!.userId);

    const notifier = new HrNotifier(req.server.db, req.tenantId);
    const label = LOAN_KIND_LABEL[input.kind] ?? 'Advance';
    const emiPart = input.totalInstalments > 1
      ? ` EMI ${inr(loan.emiAmount)} over ${input.totalInstalments} months.`
      : ' Recovered from your next payslip.';
    notifier.notifyEmployee(loan.employeeId, {
      type: 'ok',
      source: 'hr_loan',
      title: `${label} paid`,
      body: `${inr(loan.principal)} paid to you.${emiPart}`,
      targetUrl: '/hr/loans',
    }).catch((e) => req.log.error(e, 'hr-notify: quick advance'));

    return reply.status(201).send({ data: { loan, payment } });
  });
};

type QuickAdvanceReq = {
  server: { db: import('@runq/db').Db };
  tenantId: string;
  user?: { userId: string } | null;
};

/**
 * Create an advance already in `active` state with its EMI schedule laid out,
 * so payroll picks it up on the next run. Skips the approval states — the
 * money is out the door, approving it after the fact is theatre.
 */
async function createActiveAdvance(
  req: QuickAdvanceReq,
  input: import('@runq/validators').QuickAdvanceInput,
) {
  const n = input.totalInstalments;
  const emi = Math.round((input.amount / n) * 100) / 100;
  // The last instalment absorbs the rounding drift so the schedule foots
  // exactly to the principal.
  const last = Math.round((input.amount - emi * (n - 1)) * 100) / 100;
  const userId = req.user!.userId;

  return req.server.db.transaction(async (tx) => {
    const [loan] = await tx
      .insert(employeeLoans)
      .values({
        tenantId: req.tenantId,
        employeeId: input.employeeId,
        kind: input.kind,
        principal: String(input.amount),
        emiAmount: String(emi),
        totalInstalments: n,
        disbursedOn: input.disbursedOn,
        firstEmiMonth: input.firstEmiMonth,
        firstEmiYear: input.firstEmiYear,
        outstanding: String(input.amount),
        status: 'active',
        reason: input.reason ?? null,
        createdBy: userId,
        approvedBy: userId,
        approvedAt: new Date(),
      })
      .returning();

    let month = input.firstEmiMonth;
    let year = input.firstEmiYear;
    const inst: typeof employeeLoanInstalments.$inferInsert[] = [];
    for (let i = 1; i <= n; i++) {
      inst.push({
        tenantId: req.tenantId,
        loanId: loan.id,
        sequence: i,
        dueMonth: month,
        dueYear: year,
        amount: String(i === n ? last : emi),
      });
      month += 1;
      if (month > 12) { month = 1; year += 1; }
    }
    await tx.insert(employeeLoanInstalments).values(inst);
    return loan;
  });
}
