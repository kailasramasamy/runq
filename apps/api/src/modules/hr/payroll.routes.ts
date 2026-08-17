import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { payslips, payrollRuns, tenants } from '@runq/db';
import {
  createSalaryComponentSchema, updateSalaryComponentSchema,
  createSalaryStructureSchema, updateSalaryStructureSchema,
  generateSalaryStructureSchema,
  assignEmployeeSalarySchema,
  createPayrollRunSchema, updatePayslipSchema,
  uuidParamSchema,
} from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { AppError, NotFoundError } from '../../utils/errors';
import { SalaryComponentService } from './payroll/salary-component.service';
import { SalaryStructureService } from './payroll/salary-structure.service';
import { generateDefaultStructure } from './payroll/salary-structure-generator';
import { EmployeeSalaryService } from './payroll/employee-salary.service';
import { PayrollRunService } from './payroll/payroll-run.service';
import { renderPayslipHTML } from './payroll/payslip-template';
import { HrNotifier } from './hr-notifier';
import { resolveSelfEmployeeId } from './access-scope';

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
const selfPayslipParams = z.object({ payslipId: z.string().uuid() });
// Payroll writes stay admin-only; these are the roles allowed to read their
// OWN payslip, which is every role a person can log in as.
const SELF = ['owner', 'accountant', 'viewer', 'hr'] as const;

/** Render one payslip as HTML, or as a PDF download when `?format=pdf`. */
async function sendPayslipDocument(
  req: any,
  reply: any,
  runId: string,
  payslipId: string,
) {
  const svc = new PayrollRunService(req.server.db, req.tenantId);
  const { slip, tenantName, settings } = await svc.getPayslipForPrint(runId, payslipId);
  const html = renderPayslipHTML(slip, tenantName, settings);

  if ((req.query as { format?: string } | undefined)?.format !== 'pdf') {
    return reply.type('text/html').send(html);
  }
  // Lazy import: puppeteer pulls ~300MB of Chromium, so it only loads when
  // a PDF is actually asked for.
  const { renderHtmlToPdf } = await import('../ar/invoice-pdf');
  const pdf = await renderHtmlToPdf(html);
  const safeName = slip.employeeName.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, '-').slice(0, 60);
  const fileName = `Payslip-${slip.year}-${String(slip.month).padStart(2, '0')}-${safeName || slip.employeeCode}.pdf`;
  return reply
    .type('application/pdf')
    .header('Content-Disposition', `attachment; filename="${fileName}"`)
    .send(pdf);
}

/**
 * Resolve a payslip the CALLER owns, returning its payroll-run id.
 *
 * The admin payslip routes are owner/HR only, so an employee could not open
 * or download their own payslip at all. Rather than widen those, these
 * self-serve routes look the payslip up THROUGH the caller's own employee
 * row — a payslip id belonging to someone else simply does not resolve.
 * 404, not 403: whether a given payslip exists is itself pay information.
 */
async function ownPayslipRunId(req: any, payslipId: string): Promise<string> {
  const employeeId = await resolveSelfEmployeeId(
    req.server.db, req.tenantId, req.user!.userId);
  if (!employeeId) throw new NotFoundError('Payslip');
  const [row] = await req.server.db
    .select({ runId: payslips.payrollRunId })
    .from(payslips)
    .where(and(
      eq(payslips.id, payslipId),
      eq(payslips.tenantId, req.tenantId),
      eq(payslips.employeeId, employeeId),
    ))
    .limit(1);
  if (!row) throw new NotFoundError('Payslip');
  return row.runId;
}

export const payrollRoutes: FastifyPluginAsync = async (app) => {
  // --- Self-serve payslip (the logged-in employee's own) ---
  app.get('/me/payslips/:payslipId', { preHandler: [rbacHook([...SELF])] }, async (req) => {
    const { payslipId } = selfPayslipParams.parse(req.params);
    const runId = await ownPayslipRunId(req, payslipId);
    const svc = new PayrollRunService(req.server.db, req.tenantId);
    return { data: await svc.getPayslip(runId, payslipId) };
  });

  app.get('/me/payslips/:payslipId/print', { preHandler: [rbacHook([...SELF])] }, async (req, reply) => {
    const { payslipId } = selfPayslipParams.parse(req.params);
    const runId = await ownPayslipRunId(req, payslipId);
    return sendPayslipDocument(req, reply, runId, payslipId);
  });

  // --- Per-employee payslips (admin) ---
  // Mirrors /hr/me/payslips but for an arbitrary employee, so owner/HR can
  // review another employee's pay history from the admin detail screen.
  // MANAGE-only, matching every other payroll read (no viewer).
  app.get('/employees/:id/payslips', { preHandler: [rbacHook([...MANAGE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const rows = await req.server.db
      .select({
        ps: payslips,
        month: payrollRuns.month,
        year: payrollRuns.year,
        runStatus: payrollRuns.status,
      })
      .from(payslips)
      .innerJoin(payrollRuns, eq(payrollRuns.id, payslips.payrollRunId))
      .where(and(eq(payslips.tenantId, req.tenantId), eq(payslips.employeeId, id)))
      .orderBy(desc(payrollRuns.year), desc(payrollRuns.month))
      .limit(24);
    return {
      data: rows.map((r) => ({ ...r.ps, month: r.month, year: r.year, runStatus: r.runStatus })),
    };
  });

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
  // AI assistant: propose a default structure for review (does NOT persist).
  app.post('/salary-structures/generate', { preHandler: [rbacHook([...WRITE])] }, async (req) => {
    const input = generateSalaryStructureSchema.parse(req.body);
    const components = await new SalaryComponentService(req.server.db, req.tenantId).list();
    if (components.length === 0) throw new AppError(400, 'Seed salary components before generating a structure');

    const [tenant] = await req.server.db
      .select({ settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, req.tenantId))
      .limit(1);
    const industry = ((tenant?.settings as Record<string, unknown> | null)?.industry as string | undefined)?.trim() || 'Indian SME';

    const proposal = await generateDefaultStructure({
      industry,
      roleHint: input.roleHint,
      includeStatutory: input.includeStatutory,
      components: components.map((c) => ({ code: c.code, name: c.name, type: c.type })),
    });

    // Resolve the proposed component codes back to their tenant component IDs.
    const idByCode = new Map(components.map((c) => [c.code, c.id]));
    return {
      data: {
        name: input.name?.trim() || proposal.name,
        description: proposal.description,
        components: proposal.components
          .map((c) => ({ salaryComponentId: idByCode.get(c.code)!, value: c.value, calcType: c.calcType }))
          .filter((c) => c.salaryComponentId),
      },
    };
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
    // Ship the unpayable list with the run itself — the warning has to be on
    // screen wherever the run is, not behind a second call the UI might skip.
    const [run, unpayable] = await Promise.all([
      svc.getById(id),
      svc.unpayableEmployees(id),
    ]);
    return { data: { ...run, unpayableEmployees: unpayable } };
  });
  app.get('/payroll-runs/:id/payslips', { preHandler: [rbacHook([...MANAGE])] }, async (req) => {
    const { id } = uuidParamSchema.parse(req.params);
    const svc = new PayrollRunService(req.server.db, req.tenantId);
    return { data: await svc.listPayslips(id) };
  });
  // Payslip as a document — `?format=pdf` downloads, otherwise HTML preview.
  // Same template either way, so what the employee receives is what payroll
  // reviewed.
  app.get('/payroll-runs/:id/payslips/:payslipId/print', { preHandler: [rbacHook([...MANAGE])] }, async (req, reply) => {
    const { id, payslipId } = payslipParams.parse(req.params);
    return sendPayslipDocument(req, reply, id, payslipId);
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
