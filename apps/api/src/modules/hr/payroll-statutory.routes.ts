import { FastifyPluginAsync } from 'fastify';
import { eq, and, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { payslips, employees, payrollRuns } from '@runq/db';
import { uuidParamSchema } from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import {
  buildPfEcr, buildEsiReturn, buildNeftCsv, buildForm24QSummary,
  type ExportPayslip, type ExportEmployee, type Form24QRow,
} from './payroll/exporters';
import { NotFoundError } from '../../utils/errors';

const ALL = ['owner', 'accountant', 'viewer'] as const;

const quarterQuery = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  quarter: z.coerce.number().int().min(1).max(4),
});

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
  app.get('/payroll-runs/:id/exports/pf-ecr', { preHandler: [rbacHook([...ALL])] }, async (req, reply) => {
    const { id } = uuidParamSchema.parse(req.params);
    const { run, employees, payslipsByEmp } = await loadRunExportData(req.server.db, req.tenantId, id);
    const body = buildPfEcr(employees, payslipsByEmp);
    return reply
      .type('text/plain')
      .header('content-disposition', `attachment; filename="pf-ecr-${run.year}-${String(run.month).padStart(2, '0')}.txt"`)
      .send(body);
  });

  app.get('/payroll-runs/:id/exports/esi', { preHandler: [rbacHook([...ALL])] }, async (req, reply) => {
    const { id } = uuidParamSchema.parse(req.params);
    const { run, employees, payslipsByEmp } = await loadRunExportData(req.server.db, req.tenantId, id);
    const body = buildEsiReturn(employees, payslipsByEmp);
    return reply
      .type('text/csv')
      .header('content-disposition', `attachment; filename="esi-${run.year}-${String(run.month).padStart(2, '0')}.csv"`)
      .send(body);
  });

  app.get('/payroll-runs/:id/exports/neft', { preHandler: [rbacHook([...ALL])] }, async (req, reply) => {
    const { id } = uuidParamSchema.parse(req.params);
    const { run, employees, payslipsByEmp } = await loadRunExportData(req.server.db, req.tenantId, id);
    const ref = `PAYROLL-${run.year}-${String(run.month).padStart(2, '0')}`;
    const body = buildNeftCsv(employees, payslipsByEmp, ref);
    return reply
      .type('text/csv')
      .header('content-disposition', `attachment; filename="neft-${run.year}-${String(run.month).padStart(2, '0')}.csv"`)
      .send(body);
  });

  app.get('/payroll/form-24q', { preHandler: [rbacHook([...ALL])] }, async (req, reply) => {
    const { year, quarter } = quarterQuery.parse(req.query);
    const startMonth = (quarter - 1) * 3 + 1; // 1, 4, 7, 10
    const months = [startMonth, startMonth + 1, startMonth + 2];

    const runs = await req.server.db
      .select()
      .from(payrollRuns)
      .where(and(
        eq(payrollRuns.tenantId, req.tenantId),
        eq(payrollRuns.year, year),
        inArray(payrollRuns.month, months),
      ));

    if (runs.length === 0) return { data: { rows: [] as Form24QRow[], runs: 0 } };

    const runIds = runs.map((r: any) => r.id);
    const slips = await req.server.db
      .select()
      .from(payslips)
      .where(inArray(payslips.payrollRunId, runIds));

    const empIds = [...new Set(slips.map((s: any) => s.employeeId))];
    const emps = await req.server.db
      .select()
      .from(employees)
      .where(and(eq(employees.tenantId, req.tenantId), inArray(employees.id, empIds)));
    const empById = new Map<string, any>(emps.map((e: any) => [e.id, e]));

    const agg = new Map<string, Form24QRow>();
    for (const s of slips) {
      const emp = empById.get(s.employeeId);
      if (!emp) continue;
      const existing = agg.get(emp.employeeCode) ?? {
        employeeCode: emp.employeeCode,
        employeeName: `${emp.firstName}${emp.lastName ? ' ' + emp.lastName : ''}`,
        pan: emp.pan,
        monthsPaid: 0,
        totalGross: 0,
        totalTds: 0,
      };
      existing.monthsPaid++;
      existing.totalGross += Number(s.gross);
      existing.totalTds += Number(s.tds);
      agg.set(emp.employeeCode, existing);
    }
    const rows = [...agg.values()].sort((a, b) => a.employeeCode.localeCompare(b.employeeCode));
    return { data: { rows, runs: runs.length, year, quarter } };
  });

  app.get('/payroll/form-24q/export', { preHandler: [rbacHook([...ALL])] }, async (req, reply) => {
    const { year, quarter } = quarterQuery.parse(req.query);
    const startMonth = (quarter - 1) * 3 + 1;
    const months = [startMonth, startMonth + 1, startMonth + 2];
    const runs = await req.server.db
      .select()
      .from(payrollRuns)
      .where(and(
        eq(payrollRuns.tenantId, req.tenantId),
        eq(payrollRuns.year, year),
        inArray(payrollRuns.month, months),
      ));
    if (runs.length === 0) return reply.type('text/csv').send('No data');

    const runIds = runs.map((r: any) => r.id);
    const slips = await req.server.db
      .select()
      .from(payslips)
      .where(inArray(payslips.payrollRunId, runIds));
    const empIds = [...new Set(slips.map((s: any) => s.employeeId))];
    const emps = await req.server.db
      .select()
      .from(employees)
      .where(and(eq(employees.tenantId, req.tenantId), inArray(employees.id, empIds)));
    const empById = new Map<string, any>(emps.map((e: any) => [e.id, e]));
    const agg = new Map<string, Form24QRow>();
    for (const s of slips) {
      const emp = empById.get(s.employeeId);
      if (!emp) continue;
      const existing = agg.get(emp.employeeCode) ?? {
        employeeCode: emp.employeeCode,
        employeeName: `${emp.firstName}${emp.lastName ? ' ' + emp.lastName : ''}`,
        pan: emp.pan,
        monthsPaid: 0,
        totalGross: 0,
        totalTds: 0,
      };
      existing.monthsPaid++;
      existing.totalGross += Number(s.gross);
      existing.totalTds += Number(s.tds);
      agg.set(emp.employeeCode, existing);
    }
    const body = buildForm24QSummary([...agg.values()]);
    return reply
      .type('text/csv')
      .header('content-disposition', `attachment; filename="form-24q-${year}-Q${quarter}.csv"`)
      .send(body);
  });
};
