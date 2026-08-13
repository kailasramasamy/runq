import { FastifyPluginAsync } from 'fastify';
import { eq, and, inArray } from 'drizzle-orm';
import { payslips, employees, payrollRuns } from '@runq/db';
import { uuidParamSchema } from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import {
  buildPfEcr, buildEsiReturn, buildPtReturn, buildNeftCsv,
  type ExportPayslip, type ExportEmployee,
} from './payroll/exporters';
import { NotFoundError } from '../../utils/errors';
import { PayrollRunService } from './payroll/payroll-run.service';

// Statutory challans + NEFT/ECR exports carry per-employee pay & bank
// details — admin roles only, no viewer.
const MANAGE = ['owner', 'accountant', 'hr'] as const;

async function loadRunExportData(db: any, tenantId: string, runId: string) {
  const [run] = await db
    .select()
    .from(payrollRuns)
    .where(and(eq(payrollRuns.id, runId), eq(payrollRuns.tenantId, tenantId)))
    .limit(1);
  if (!run) throw new NotFoundError('Payroll run');

  const slips = await db
    .select()
    .from(payslips)
    .where(eq(payslips.payrollRunId, runId));

  const empIds = slips.map((s: any) => s.employeeId);
  if (empIds.length === 0) {
    return { run, employees: [] as ExportEmployee[], payslipsByEmp: new Map<string, ExportPayslip>() };
  }
  const emps = await db
    .select()
    .from(employees)
    .where(and(eq(employees.tenantId, tenantId), inArray(employees.id, empIds)));

  const empById = new Map<string, any>(emps.map((e: any) => [e.id, e]));
  const exportEmps: ExportEmployee[] = emps.map((e: any) => ({
    employeeCode: e.employeeCode,
    firstName: e.firstName,
    lastName: e.lastName,
    uan: e.uan,
    pan: e.pan,
    esiNumber: e.esiNumber,
    bankAccountNumber: e.bankAccountNumber,
    bankIfsc: e.bankIfsc,
    bankName: e.bankName,
  }));
  const payslipsByEmp = new Map<string, ExportPayslip>();
  for (const s of slips) {
    const emp = empById.get(s.employeeId);
    if (!emp) continue;
    payslipsByEmp.set(emp.employeeCode, {
      employeeId: s.employeeId,
      gross: s.gross,
      paidWages: s.paidWages,
      netPay: s.netPay,
      pfEmployee: s.pfEmployee,
      pfEmployer: s.pfEmployer,
      esiEmployee: s.esiEmployee,
      esiEmployer: s.esiEmployer,
      pt: s.pt,
      tds: s.tds,
      workingDays: s.workingDays,
      presentDays: s.presentDays,
      lopDays: s.lopDays,
      paidDays: s.paidDays,
      earnings: s.earnings,
    });
  }
  return { run, employees: exportEmps, payslipsByEmp };
}

export const payrollStatutoryRoutes: FastifyPluginAsync = async (app) => {
  app.get('/payroll-runs/:id/pf-challan', { preHandler: [rbacHook([...MANAGE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new PayrollRunService(req.server.db, req.tenantId);
    return { data: await svc.pfChallan(id) };
  });

  app.get('/payroll-runs/:id/esi-challan', { preHandler: [rbacHook([...MANAGE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new PayrollRunService(req.server.db, req.tenantId);
    return { data: await svc.esiChallan(id) };
  });

  app.get('/payroll-runs/:id/pt-challan', { preHandler: [rbacHook([...MANAGE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new PayrollRunService(req.server.db, req.tenantId);
    return { data: await svc.ptChallan(id) };
  });

  app.get('/payroll-runs/:id/exports/pt', { preHandler: [rbacHook([...MANAGE])] }, async (req, reply) => {
    const { id } = uuidParamSchema.parse(req.params);
    const { run, employees, payslipsByEmp } = await loadRunExportData(req.server.db, req.tenantId, id);
    const body = buildPtReturn(employees, payslipsByEmp);
    return reply
      .type('text/csv')
      .header('content-disposition', `attachment; filename="pt-return-${run.year}-${String(run.month).padStart(2, '0')}.csv"`)
      .send(body);
  });

  app.get('/payroll-runs/:id/exports/pf-ecr', { preHandler: [rbacHook([...MANAGE])] }, async (req, reply) => {
    const { id } = uuidParamSchema.parse(req.params);
    const { run, employees, payslipsByEmp } = await loadRunExportData(req.server.db, req.tenantId, id);
    const body = buildPfEcr(employees, payslipsByEmp);
    return reply
      .type('text/plain')
      .header('content-disposition', `attachment; filename="pf-ecr-${run.year}-${String(run.month).padStart(2, '0')}.txt"`)
      .send(body);
  });

  app.get('/payroll-runs/:id/exports/esi', { preHandler: [rbacHook([...MANAGE])] }, async (req, reply) => {
    const { id } = uuidParamSchema.parse(req.params);
    const { run, employees, payslipsByEmp } = await loadRunExportData(req.server.db, req.tenantId, id);
    const body = buildEsiReturn(employees, payslipsByEmp);
    return reply
      .type('text/csv')
      .header('content-disposition', `attachment; filename="esi-mc-${run.year}-${String(run.month).padStart(2, '0')}.csv"`)
      .send(body);
  });

  app.get('/payroll-runs/:id/exports/neft', { preHandler: [rbacHook([...MANAGE])] }, async (req, reply) => {
    const { id } = uuidParamSchema.parse(req.params);
    const { run, employees, payslipsByEmp } = await loadRunExportData(req.server.db, req.tenantId, id);
    const ref = `PAYROLL-${run.year}-${String(run.month).padStart(2, '0')}`;
    const body = buildNeftCsv(employees, payslipsByEmp, ref);
    return reply
      .type('text/csv')
      .header('content-disposition', `attachment; filename="neft-${run.year}-${String(run.month).padStart(2, '0')}.csv"`)
      .send(body);
  });

};
