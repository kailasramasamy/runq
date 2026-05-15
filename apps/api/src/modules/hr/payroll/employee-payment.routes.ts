import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  uuidParamSchema, recordSalaryPaymentSchema, recordReimbursementPaymentSchema,
} from '@runq/validators';
import { rbacHook } from '../../../hooks/rbac';
import { EmployeePaymentService } from './employee-payment.service';

const ALL = ['owner', 'accountant', 'viewer'] as const;
const WRITE = ['owner', 'accountant'] as const;

const runIdQuery = z.object({ payrollRunId: z.string().uuid().optional() });

export const employeePaymentRoutes: FastifyPluginAsync = async (app) => {
  app.get('/employee-payments', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const { payrollRunId } = runIdQuery.parse(req.query);
    const svc = new EmployeePaymentService(req.server.db, req.tenantId);
    return { data: payrollRunId ? await svc.listForRun(payrollRunId) : await svc.list() };
  });

  app.get('/employee-payments/:id', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new EmployeePaymentService(req.server.db, req.tenantId);
    return { data: await svc.getById(id) };
  });

  app.post('/employee-payments', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const input = recordSalaryPaymentSchema.parse(req.body);
    const svc = new EmployeePaymentService(req.server.db, req.tenantId);
    return { data: await svc.recordSalaryPayment(input, req.user!.userId) };
  });

  // Reimbursement settlement for a posted expense claim — Dr 2111 / Cr bank.
  app.post('/employee-payments/reimburse', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const input = recordReimbursementPaymentSchema.parse(req.body);
    const svc = new EmployeePaymentService(req.server.db, req.tenantId);
    return { data: await svc.recordReimbursementPayment(input, req.user!.userId) };
  });
};
