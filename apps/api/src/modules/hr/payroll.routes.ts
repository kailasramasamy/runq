import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { payslips } from '@runq/db';
import {
  createSalaryComponentSchema, updateSalaryComponentSchema,
  createSalaryStructureSchema, updateSalaryStructureSchema,
  assignEmployeeSalarySchema,
  createPayrollRunSchema, updatePayslipSchema,
  uuidParamSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { SalaryComponentService } from './payroll/salary-component.service';
import { SalaryStructureService } from './payroll/salary-structure.service';
import { EmployeeSalaryService } from './payroll/employee-salary.service';
import { PayrollRunService } from './payroll/payroll-run.service';
import { HrNotifier } from './hr-notifier';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const monthLabel = (year: number, month: number): string => `${MONTHS[month - 1]} ${year}`;

/** Fan-out payslip-published notification to every employee in the approved run. */
async function notifyPayslipsPublished(
  req: { server: { db: import('@runq/db').Db }; tenantId: string; log: { error: (...a: any[]) => void } },
  run: { id: string; month: number; year: number },
): Promise<void> {
  const slips = await req.server.db
    .select({ employeeId: payslips.employeeId, netPay: payslips.netPay })
    .from(payslips)
    .where(and(eq(payslips.payrollRunId, run.id), eq(payslips.tenantId, req.tenantId)));
  if (slips.length === 0) return;
  const period = monthLabel(run.year, run.month);
  const notifier = new HrNotifier(req.server.db, req.tenantId);
  for (const slip of slips) {
    const net = Math.round(Number(slip.netPay)).toLocaleString('en-IN');
    notifier.notifyEmployee(slip.employeeId, {
      type: 'ok',
      source: 'hr_payroll',
      title: 'Payslip ready',
      body: `Your payslip for ${period} is ready. Net pay ₹${net}.`,
      // Employee-facing — land on the employee's own Pay screen, not the
      // admin payroll-run screen (which a non-admin can't open).
      targetUrl: '/hr/pay',
    }).catch((e) => req.log.error(e, 'hr-notify: payslip published per employee'));
  }
}

// Payroll reads expose company-wide pay data — admin roles only, no viewer.
const MANAGE = ['owner', 'accountant', 'hr'] as const;
const WRITE = ['owner', 'accountant', 'hr'] as const;

const employeeIdQuery = z.object({ employeeId: z.string().uuid() });
const payslipParams = z.object({ id: z.string().uuid(), payslipId: z.string().uuid() });

export const payrollRoutes: FastifyPluginAsync = async (app) => {
  // --- Salary components ---
  app.get('/salary-components', { preHandler: [rbacHook([...MANAGE])] }, async (req) => {
    const svc = new SalaryComponentService(req.server.db, req.tenantId);
    return { data: await svc.list() };
  });
  app.post('/salary-components', { preHandler: [rbacHook([...WRITE])] }, async (req, reply) => {
    const input = createSalaryComponentSchema.parse(req.body);
    const svc = new SalaryComponentService(req.server.db, req.tenantId);
    return reply.status(201).send({ data: await svc.create(input) });
  });
  app.put('/salary-components/:id', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = updateSalaryComponentSchema.parse(req.body);
    const svc = new SalaryComponentService(req.server.db, req.tenantId);
    return { data: await svc.update(id, input) };
  });
  app.delete('/salary-components/:id', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new SalaryComponentService(req.server.db, req.tenantId);
    return { data: await svc.remove(id) };
  });
  app.post('/salary-components/seed-defaults', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const svc = new SalaryComponentService(req.server.db, req.tenantId);
    return { data: await svc.seedDefaults() };
  });

  // --- Salary structures ---
  app.get('/salary-structures', { preHandler: [rbacHook([...MANAGE])] }, async (req) => {
    const svc = new SalaryStructureService(req.server.db, req.tenantId);
    return { data: await svc.list() };
  });
  app.get('/salary-structures/:id', { preHandler: [rbacHook([...MANAGE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new SalaryStructureService(req.server.db, req.tenantId);
    return { data: await svc.getById(id) };
  });
  app.post('/salary-structures', { preHandler: [rbacHook([...WRITE])] }, async (req, reply) => {
    const input = createSalaryStructureSchema.parse(req.body);
    const svc = new SalaryStructureService(req.server.db, req.tenantId);
    return reply.status(201).send({ data: await svc.create(input) });
  });
  app.put('/salary-structures/:id', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const input = updateSalaryStructureSchema.parse(req.body);
    const svc = new SalaryStructureService(req.server.db, req.tenantId);
    return { data: await svc.update(id, input) };
  });
  app.delete('/salary-structures/:id', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new SalaryStructureService(req.server.db, req.tenantId);
    return { data: await svc.remove(id) };
  });

  // --- Employee salaries ---
  app.get('/employee-salaries', { preHandler: [rbacHook([...MANAGE])] }, async (req) => {
    const { employeeId } = employeeIdQuery.parse(req.query);
    const svc = new EmployeeSalaryService(req.server.db, req.tenantId);
    return { data: await svc.listForEmployee(employeeId) };
  });
  app.post('/employee-salaries', { preHandler: [rbacHook([...WRITE])] }, async (req, reply) => {
    const input = assignEmployeeSalarySchema.parse(req.body);
    const svc = new EmployeeSalaryService(req.server.db, req.tenantId);
    const row = await svc.assign(input);
    const notifier = new HrNotifier(req.server.db, req.tenantId);
    notifier.notifyEmployee(row.employeeId, {
      type: 'info',
      source: 'hr_payroll',
      title: 'Salary updated',
      body: `Your salary structure was updated, effective ${row.effectiveFrom}.`,
      targetUrl: '/hr/pay',
    }).catch((e) => req.log.error(e, 'hr-notify: salary assigned'));
    return reply.status(201).send({ data: row });
  });

  // --- Payroll runs ---
  app.get('/payroll-runs', { preHandler: [rbacHook([...MANAGE])] }, async (req) => {
    const svc = new PayrollRunService(req.server.db, req.tenantId);
    return { data: await svc.list() };
  });
  app.get('/payroll-runs/:id', { preHandler: [rbacHook([...MANAGE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new PayrollRunService(req.server.db, req.tenantId);
    return { data: await svc.getById(id) };
  });
  app.get('/payroll-runs/:id/payslips', { preHandler: [rbacHook([...MANAGE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new PayrollRunService(req.server.db, req.tenantId);
    return { data: await svc.listPayslips(id) };
  });
  app.get('/payroll-runs/:id/payslips/:payslipId', { preHandler: [rbacHook([...MANAGE])] }, async (req) => {
    const { id, payslipId } = payslipParams.parse(req.params);
    const svc = new PayrollRunService(req.server.db, req.tenantId);
    return { data: await svc.getPayslip(id, payslipId) };
  });
  app.post('/payroll-runs', { preHandler: [rbacHook([...WRITE])] }, async (req, reply) => {
    const input = createPayrollRunSchema.parse(req.body);
    const svc = new PayrollRunService(req.server.db, req.tenantId);
    const run = await svc.create(input);
    const notifier = new HrNotifier(req.server.db, req.tenantId);
    notifier.notifyHrAdmins({
      type: 'info',
      source: 'hr_payroll',
      title: 'Payroll needs approval',
      body: `${monthLabel(run.year, run.month)} payroll run is ready for review.`,
      targetUrl: `/hr/payroll-runs/${run.id}`,
    }, req.user!.userId).catch((e) => req.log.error(e, 'hr-notify: payroll run created'));
    return reply.status(201).send({ data: run });
  });
  app.post('/payroll-runs/:id/process', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new PayrollRunService(req.server.db, req.tenantId);
    const run = await svc.process(id, req.user!.userId);
    const notifier = new HrNotifier(req.server.db, req.tenantId);
    notifier.notifyHrAdmins({
      type: 'info',
      source: 'hr_payroll',
      title: 'Payroll needs approval',
      body: `${monthLabel(run.year, run.month)} payroll run is ready for review — ${run.totalEmployees ?? 0} employees.`,
      targetUrl: `/hr/payroll-runs/${run.id}`,
    }, req.user!.userId).catch((e) => req.log.error(e, 'hr-notify: payroll processed'));
    return { data: run };
  });
  app.post('/payroll-runs/:id/approve', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new PayrollRunService(req.server.db, req.tenantId);
    const run = await svc.approve(id, req.user!.userId);
    notifyPayslipsPublished(req, run).catch((e) => req.log.error(e, 'hr-notify: payslips published'));
    return { data: run };
  });
  app.post('/payroll-runs/:id/close', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new PayrollRunService(req.server.db, req.tenantId);
    return { data: await svc.close(id) };
  });
  app.put('/payroll-runs/:id/payslips/:payslipId', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id, payslipId } = payslipParams.parse(req.params);
    const input = updatePayslipSchema.parse(req.body);
    const svc = new PayrollRunService(req.server.db, req.tenantId);
    return { data: await svc.updatePayslip(id, payslipId, input) };
  });
};
