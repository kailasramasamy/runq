import { eq, and, or, gte, lte, desc, inArray, isNull, sql } from 'drizzle-orm';
import {
  payrollRuns, payslips, employees, attendance, holidays, tenants, employeeSalary,
  designations, departments,
} from '@runq/db';
import type { Db } from '@runq/db';
import type { TenantSettings } from '@runq/types';
import type {
  CreatePayrollRunInput, UpdatePayslipInput,
} from '@runq/validators';
import { NotFoundError, ConflictError } from '../../../utils/errors';
import {
  calcPf, calcEsi, calcPt, calcMonthlyTdsNewRegime,
  calcPfChallan, calcEsiChallan, calcPtChallan,
  esiPeriodMonthsBefore, fyMonthsBefore,
} from './statutory';
import { EmployeeSalaryService } from './employee-salary.service';
import { GLService } from '../../gl/gl.service';
import { resolveWeeklyOffDays, countWorkingDays, countWorkingDaysBetween } from '../work-calendar';
import {
  reverseRunRecoveries, applyEmployeeRecoveries, runRecoveryTotals,
  mergeRecoveryLines,
} from './recovery';
import { EmployeeDeductionService } from './deduction.service';

type LineItem = { code: string; name: string; amount: number };

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
function r2(n: number): number { return Math.round(n * 100) / 100; }

/**
 * The " (17 Aug)" suffix on a Loss of Pay line. Lists the dates while they
 * still fit on one line, and falls back to a count beyond that — a month with
 * a dozen unpaid days would otherwise produce a deduction label longer than
 * the payslip is wide.
 *
 * [lopDays] can exceed [dates] under assume-present, where days outside the
 * employment window are unpaid but have no attendance row to date.
 */
function lopLabel(dates: string[], lopDays: number): string {
  if (dates.length === 0 || dates.length > 3) {
    const d = r2(lopDays);
    return ` (${d} day${d === 1 ? '' : 's'})`;
  }
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const labels = dates.map((iso) => {
    const d = new Date(iso + 'T00:00:00Z');
    return `${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
  });
  return ` (${labels.join(', ')})`;
}

export class PayrollRunService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  async list() {
    return this.db
      .select()
      .from(payrollRuns)
      .where(eq(payrollRuns.tenantId, this.tenantId))
      .orderBy(desc(payrollRuns.year), desc(payrollRuns.month));
  }

  async getById(id: string) {
    const [row] = await this.db
      .select()
      .from(payrollRuns)
      .where(and(eq(payrollRuns.id, id), eq(payrollRuns.tenantId, this.tenantId)))
      .limit(1);
    if (!row) throw new NotFoundError('Payroll run');
    return row;
  }

  /**
   * Active employees this run cannot pay because they have no salary
   * assignment as of the run's month. process() skips them silently
   * (`if (!salary) continue`), so without this a run reporting 2 payslips
   * across a 10-person workforce looks like a completed payroll rather than
   * a mostly-empty one.
   *
   * Computed on read rather than stored at process time so it reflects the
   * current state — assign a salary and the warning clears on refresh.
   */
  async unpayableEmployees(runId: string) {
    const run = await this.getById(runId);
    const monthEnd = `${run.year}-${String(run.month).padStart(2, '0')}-${String(daysInMonth(run.year, run.month)).padStart(2, '0')}`;
    return this.db
      .select({
        id: employees.id,
        employeeCode: employees.employeeCode,
        firstName: employees.firstName,
        lastName: employees.lastName,
      })
      .from(employees)
      .where(and(
        eq(employees.tenantId, this.tenantId),
        eq(employees.status, 'active'),
        isNull(employees.deletedAt),
        sql`NOT EXISTS (
          SELECT 1 FROM ${employeeSalary} es
           WHERE es.employee_id = ${employees.id}
             AND es.effective_from <= ${monthEnd}
             AND (es.effective_to IS NULL OR es.effective_to >= ${monthEnd})
        )`,
      ))
      .orderBy(employees.employeeCode);
  }

  async listPayslips(runId: string) {
    await this.getById(runId);
    const rows = await this.db
      .select({
        ps: payslips,
        firstName: employees.firstName,
        lastName: employees.lastName,
        employeeCode: employees.employeeCode,
      })
      .from(payslips)
      .innerJoin(employees, eq(employees.id, payslips.employeeId))
      .where(eq(payslips.payrollRunId, runId))
      .orderBy(employees.employeeCode);
    return rows.map((r) => ({
      ...r.ps,
      employeeCode: r.employeeCode,
      employeeName: `${r.firstName}${r.lastName ? ' ' + r.lastName : ''}`,
    }));
  }

  /** Tenant statutory profile (registration numbers) shown on challans. */
  private async statutorySettings(): Promise<Partial<TenantSettings>> {
    const [row] = await this.db
      .select({ settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, this.tenantId))
      .limit(1);
    return (row?.settings ?? {}) as Partial<TenantSettings>;
  }

  /**
   * EPFO challan summary for a run — the account-head totals the customer
   * reconciles against the portal's TRRN before paying.
   */
  async pfChallan(runId: string) {
    const run = await this.getById(runId);
    const slips = await this.db
      .select()
      .from(payslips)
      .where(eq(payslips.payrollRunId, runId));

    const rows = slips.map((s) => {
      const pfWages = (s.earnings ?? [])
        .filter((c) => c.code === 'BASIC' || c.code === 'DA')
        .reduce((sum, c) => sum + c.amount, 0);
      return {
        pfWages,
        pfEmployee: Number(s.pfEmployee),
        pfEmployer: Number(s.pfEmployer),
      };
    });

    const settings = await this.statutorySettings();
    return {
      run: { id: run.id, month: run.month, year: run.year, status: run.status },
      pfEstablishmentCode: settings.pfEstablishmentCode ?? null,
      ...calcPfChallan(rows, { epsEnabled: settings.payrollEpsEnabled !== false }),
    };
  }

  /**
   * ESIC challan summary for a run — IP count and the employee/employer
   * shares the customer pays against the portal's challan.
   */
  async esiChallan(runId: string) {
    const run = await this.getById(runId);
    const slips = await this.db
      .select()
      .from(payslips)
      .where(eq(payslips.payrollRunId, runId));

    const rows = slips.map((s) => ({
      // Contributions are due on wages paid, not the contracted gross.
      esiWages: Number(s.paidWages),
      esiEmployee: Number(s.esiEmployee),
      esiEmployer: Number(s.esiEmployer),
    }));

    const settings = await this.statutorySettings();
    return {
      run: { id: run.id, month: run.month, year: run.year, status: run.status },
      esiRegistrationNumber: settings.esiRegistrationNumber ?? null,
      ...calcEsiChallan(rows),
    };
  }

  /**
   * Professional Tax challan summary for a run — per-state PT totals the
   * customer pays to each state's PT portal. PT is a state levy; the
   * establishment's state comes from tenant settings, so a run currently
   * yields a single state group.
   */
  async ptChallan(runId: string) {
    const run = await this.getById(runId);
    const slips = await this.db
      .select({ pt: payslips.pt })
      .from(payslips)
      .where(eq(payslips.payrollRunId, runId));

    const settings = await this.statutorySettings();
    const stateCode = settings.stateCode ?? '';
    const rows = slips.map((s) => ({ stateCode, pt: Number(s.pt) }));

    return {
      run: { id: run.id, month: run.month, year: run.year, status: run.status },
      ptRegistrationNumber: settings.ptRegistrationNumber ?? null,
      challans: calcPtChallan(rows),
    };
  }

  /**
   * Everything the printed payslip needs in one read: the slip, the employee's
   * identity and statutory ids, and the issuing company. A payslip is used as
   * proof of income, so it has to stand on its own — the reader can't be sent
   * elsewhere for the employer's address or the employee's PAN.
   */
  async getPayslipForPrint(runId: string, payslipId: string) {
    const [row] = await this.db
      .select({
        ps: payslips,
        firstName: employees.firstName,
        lastName: employees.lastName,
        employeeCode: employees.employeeCode,
        joiningDate: employees.joiningDate,
        pan: employees.pan,
        uan: employees.uan,
        esiNumber: employees.esiNumber,
        bankAccountNumber: employees.bankAccountNumber,
        bankName: employees.bankName,
        designation: designations.name,
        department: departments.name,
        runMonth: payrollRuns.month,
        runYear: payrollRuns.year,
      })
      .from(payslips)
      .innerJoin(employees, eq(employees.id, payslips.employeeId))
      .innerJoin(payrollRuns, eq(payrollRuns.id, payslips.payrollRunId))
      .leftJoin(designations, eq(designations.id, employees.designationId))
      .leftJoin(departments, eq(departments.id, employees.departmentId))
      .where(and(
        eq(payslips.tenantId, this.tenantId),
        eq(payslips.id, payslipId),
        eq(payslips.payrollRunId, runId),
      ))
      .limit(1);
    if (!row) throw new NotFoundError('Payslip');

    const [tenant] = await this.db
      .select({ name: tenants.name, settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, this.tenantId))
      .limit(1);

    const dedSvc = new EmployeeDeductionService(this.db, this.tenantId);
    const owed = await dedSvc.recoverySummary(row.ps.employeeId);

    return {
      slip: {
        employeeCode: row.employeeCode,
        employeeName: `${row.firstName}${row.lastName ? ' ' + row.lastName : ''}`,
        designation: row.designation,
        department: row.department,
        joiningDate: row.joiningDate,
        pan: row.pan,
        uan: row.uan,
        esiNumber: row.esiNumber,
        bankAccountNumber: row.bankAccountNumber,
        bankName: row.bankName,
        month: row.runMonth,
        year: row.runYear,
        workingDays: row.ps.workingDays,
        paidDays: row.ps.paidDays,
        lopDays: row.ps.lopDays,
        lopDates: row.ps.lopDates,
        earnings: row.ps.earnings ?? [],
        deductions: row.ps.deductions ?? [],
        gross: row.ps.gross,
        totalDeductions: row.ps.totalDeductions,
        netPay: row.ps.netPay,
        recoveryBalance: {
          loans: owed.loanOutstanding,
          deductions: owed.deductionOutstanding,
          total: owed.totalOutstanding,
        },
      },
      tenantName: tenant?.name ?? '',
      settings: (tenant?.settings ?? {}) as TenantSettings,
    };
  }

  async getPayslip(runId: string, payslipId: string) {
    const [row] = await this.db
      .select({
        ps: payslips,
        firstName: employees.firstName,
        lastName: employees.lastName,
        employeeCode: employees.employeeCode,
        // Detail screen renders a "May 2026" header off month + year;
        // they live on the payroll_runs row, not the payslip itself,
        // so we have to join them in here. Without these the mobile
        // `periodLabel` getter falls back to the bare year ("0") since
        // month defaults to 0 when the field is absent.
        runMonth: payrollRuns.month,
        runYear: payrollRuns.year,
        runStatus: payrollRuns.status,
      })
      .from(payslips)
      .innerJoin(employees, eq(employees.id, payslips.employeeId))
      .innerJoin(payrollRuns, eq(payrollRuns.id, payslips.payrollRunId))
      .where(and(
        eq(payslips.tenantId, this.tenantId),
        eq(payslips.id, payslipId),
        eq(payslips.payrollRunId, runId),
      ))
      .limit(1);
    if (!row) throw new NotFoundError('Payslip');
    return {
      ...row.ps,
      employeeCode: row.employeeCode,
      employeeName: `${row.firstName}${row.lastName ? ' ' + row.lastName : ''}`,
      month: row.runMonth,
      year: row.runYear,
      runStatus: row.runStatus,
    };
  }

  async create(input: CreatePayrollRunInput) {
    const [dup] = await this.db
      .select({ id: payrollRuns.id })
      .from(payrollRuns)
      .where(and(
        eq(payrollRuns.tenantId, this.tenantId),
        eq(payrollRuns.year, input.year),
        eq(payrollRuns.month, input.month),
      ))
      .limit(1);
    if (dup) throw new ConflictError('Payroll run already exists for this month');

    const [row] = await this.db
      .insert(payrollRuns)
      .values({
        tenantId: this.tenantId,
        month: input.month,
        year: input.year,
        status: 'draft',
        notes: input.notes ?? null,
      })
      .returning();
    return row;
  }

  /**
   * Employees who were ESI-covered in an earlier month of the contribution
   * period that (year, month) falls in. ESIC keeps such employees contributing
   * until period-end even after wages cross ₹21,000 — see calcEsi().
   */
  private async esiContinuedCoverage(year: number, month: number): Promise<Set<string>> {
    const months = esiPeriodMonthsBefore(year, month);
    if (months.length === 0) return new Set();

    const priorRuns = await this.db
      .select({ id: payrollRuns.id })
      .from(payrollRuns)
      .where(and(
        eq(payrollRuns.tenantId, this.tenantId),
        or(...months.map((m) => and(eq(payrollRuns.year, m.year), eq(payrollRuns.month, m.month)))),
      ));
    if (priorRuns.length === 0) return new Set();

    const slips = await this.db
      .select({
        employeeId: payslips.employeeId,
        esiEmployee: payslips.esiEmployee,
        esiEmployer: payslips.esiEmployer,
      })
      .from(payslips)
      .where(inArray(payslips.payrollRunId, priorRuns.map((r) => r.id)));

    const covered = new Set<string>();
    for (const s of slips) {
      if (Number(s.esiEmployee) > 0 || Number(s.esiEmployer) > 0) covered.add(s.employeeId);
    }
    return covered;
  }

  /**
   * Per-employee taxable gross + TDS already booked earlier in the financial
   * year that (year, month) falls in. Drives the TDS projection and true-up
   * in process() — see calcMonthlyTdsNewRegime().
   */
  private async fyTdsHistory(
    year: number,
    month: number,
  ): Promise<Map<string, { grossSoFar: number; tdsSoFar: number }>> {
    const out = new Map<string, { grossSoFar: number; tdsSoFar: number }>();
    const months = fyMonthsBefore(year, month);
    if (months.length === 0) return out;

    const priorRuns = await this.db
      .select({ id: payrollRuns.id })
      .from(payrollRuns)
      .where(and(
        eq(payrollRuns.tenantId, this.tenantId),
        or(...months.map((m) => and(eq(payrollRuns.year, m.year), eq(payrollRuns.month, m.month)))),
      ));
    if (priorRuns.length === 0) return out;

    const slips = await this.db
      .select({
        employeeId: payslips.employeeId,
        gross: payslips.paidWages,
        tds: payslips.tds,
      })
      .from(payslips)
      .where(inArray(payslips.payrollRunId, priorRuns.map((r) => r.id)));

    for (const s of slips) {
      const entry = out.get(s.employeeId) ?? { grossSoFar: 0, tdsSoFar: 0 };
      entry.grossSoFar += Number(s.gross);
      entry.tdsSoFar += Number(s.tds);
      out.set(s.employeeId, entry);
    }
    return out;
  }

  /** Compute payslips for every active employee with a current salary assignment. */
  async process(id: string, userId: string) {
    const run = await this.getById(id);
    if (run.status !== 'draft' && run.status !== 'processed') {
      throw new ConflictError('Run is already approved or closed');
    }

    const monthStart = `${run.year}-${String(run.month).padStart(2, '0')}-01`;
    const monthEnd = `${run.year}-${String(run.month).padStart(2, '0')}-${String(daysInMonth(run.year, run.month)).padStart(2, '0')}`;
    // Working days are per-employee now: an org that works Sundays models it
    // as a shift with no week-offs, and its people must be priced against a
    // 30-day month rather than the 26 a hardcoded Sunday-off assumed. Cached
    // by week-off pattern — a workforce shares a handful of shifts at most.
    const settings = await this.statutorySettings();
    // An operation that runs through public holidays keeps its holiday list
    // for display but doesn't let it shorten the payroll month.
    const monthHolidays = settings.payrollHolidaysAreWorkingDays === true
      ? new Set<string>()
      : await this.monthHolidaySet(run.year, run.month);
    const workingDaysByPattern = new Map<string, number>();
    const workingDaysFor = async (employeeId: string) => {
      const offs = await resolveWeeklyOffDays(this.db, this.tenantId, employeeId, monthEnd);
      const key = [...offs].sort().join(',');
      let days = workingDaysByPattern.get(key);
      if (days == null) {
        days = countWorkingDays(run.year, run.month, offs, monthHolidays);
        workingDaysByPattern.set(key, days);
      }
      return days;
    };
    // Working days the employee was actually on the books for — the month
    // clipped to their joining and exit dates. A mid-month joiner is paid for
    // their part of the month rather than all of it, which matters far more
    // under assume-present, where nothing else would flag the gap.
    const employedWorkingDaysFor = async (
      emp: { id: string; joiningDate: string; exitDate: string | null },
    ) => {
      const from = emp.joiningDate > monthStart ? emp.joiningDate : monthStart;
      const to = emp.exitDate && emp.exitDate < monthEnd ? emp.exitDate : monthEnd;
      const offs = await resolveWeeklyOffDays(this.db, this.tenantId, emp.id, monthEnd);
      return countWorkingDaysBetween(from, to, offs, monthHolidays);
    };

    const activeEmps = await this.db
      .select()
      .from(employees)
      .where(and(
        eq(employees.tenantId, this.tenantId),
        eq(employees.status, 'active'),
      ));

    // Employees still ESI-covered from earlier in this contribution period —
    // they keep contributing even if wages have since crossed ₹21,000.
    const esiCovered = await this.esiContinuedCoverage(run.year, run.month);

    // Professional Tax is a state levy — the establishment's state drives the slab.
    // Statutory toggles let a tenant disable PF/EPS/PT/TDS globally; undefined
    // defaults to enabled for back-compat. EPS only matters when PF is enabled.
    const ptStateCode = settings.stateCode;
    const pfEnabled = settings.payrollPfEnabled !== false;
    const ptEnabled = settings.payrollPtEnabled !== false;
    const esiEnabled = settings.payrollEsiEnabled !== false;
    // Orgs that don't run a daily muster: an unmarked day means the employee
    // was working, not absent. Without this every unrecorded day becomes LOP,
    // and — because the "no attendance at all" fallback only fires on a
    // completely empty month — taking a single day's leave would drag the
    // whole month into Loss of Pay.
    const assumePresent = settings.payrollAttendanceMode === 'assume_present';
    const tdsEnabled = settings.payrollTdsEnabled !== false;
    // EPS toggle is consumed by pfChallan() directly from settings — payslip
    // amounts don't change with EPS on/off, only the A/c 1 vs A/c 10 split.

    // TDS is an annual tax projected across the FY — gather what's been paid
    // so far and how many months remain, so each run trues up the estimate.
    const tdsHistory = await this.fyTdsHistory(run.year, run.month);
    const remainingMonths = 12 - fyMonthsBefore(run.year, run.month).length;

    const salarySvc = new EmployeeSalaryService(this.db, this.tenantId);
    let totalGross = 0, totalDeductions = 0, totalNet = 0;
    let payslipCount = 0;

    return this.db.transaction(async (tx) => {
      // Wipe previous payslips for re-processing
      await tx.delete(payslips).where(eq(payslips.payrollRunId, id));
      // Loan/deduction recoveries live outside the payslip, so deleting the
      // slips doesn't undo them — hand back what this run took before it
      // recalculates, or a re-process would recover the same EMI twice.
      await reverseRunRecoveries(tx as unknown as Db, this.tenantId, id);

      for (const emp of activeEmps) {
        const salary = await salarySvc.getCurrent(emp.id, monthEnd);
        if (!salary) continue;

        const workingDaysInMonth = await workingDaysFor(emp.id);

        const ctcMonthly = Number(salary.ctcAnnual) / 12;
        const components = (salary.componentsSnapshot ?? []) as Array<{
          code: string; name: string; type: string; calcType: string; value: number;
        }>;

        // Compute attendance for the month
        const att = await tx
          .select({
            date: attendance.date,
            status: attendance.status,
            hours: attendance.hoursWorked,
            ot: attendance.otHours,
          })
          .from(attendance)
          .where(and(
            eq(attendance.tenantId, this.tenantId),
            eq(attendance.employeeId, emp.id),
            gte(attendance.date, monthStart),
            lte(attendance.date, monthEnd),
          ));

        let presentDays = 0, halfDays = 0, absentDays = 0, leaveDays = 0;
        let otHours = 0;
        // The dates behind the LOP count, so a short salary is explainable
        // from the payslip itself rather than by cross-referencing attendance.
        const lopDates: string[] = [];
        for (const a of att) {
          if (a.status === 'present') presentDays++;
          else if (a.status === 'half_day') { halfDays++; lopDates.push(a.date); }
          else if (a.status === 'absent') { absentDays++; lopDates.push(a.date); }
          else if (a.status === 'leave') leaveDays++;
          otHours += Number(a.ot ?? 0);
        }
        let presentDaysEffective: number;
        let paidDays: number;
        let lop: number;
        if (assumePresent) {
          // Everyone is working unless the day says otherwise. Only two things
          // reduce pay: a day marked absent (which is how unpaid leave is
          // recorded), and a day outside the employment window. Approved paid
          // leave is already paid, so it doesn't deduct.
          const employedDays = await employedWorkingDaysFor(emp);
          const notEmployed = Math.max(0, workingDaysInMonth - employedDays);
          lop = Math.min(workingDaysInMonth, notEmployed + absentDays + halfDays * 0.5);
          paidDays = workingDaysInMonth - lop;
          presentDaysEffective = Math.max(0, paidDays - leaveDays);
        } else {
          // When attendance hasn't been tracked at all for the month, treat as
          // fully present — practical default for systems just rolling out HR.
          const noAttendanceTracked = att.length === 0;
          presentDaysEffective = noAttendanceTracked ? workingDaysInMonth : presentDays;
          paidDays = presentDaysEffective + halfDays * 0.5 + leaveDays;
          lop = Math.max(0, workingDaysInMonth - presentDaysEffective - halfDays * 0.5 - leaveDays);
        }

        // Component computation
        // First pass: compute Basic (so percent_of_basic resolves)
        let basic = 0;
        let ctcForPct = ctcMonthly;
        for (const c of components) {
          if (c.code === 'BASIC') {
            basic = c.calcType === 'percent_of_ctc' ? r2(ctcForPct * (c.value / 100)) : Number(c.value);
          }
        }
        if (basic === 0) basic = r2(ctcMonthly * 0.4); // sensible default

        const earnings: LineItem[] = [];
        const deductions: LineItem[] = [];
        let grossFull = 0;

        for (const c of components) {
          if (c.type === 'statutory') continue;
          let amt = 0;
          if (c.calcType === 'fixed') amt = Number(c.value);
          else if (c.calcType === 'percent_of_basic') amt = r2(basic * (Number(c.value) / 100));
          else if (c.calcType === 'percent_of_ctc') amt = r2(ctcForPct * (Number(c.value) / 100));

          if (c.type === 'earning' || c.type === 'reimbursement') {
            earnings.push({ code: c.code, name: c.name, amount: amt });
            grossFull += amt;
          } else if (c.type === 'deduction') {
            deductions.push({ code: c.code, name: c.name, amount: amt });
          }
        }
        if (earnings.length === 0) {
          // No structure → derive a quick split from CTC
          const ba = r2(ctcMonthly * 0.4);
          const hra = r2(ba * 0.4);
          const spec = r2(ctcMonthly - ba - hra);
          earnings.push({ code: 'BASIC', name: 'Basic', amount: ba });
          earnings.push({ code: 'HRA', name: 'HRA', amount: hra });
          earnings.push({ code: 'SPECIAL', name: 'Special Allowance', amount: spec });
          grossFull = ba + hra + spec;
          basic = ba;
        }

        // Earning lines stay at their contracted value and the unpaid days come
        // off as a Loss of Pay deduction — how an Indian payslip reads, and it
        // keeps "why is this month short?" answerable on the slip itself.
        // `paidWages` is what was actually earned, and every statutory base
        // follows that: PF/ESI/PT/TDS are due on wages paid, not contracted.
        const proRateFactor = workingDaysInMonth > 0 ? (workingDaysInMonth - lop) / workingDaysInMonth : 1;
        const gross = r2(earnings.reduce((s, e) => s + e.amount, 0));
        const paidWages = r2(gross * proRateFactor);
        const lopAmount = r2(gross - paidWages);
        const basicProrated = r2(basic * proRateFactor);

        // Statutory — gated by tenant toggles. A disabled component is zeroed
        // out; the per-employee EPS split is rebuilt at challan time, so
        // payslip-level PF stays as the employer's full contribution either way.
        const pf = pfEnabled ? calcPf(basicProrated) : { employee: 0, employer: 0 };
        // Disabled ESI zeroes both shares: the wage ceiling inside calcEsi
        // only exempts individual employees, so without this an unregistered
        // establishment still deducts from everyone under it.
        const esi = esiEnabled
          ? calcEsi(paidWages, esiCovered.has(emp.id))
          : { employee: 0, employer: 0 };
        const pt = ptEnabled ? calcPt(ptStateCode, paidWages, emp.gender, run.month) : 0;
        const tdsPrior = tdsHistory.get(emp.id) ?? { grossSoFar: 0, tdsSoFar: 0 };
        const tds = tdsEnabled
          ? calcMonthlyTdsNewRegime({
              fyIncomeSoFar: tdsPrior.grossSoFar,
              currentMonthGross: paidWages,
              futureMonthGross: grossFull,
              remainingMonths,
              tdsPaidSoFar: tdsPrior.tdsSoFar,
            })
          : 0;

        // Deducted exactly once — the earning lines are no longer pro-rated,
        // so this is the only place the unpaid days come off. The dates ride
        // on the line itself: the deduction is the part an employee actually
        // queries, and it should answer "which days?" without them having to
        // cross-reference anything.
        if (lop > 0 && lopAmount > 0) {
          deductions.push({
            code: 'LOP',
            name: `Loss of Pay${lopLabel(lopDates, lop)}`,
            amount: lopAmount,
          });
        }
        if (pf.employee > 0) deductions.push({ code: 'PF_EE', name: 'Provident Fund', amount: pf.employee });
        if (esi.employee > 0) deductions.push({ code: 'ESI_EE', name: 'ESI', amount: esi.employee });
        if (pt > 0) deductions.push({ code: 'PT', name: 'Professional Tax', amount: pt });
        if (tds > 0) deductions.push({ code: 'TDS', name: 'TDS', amount: tds });

        // Recoveries come last and only out of what's left, so an advance can
        // never push a payslip negative — the shortfall carries to next month.
        const statutoryNet = r2(gross - deductions.reduce((s, d) => s + d.amount, 0));
        const recoveries = await applyEmployeeRecoveries(tx as unknown as Db, {
          tenantId: this.tenantId,
          runId: id,
          employeeId: emp.id,
          year: run.year,
          month: run.month,
          available: statutoryNet,
        });
        for (const r of recoveries) deductions.push(r);

        const totalDed = r2(deductions.reduce((s, d) => s + d.amount, 0));
        const netPay = r2(gross - totalDed);

        await tx.insert(payslips).values({
          tenantId: this.tenantId,
          payrollRunId: id,
          employeeId: emp.id,
          workingDays: String(workingDaysInMonth),
          presentDays: String(presentDays + halfDays * 0.5),
          lopDays: String(r2(lop)),
          lopDates: lopDates.sort(),
          paidWages: String(paidWages),
          paidDays: String(r2(workingDaysInMonth - lop)),
          otHours: String(otHours),
          earnings,
          deductions,
          gross: String(gross),
          totalDeductions: String(totalDed),
          netPay: String(netPay),
          pfEmployee: String(pf.employee),
          pfEmployer: String(pf.employer),
          esiEmployee: String(esi.employee),
          esiEmployer: String(esi.employer),
          tds: String(tds),
          pt: String(pt),
        });

        totalGross += gross;
        totalDeductions += totalDed;
        totalNet += netPay;
        payslipCount++;
      }

      const [updated] = await tx
        .update(payrollRuns)
        .set({
          status: 'processed',
          totalEmployees: payslipCount,
          totalGross: String(r2(totalGross)),
          totalDeductions: String(r2(totalDeductions)),
          totalNet: String(r2(totalNet)),
          processedBy: userId,
          processedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(payrollRuns.id, id))
        .returning();
      return updated;
    });
  }

  async approve(id: string, userId: string) {
    const run = await this.getById(id);
    if (run.status !== 'processed') throw new ConflictError('Run must be processed first');
    const [row] = await this.db
      .update(payrollRuns)
      .set({ status: 'approved', approvedBy: userId, approvedAt: new Date(), updatedAt: new Date() })
      .where(eq(payrollRuns.id, id))
      .returning();

    // Post a draft journal entry for the run. Failure here doesn't roll back
    // the approval — accounting can be edited or re-posted manually.
    try {
      await this.postJournalEntry(id, userId);
    } catch (e: any) {
      // Swallow; surface to admin via run.notes
      const note = `JE auto-post failed: ${e?.message ?? 'unknown'}`;
      await this.db
        .update(payrollRuns)
        .set({ notes: (row?.notes ? row.notes + ' | ' : '') + note })
        .where(eq(payrollRuns.id, id));
    }
    return row;
  }

  async postJournalEntry(runId: string, userId: string) {
    const run = await this.getById(runId);
    const slips = await this.db
      .select()
      .from(payslips)
      .where(eq(payslips.payrollRunId, runId));
    if (slips.length === 0) throw new ConflictError('No payslips to post');

    const totals = {
      gross: 0, net: 0, pfEmp: 0, pfEr: 0, esiEmp: 0, esiEr: 0, pt: 0, tds: 0,
    };
    for (const s of slips) {
      // The expense is what was earned — booking the contracted gross would
      // leave the JE short by the LOP, which is credited to nothing.
      totals.gross += Number(s.paidWages);
      totals.net += Number(s.netPay);
      totals.pfEmp += Number(s.pfEmployee);
      totals.pfEr += Number(s.pfEmployer);
      totals.esiEmp += Number(s.esiEmployee);
      totals.esiEr += Number(s.esiEmployer);
      totals.pt += Number(s.pt);
      totals.tds += Number(s.tds);
    }

    // Salary Expense = Gross (employer cost incl. employee statutory deductions)
    // Employer PF/ESI are additional cost — separate expense lines
    const date = `${run.year}-${String(run.month).padStart(2, '0')}-${String(daysInMonth(run.year, run.month)).padStart(2, '0')}`;
    const lines: Array<{ accountCode: string; debit?: number; credit?: number; description?: string }> = [
      { accountCode: '5201', debit: r2(totals.gross), description: 'Salary & Wages' },
    ];
    if (totals.pfEr > 0) lines.push({ accountCode: '5203', debit: r2(totals.pfEr), description: 'Employer PF contribution' });
    if (totals.esiEr > 0) lines.push({ accountCode: '5204', debit: r2(totals.esiEr), description: 'Employer ESI contribution' });

    if (totals.pfEmp + totals.pfEr > 0) lines.push({ accountCode: '2107', credit: r2(totals.pfEmp + totals.pfEr), description: 'PF Payable' });
    if (totals.esiEmp + totals.esiEr > 0) lines.push({ accountCode: '2108', credit: r2(totals.esiEmp + totals.esiEr), description: 'ESI Payable' });
    if (totals.pt > 0) lines.push({ accountCode: '2109', credit: r2(totals.pt), description: 'Professional Tax Payable' });
    if (totals.tds > 0) lines.push({ accountCode: '2104', credit: r2(totals.tds), description: 'TDS Payable' });

    // Recoveries came off net pay, so without these credits the entry is short
    // by exactly what was recovered. A loan repayment clears the receivable
    // raised when the advance was disbursed; an ad-hoc deduction was never an
    // asset, so it credits the recoveries account instead.
    const recovered = await runRecoveryTotals(this.db, this.tenantId, runId);
    if (recovered.loans > 0) lines.push({ accountCode: '1122', credit: recovered.loans, description: 'Advance / loan recovery' });
    if (recovered.deductions > 0) lines.push({ accountCode: '4208', credit: recovered.deductions, description: 'Employee recoveries' });

    lines.push({ accountCode: '2110', credit: r2(totals.net), description: 'Net Salary Payable' });

    const gl = new GLService(this.db, this.tenantId);
    return gl.createJournalEntry({
      date,
      description: `Payroll ${run.year}-${String(run.month).padStart(2, '0')}`,
      sourceType: 'payroll_run',
      sourceId: runId,
      lines,
    } as any);
  }

  async close(id: string) {
    const run = await this.getById(id);
    if (run.status !== 'approved') throw new ConflictError('Approve before closing');
    const [row] = await this.db
      .update(payrollRuns)
      .set({ status: 'closed', updatedAt: new Date() })
      .where(eq(payrollRuns.id, id))
      .returning();
    return row;
  }

  async updatePayslip(runId: string, payslipId: string, input: UpdatePayslipInput) {
    const run = await this.getById(runId);
    if (run.status === 'approved' || run.status === 'closed') {
      throw new ConflictError('Run is locked');
    }
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (input.earnings) {
      updates.earnings = input.earnings;
      const gross = r2(input.earnings.reduce((s, e) => s + e.amount, 0));
      updates.gross = String(gross);
    }
    let deductions = input.deductions;
    if (deductions) {
      deductions = await this.keepRecoveryLines(payslipId, deductions);
      updates.deductions = deductions;
      updates.totalDeductions = String(r2(deductions.reduce((s, d) => s + d.amount, 0)));
    }
    if (input.earnings && deductions) {
      const gross = input.earnings.reduce((s, e) => s + e.amount, 0);
      const ded = deductions.reduce((s, d) => s + d.amount, 0);
      updates.netPay = String(r2(gross - ded));
    }
    const [row] = await this.db
      .update(payslips)
      .set(updates)
      .where(and(
        eq(payslips.tenantId, this.tenantId),
        eq(payslips.id, payslipId),
        eq(payslips.payrollRunId, runId),
      ))
      .returning();
    if (!row) throw new NotFoundError('Payslip');
    return row;
  }

  private async keepRecoveryLines(
    payslipId: string, edited: LineItem[],
  ): Promise<LineItem[]> {
    const [existing] = await this.db
      .select({ deductions: payslips.deductions })
      .from(payslips)
      .where(and(eq(payslips.tenantId, this.tenantId), eq(payslips.id, payslipId)))
      .limit(1);
    return mergeRecoveryLines((existing?.deductions ?? []) as LineItem[], edited);
  }

  /** Mon-Sat minus holidays for the month. */
  /// Tenant holidays falling in a month, as a date set for countWorkingDays().
  private async monthHolidaySet(year: number, month: number): Promise<Set<string>> {
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const end = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth(year, month)).padStart(2, '0')}`;
    const rows = await this.db
      .select({ date: holidays.date })
      .from(holidays)
      .where(and(
        eq(holidays.tenantId, this.tenantId),
        gte(holidays.date, start),
        lte(holidays.date, end),
      ));
    return new Set(rows.map((r) => r.date));
  }

}
