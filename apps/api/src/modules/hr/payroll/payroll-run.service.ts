import { eq, and, or, gte, lte, desc, inArray, sql } from 'drizzle-orm';
import {
  payrollRuns, payslips, employees, attendance, holidays, tenants,
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

type LineItem = { code: string; name: string; amount: number };

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
function ymd(d: Date): string { return d.toISOString().slice(0, 10); }
function r2(n: number): number { return Math.round(n * 100) / 100; }

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
      ...calcPfChallan(rows),
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
      esiWages: Number(s.gross),
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
        gross: payslips.gross,
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
    const workingDaysInMonth = await this.workingDaysInMonth(run.year, run.month);

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
    const { stateCode: ptStateCode } = await this.statutorySettings();

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

      for (const emp of activeEmps) {
        const salary = await salarySvc.getCurrent(emp.id, monthEnd);
        if (!salary) continue;

        const ctcMonthly = Number(salary.ctcAnnual) / 12;
        const components = (salary.componentsSnapshot ?? []) as Array<{
          code: string; name: string; type: string; calcType: string; value: number;
        }>;

        // Compute attendance for the month
        const att = await tx
          .select({ status: attendance.status, hours: attendance.hoursWorked, ot: attendance.otHours })
          .from(attendance)
          .where(and(
            eq(attendance.tenantId, this.tenantId),
            eq(attendance.employeeId, emp.id),
            gte(attendance.date, monthStart),
            lte(attendance.date, monthEnd),
          ));

        let presentDays = 0, halfDays = 0, absentDays = 0, leaveDays = 0;
        let otHours = 0;
        for (const a of att) {
          if (a.status === 'present') presentDays++;
          else if (a.status === 'half_day') halfDays++;
          else if (a.status === 'absent') absentDays++;
          else if (a.status === 'leave') leaveDays++;
          otHours += Number(a.ot ?? 0);
        }
        // When attendance hasn't been tracked at all for the month, treat as
        // fully present — practical default for systems just rolling out HR.
        const noAttendanceTracked = att.length === 0;
        const presentDaysEffective = noAttendanceTracked ? workingDaysInMonth : presentDays;
        const paidDays = presentDaysEffective + halfDays * 0.5 + leaveDays;
        const lop = Math.max(0, workingDaysInMonth - presentDaysEffective - halfDays * 0.5 - leaveDays);

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

        // Pro-rate by attendance
        const proRateFactor = workingDaysInMonth > 0 ? (workingDaysInMonth - lop) / workingDaysInMonth : 1;
        for (const e of earnings) e.amount = r2(e.amount * proRateFactor);
        const gross = r2(earnings.reduce((s, e) => s + e.amount, 0));
        const basicProrated = r2(basic * proRateFactor);

        // Statutory
        const pf = calcPf(basicProrated);
        const esi = calcEsi(gross, esiCovered.has(emp.id));
        const pt = calcPt(ptStateCode, gross, emp.gender, run.month);
        const tdsPrior = tdsHistory.get(emp.id) ?? { grossSoFar: 0, tdsSoFar: 0 };
        const tds = calcMonthlyTdsNewRegime({
          fyIncomeSoFar: tdsPrior.grossSoFar,
          currentMonthGross: gross,
          futureMonthGross: grossFull,
          remainingMonths,
          tdsPaidSoFar: tdsPrior.tdsSoFar,
        });

        const lopAmt = r2((earnings.reduce((s, e) => s + e.amount, 0) / Math.max(proRateFactor, 0.0001)) - gross);
        if (lop > 0 && lopAmt > 0) deductions.push({ code: 'LOP', name: 'Loss of Pay', amount: lopAmt });
        deductions.push({ code: 'PF_EE', name: 'Provident Fund', amount: pf.employee });
        if (esi.employee > 0) deductions.push({ code: 'ESI_EE', name: 'ESI', amount: esi.employee });
        if (pt > 0) deductions.push({ code: 'PT', name: 'Professional Tax', amount: pt });
        if (tds > 0) deductions.push({ code: 'TDS', name: 'TDS', amount: tds });

        const totalDed = r2(deductions.reduce((s, d) => s + d.amount, 0));
        const netPay = r2(gross - totalDed);

        await tx.insert(payslips).values({
          tenantId: this.tenantId,
          payrollRunId: id,
          employeeId: emp.id,
          workingDays: String(workingDaysInMonth),
          presentDays: String(presentDays + halfDays * 0.5),
          lopDays: String(r2(lop)),
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
      totals.gross += Number(s.gross);
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
    if (input.deductions) {
      updates.deductions = input.deductions;
      updates.totalDeductions = String(r2(input.deductions.reduce((s, d) => s + d.amount, 0)));
    }
    if (input.earnings && input.deductions) {
      const gross = input.earnings.reduce((s, e) => s + e.amount, 0);
      const ded = input.deductions.reduce((s, d) => s + d.amount, 0);
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

  /** Mon-Sat minus holidays for the month. */
  private async workingDaysInMonth(year: number, month: number): Promise<number> {
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const end = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth(year, month)).padStart(2, '0')}`;

    const hRows = await this.db
      .select({ date: holidays.date })
      .from(holidays)
      .where(and(
        eq(holidays.tenantId, this.tenantId),
        gte(holidays.date, start),
        lte(holidays.date, end),
      ));
    const holidaySet = new Set(hRows.map((r) => r.date));

    let count = 0;
    const last = new Date(Date.UTC(year, month, 0));
    for (let d = new Date(Date.UTC(year, month - 1, 1)); d <= last; d.setUTCDate(d.getUTCDate() + 1)) {
      if (d.getUTCDay() === 0) continue;
      if (holidaySet.has(ymd(d))) continue;
      count++;
    }
    return count;
  }

}
