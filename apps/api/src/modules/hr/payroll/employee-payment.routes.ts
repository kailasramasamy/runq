import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  uuidParamSchema, markSalaryTransfersSchema, recordReimbursementPaymentSchema,
} from '@runq/validators';
import { rbacHook } from '../../../hooks/rbac';
import { EmployeePaymentService } from './employee-payment.service';
import { SalaryTransferService } from './salary-transfer.service';
import { HrNotifier } from '../hr-notifier';

// Employee payment records carry per-employee pay — admin roles only,
// no viewer. Recording a payment moves money so WRITE stays owner/accountant.
const MANAGE = ['owner', 'accountant', 'hr'] as const;
const WRITE = ['owner', 'accountant'] as const;

const runIdQuery = z.object({ payrollRunId: z.string().uuid().optional() });

/** "Salary credited" push to each employee whose transfer just went out. */
function notifyTransferred(
  req: { server: { db: import('@runq/db').Db }; tenantId: string; log: { error: (...a: any[]) => void } },
  rows: Array<{ employeeId: string | null; amount: string; reference: string | null }>,
): void {
  const notifier = new HrNotifier(req.server.db, req.tenantId);
  for (const r of rows) {
    if (!r.employeeId) continue;
    const amt = Math.round(Number(r.amount)).toLocaleString('en-IN');
    const refPart = r.reference ? ` (${r.reference})` : '';
    notifier.notifyEmployee(r.employeeId, {
      type: 'ok',
      source: 'hr_payroll',
      title: 'Salary credited',
      body: `₹${amt} has been paid to your account${refPart}.`,
      targetUrl: '/hr/pay',
    }).catch((e) => req.log.error(e, 'hr-notify: salary transferred'));
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

  // Per-employee salary transfers for a payroll run (pending → transferred).
  app.get('/payroll-runs/:id/transfers', { preHandler: [rbacHook([...MANAGE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new SalaryTransferService(req.server.db, req.tenantId);
    return { data: await svc.listForRun(id) };
  });

  app.post('/payroll-runs/:id/transfers', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = markSalaryTransfersSchema.parse(req.body);
    const svc = new SalaryTransferService(req.server.db, req.tenantId);
    const rows = await svc.markTransferred(id, input, req.user!.userId);
    notifyTransferred(req, rows);
    return { data: rows };
  });

  app.post('/employee-payments/:id/undo-transfer', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new SalaryTransferService(req.server.db, req.tenantId);
    return { data: await svc.undo(id) };
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
