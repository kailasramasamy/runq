import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { payslips } from '@runq/db';
import {
  uuidParamSchema, recordSalaryPaymentSchema, recordReimbursementPaymentSchema,
} from '@runq/validators';
import { rbacHook } from '../../../hooks/rbac';
import { EmployeePaymentService } from './employee-payment.service';
import { HrNotifier } from '../hr-notifier';

// Employee payment records carry per-employee pay — admin roles only,
// no viewer. Recording a payment moves money so WRITE stays owner/accountant.
const MANAGE = ['owner', 'accountant', 'hr'] as const;
const WRITE = ['owner', 'accountant'] as const;

const runIdQuery = z.object({ payrollRunId: z.string().uuid().optional() });

/**
 * Fan-out a "Payment credited" push to every employee in a payroll run,
 * personalised with their net pay and payment reference.
 */
async function notifySalaryPaid(
  req: { server: { db: import('@runq/db').Db }; tenantId: string; log: { error: (...a: any[]) => void } },
  payrollRunId: string,
  reference: string | undefined,
): Promise<void> {
  const slips = await req.server.db
    .select({ employeeId: payslips.employeeId, netPay: payslips.netPay })
    .from(payslips)
    .where(and(eq(payslips.payrollRunId, payrollRunId), eq(payslips.tenantId, req.tenantId)));
  if (slips.length === 0) return;
  const notifier = new HrNotifier(req.server.db, req.tenantId);
  for (const slip of slips) {
    const amt = Math.round(Number(slip.netPay)).toLocaleString('en-IN');
    const refPart = reference ? ` (${reference})` : '';
    notifier.notifyEmployee(slip.employeeId, {
      type: 'ok',
      source: 'hr_payroll',
      title: 'Payment credited',
      body: `₹${amt} has been paid to your account${refPart}.`,
      targetUrl: '/hr/pay',
    }).catch((e) => req.log.error(e, 'hr-notify: salary credited per employee'));
  }
}

export const employeePaymentRoutes: FastifyPluginAsync = async (app) => {
  app.get('/employee-payments', { preHandler: [rbacHook([...MANAGE])] }, async (req) => {
    const { payrollRunId } = runIdQuery.parse(req.query);
    const svc = new EmployeePaymentService(req.server.db, req.tenantId);
    return { data: payrollRunId ? await svc.listForRun(payrollRunId) : await svc.list() };
  });

  app.get('/employee-payments/:id', { preHandler: [rbacHook([...MANAGE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new EmployeePaymentService(req.server.db, req.tenantId);
    return { data: await svc.getById(id) };
  });

  app.post('/employee-payments', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const input = recordSalaryPaymentSchema.parse(req.body);
    const svc = new EmployeePaymentService(req.server.db, req.tenantId);
    const payment = await svc.recordSalaryPayment(input, req.user!.userId);
    notifySalaryPaid(req, input.payrollRunId, payment.reference ?? undefined)
      .catch((e) => req.log.error(e, 'hr-notify: salary payment credited'));
    return { data: payment };
  });

  // Reimbursement settlement for a posted expense claim — Dr 2111 / Cr bank.
  app.post('/employee-payments/reimburse', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const input = recordReimbursementPaymentSchema.parse(req.body);
    const svc = new EmployeePaymentService(req.server.db, req.tenantId);
    const payment = await svc.recordReimbursementPayment(input, req.user!.userId);
    if (payment.employeeId) {
      const notifier = new HrNotifier(req.server.db, req.tenantId);
      const amt = Math.round(Number(payment.amount)).toLocaleString('en-IN');
      const ref = payment.reference ? ` (${payment.reference})` : '';
      notifier.notifyEmployee(payment.employeeId, {
        type: 'ok',
        source: 'hr_expense',
        title: 'Expense reimbursed',
        body: `₹${amt} for your expense claim has been reimbursed${ref}.`,
        targetUrl: '/hr/expense-claims',
      }).catch((e) => req.log.error(e, 'hr-notify: expense reimbursed'));
    }
    return { data: payment };
  });
};
