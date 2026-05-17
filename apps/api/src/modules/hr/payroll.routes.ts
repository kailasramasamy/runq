import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
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

const ALL = ['owner', 'accountant', 'viewer', 'hr'] as const;
const WRITE = ['owner', 'accountant', 'hr'] as const;

const employeeIdQuery = z.object({ employeeId: z.string().uuid() });
const payslipParams = z.object({ id: z.string().uuid(), payslipId: z.string().uuid() });

export const payrollRoutes: FastifyPluginAsync = async (app) => {
  // --- Salary components ---
  app.get('/salary-components', { preHandler: [rbacHook([...ALL])] }, async (req) => {
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
  app.get('/salary-structures', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const svc = new SalaryStructureService(req.server.db, req.tenantId);
    return { data: await svc.list() };
  });
  app.get('/salary-structures/:id', { preHandler: [rbacHook([...ALL])] }, async (req) => {
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
  app.get('/employee-salaries', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const { employeeId } = employeeIdQuery.parse(req.query);
    const svc = new EmployeeSalaryService(req.server.db, req.tenantId);
    return { data: await svc.listForEmployee(employeeId) };
  });
  app.post('/employee-salaries', { preHandler: [rbacHook([...WRITE])] }, async (req, reply) => {
    const input = assignEmployeeSalarySchema.parse(req.body);
    const svc = new EmployeeSalaryService(req.server.db, req.tenantId);
    return reply.status(201).send({ data: await svc.assign(input) });
  });

  // --- Payroll runs ---
  app.get('/payroll-runs', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const svc = new PayrollRunService(req.server.db, req.tenantId);
    return { data: await svc.list() };
  });
  app.get('/payroll-runs/:id', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new PayrollRunService(req.server.db, req.tenantId);
    return { data: await svc.getById(id) };
  });
  app.get('/payroll-runs/:id/payslips', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new PayrollRunService(req.server.db, req.tenantId);
    return { data: await svc.listPayslips(id) };
  });
  app.get('/payroll-runs/:id/payslips/:payslipId', { preHandler: [rbacHook([...ALL])] }, async (req) => {
    const { id, payslipId } = payslipParams.parse(req.params);
    const svc = new PayrollRunService(req.server.db, req.tenantId);
    return { data: await svc.getPayslip(id, payslipId) };
  });
  app.post('/payroll-runs', { preHandler: [rbacHook([...WRITE])] }, async (req, reply) => {
    const input = createPayrollRunSchema.parse(req.body);
    const svc = new PayrollRunService(req.server.db, req.tenantId);
    return reply.status(201).send({ data: await svc.create(input) });
  });
  app.post('/payroll-runs/:id/process', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new PayrollRunService(req.server.db, req.tenantId);
    return { data: await svc.process(id, req.user!.userId) };
  });
  app.post('/payroll-runs/:id/approve', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new PayrollRunService(req.server.db, req.tenantId);
    return { data: await svc.approve(id, req.user!.userId) };
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
