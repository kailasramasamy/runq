import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { payrollRuns, payslips, statutoryChallans, employeePayments } from '@runq/db';
import type { Db } from '@runq/db';
import type { TenantSettings } from '@runq/types';
import { PayrollRunService } from '../../hr/payroll/payroll-run.service';
import { ptDueDate } from '../../hr/payroll/statutory';
import { salaryDueDate, pfEsiDueDate, tdsDueDate } from '../due-dates';
import { inScope, money, WHOLE_MONTH, type ToPayItem, type ToPayScope } from '../types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const label = (r: Run) => `${MONTHS[r.month - 1]} ${r.year}`;
const periodOf = (r: Run) => `${r.year}-${String(r.month).padStart(2, '0')}-01`;
/** Statutory dues older than this are assumed settled outside runq. */
const LOOKBACK_RUNS = 12;

type Run = { id: string; month: number; year: number };

/** Approved runs in scope: the selected month's, or the recent ones. */
async function scopedRuns(db: Db, tenantId: string, scope: ToPayScope): Promise<Run[]> {
  const conds = [eq(payrollRuns.tenantId, tenantId), inArray(payrollRuns.status, ['approved', 'closed'])];
  if (scope.kind === 'month') {
    conds.push(eq(payrollRuns.year, Number(scope.month.slice(0, 4))), eq(payrollRuns.month, Number(scope.month.slice(5, 7))));
  }
  return db.select({ id: payrollRuns.id, month: payrollRuns.month, year: payrollRuns.year })
    .from(payrollRuns).where(and(...conds))
    .orderBy(desc(payrollRuns.year), desc(payrollRuns.month))
    .limit(scope.kind === 'month' ? 5 : LOOKBACK_RUNS);
}

/**
 * Net pay per approved run, and how much of it has been transferred. Counted
 * from the payslips so a run approved before transfer tracking still shows.
 */
export async function salaryItems(
  db: Db, tenantId: string, settings: Partial<TenantSettings>, scope: ToPayScope,
): Promise<ToPayItem[]> {
  const runs = await scopedRuns(db, tenantId, scope);
  if (!runs.length) return [];
  const runIds = runs.map((r) => r.id);
  const [slips, transferred] = await Promise.all([
    db.select({ runId: payslips.payrollRunId, employeeId: payslips.employeeId, net: payslips.netPay })
      .from(payslips)
      .where(and(inArray(payslips.payrollRunId, runIds), sql`${payslips.netPay} > 0`)),
    db.select({ runId: employeePayments.payrollRunId, employeeId: employeePayments.employeeId })
      .from(employeePayments)
      .where(and(
        inArray(employeePayments.payrollRunId, runIds),
        eq(employeePayments.sourceType, 'payroll_run'),
        eq(employeePayments.status, 'paid'),
      )),
  ]);
  const paidKey = new Set(transferred.map((t) => `${t.runId}:${t.employeeId}`));
  const rows = runIds.map((runId) => {
    const mine = slips.filter((p) => p.runId === runId);
    const paid = mine.filter((p) => paidKey.has(`${runId}:${p.employeeId}`));
    const sum = (xs: typeof mine) => xs.reduce((s2, p) => s2 + Number(p.net), 0);
    return { runId, total: sum(mine), paid: sum(paid), people: mine.length, paidPeople: paid.length };
  }).filter((r) => r.people > 0);
  const byRun = new Map(runs.map((r) => [r.id, r]));
  return rows.map((row): ToPayItem => {
    const run = byRun.get(row.runId)!;
    return {
      id: `salary-${run.id}`, category: 'salaries', title: `Salaries — ${label(run)}`,
      subtitle: `${row.paidPeople} of ${row.people} ${row.people === 1 ? 'employee' : 'employees'} paid`,
      period: periodOf(run), ...WHOLE_MONTH, ...money(row.total, row.paid),
      dueDate: salaryDueDate(run.year, run.month, settings.payrollPayDay),
      webLink: `/hr/payroll-runs/${run.id}`, mobileLink: `/hr/payroll-runs/${run.id}`,
    };
  }).filter((i) => inScope(scope, i));
}

/** PF / ESI / PT / TDS per approved run, paid once the challan is deposited. */
export async function statutoryItems(
  db: Db, tenantId: string, settings: Partial<TenantSettings>, scope: ToPayScope,
): Promise<ToPayItem[]> {
  const runs = await scopedRuns(db, tenantId, scope);
  if (!runs.length) return [];
  const deposited = await depositedKinds(db, tenantId, runs.map((r) => r.id));
  const svc = new PayrollRunService(db, tenantId);
  const items: ToPayItem[] = [];
  for (const run of runs) items.push(...await runDues(db, svc, run, deposited.get(run.id) ?? new Set(), settings));
  return items.filter((i) => inScope(scope, i));
}

async function depositedKinds(db: Db, tenantId: string, runIds: string[]) {
  const rows = await db
    .select({ runId: statutoryChallans.payrollRunId, kind: statutoryChallans.kind, state: statutoryChallans.stateCode })
    .from(statutoryChallans)
    .where(and(
      eq(statutoryChallans.tenantId, tenantId),
      inArray(statutoryChallans.payrollRunId, runIds),
      eq(statutoryChallans.status, 'deposited'),
    ));
  const out = new Map<string, Set<string>>();
  for (const r of rows) {
    const set = out.get(r.runId!) ?? new Set<string>();
    set.add(r.kind === 'pt' ? `pt:${r.state ?? ''}` : r.kind);
    out.set(r.runId!, set);
  }
  return out;
}

async function runDues(
  db: Db, svc: PayrollRunService, run: Run, done: Set<string>, s: Partial<TenantSettings>,
): Promise<ToPayItem[]> {
  const due = (key: string, title: string, amount: number, dueDate: string, isDone: boolean): ToPayItem[] =>
    amount > 0
      ? [{
        id: `${key}-${run.id}`, category: 'statutory', title: `${title} — ${label(run)}`,
        subtitle: isDone ? 'Deposited' : 'Not yet deposited', period: periodOf(run), ...WHOLE_MONTH,
        ...money(amount, isDone ? amount : 0), dueDate,
        webLink: `/hr/payroll-runs/${run.id}`, mobileLink: null,
      }]
      : [];
  const pfEsiDue = pfEsiDueDate(run.year, run.month);
  const items: ToPayItem[] = [];
  if (s.payrollPfEnabled !== false) {
    items.push(...due('pf', 'PF', (await svc.pfChallan(run.id)).grandTotal, pfEsiDue, done.has('pf')));
  }
  if (s.payrollEsiEnabled !== false) {
    items.push(...due('esi', 'ESI', (await svc.esiChallan(run.id)).grandTotal, pfEsiDue, done.has('esi')));
  }
  if (s.payrollPtEnabled !== false) {
    for (const c of (await svc.ptChallan(run.id)).challans) {
      const when = ptDueDate(c.stateCode, run.year, run.month)?.date ?? pfEsiDue;
      items.push(...due(`pt${c.stateCode}`, 'Professional tax', c.totalPt, when, done.has(`pt:${c.stateCode}`)));
    }
  }
  if (s.payrollTdsEnabled !== false) {
    const [t] = await db.select({ tds: sql<string>`coalesce(sum(${payslips.tds}), 0)` })
      .from(payslips).where(eq(payslips.payrollRunId, run.id));
    items.push(...due('tds', 'TDS on salaries', Number(t?.tds ?? 0), tdsDueDate(run.year, run.month), done.has('tds')));
  }
  return items;
}
