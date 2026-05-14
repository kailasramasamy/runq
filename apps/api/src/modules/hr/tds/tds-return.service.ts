import { eq, and, desc, inArray } from 'drizzle-orm';
import {
  tdsReturns, tdsChallans, payrollRuns, payslips, employees, tenants,
} from '@runq/db';
import type { Db, Form24QData, Form24QAnnexureIRow, Form24QAnnexureIIRow } from '@runq/db';
import type { TenantSettings } from '@runq/types';
import { computeNewRegimeAnnualTax } from '../payroll/statutory';
import { buildForm24QExport, type Form24QDeductor } from './form24q';
import { NotFoundError, ConflictError } from '../../../utils/errors';

const STANDARD_DEDUCTION = 75000; // mirrors statutory.ts

function r2(n: number): number { return Math.round(n * 100) / 100; }

/**
 * Calendar (year, month) pairs for a financial-year quarter. FY `'2026-27'`:
 * Q1 = Apr–Jun 2026, Q2 = Jul–Sep, Q3 = Oct–Dec, Q4 = Jan–Mar 2027.
 */
export function quarterMonths(
  financialYear: string,
  quarter: number,
): Array<{ year: number; month: number }> {
  const startYear = Number(financialYear.slice(0, 4));
  if (quarter === 4) return [1, 2, 3].map((month) => ({ year: startYear + 1, month }));
  const base = (quarter - 1) * 3 + 4; // Q1→4, Q2→7, Q3→10
  return [base, base + 1, base + 2].map((month) => ({ year: startYear, month }));
}

/** All twelve (year, month) pairs of a financial year, for the Q4 annexure. */
function fyMonths(financialYear: string): Array<{ year: number; month: number }> {
  return [1, 2, 3, 4].flatMap((q) => quarterMonths(financialYear, q));
}

type TdsReturn = typeof tdsReturns.$inferSelect;

/**
 * Quarterly Form 24Q returns. `generate()` snapshots Annexure I (and II in
 * Q4) from payslips + deposited challans into the `data` jsonb; the return
 * then moves draft → validated → generated → filed as the customer prepares
 * and uploads the RPU/FVU file.
 */
export class TdsReturnService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  async list(): Promise<TdsReturn[]> {
    return this.db
      .select()
      .from(tdsReturns)
      .where(eq(tdsReturns.tenantId, this.tenantId))
      .orderBy(desc(tdsReturns.financialYear), desc(tdsReturns.quarter));
  }

  async getById(id: string): Promise<TdsReturn> {
    const [row] = await this.db
      .select()
      .from(tdsReturns)
      .where(and(eq(tdsReturns.id, id), eq(tdsReturns.tenantId, this.tenantId)))
      .limit(1);
    if (!row) throw new NotFoundError('TDS return');
    return row;
  }

  /** Build (or rebuild) the Annexure I/II snapshot for a quarter. */
  async generate(financialYear: string, quarter: number): Promise<TdsReturn> {
    const settings = await this.settings();
    const tan = settings.tan;
    if (!tan) throw new ConflictError('Set the company TAN in Company Settings before generating Form 24Q');

    const existing = await this.findReturn(financialYear, quarter);
    if (existing?.status === 'filed') {
      throw new ConflictError('This quarter is already filed — file an amendment instead');
    }

    const data: Form24QData = {
      annexureI: await this.buildAnnexureI(financialYear, quarter),
    };
    if (quarter === 4) {
      data.annexureII = await this.buildAnnexureII(financialYear);
    }

    if (existing) {
      const [updated] = await this.db
        .update(tdsReturns)
        .set({ data, status: 'draft', errorDetails: null, updatedAt: new Date() })
        .where(eq(tdsReturns.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await this.db
      .insert(tdsReturns)
      .values({ tenantId: this.tenantId, tan, financialYear, quarter, data })
      .returning();
    return created;
  }

  /** Pre-flight checks: every deductee needs a PAN and a challan CIN. */
  async validate(id: string): Promise<TdsReturn> {
    const ret = await this.getById(id);
    if (ret.status === 'filed') throw new ConflictError('Return is already filed');
    const data = ret.data;
    if (!data) throw new ConflictError('Generate the return before validating');

    const issues: Array<{ code: string; message: string }> = [];
    for (const row of data.annexureI) {
      if (!row.pan) {
        issues.push({ code: 'MISSING_PAN', message: `${row.employeeName} (${row.employeeCode}) has no PAN` });
      }
      if (!row.challanBsrCode) {
        issues.push({
          code: 'MISSING_CHALLAN',
          message: `TDS for ${row.employeeName} in month ${row.paymentMonth} has no deposited challan — record the CIN first`,
        });
      }
    }

    const [updated] = await this.db
      .update(tdsReturns)
      .set({
        status: issues.length > 0 ? 'error' : 'validated',
        errorDetails: issues.length > 0 ? issues : null,
        updatedAt: new Date(),
      })
      .where(eq(tdsReturns.id, id))
      .returning();
    return updated;
  }

  /**
   * Build the Form 24Q worksheet for download. Advances a validated return to
   * `generated` — the file is now ready to run through NSDL's RPU + FVU.
   */
  async buildExport(id: string): Promise<{ filename: string; body: string }> {
    const ret = await this.getById(id);
    if (!ret.data) throw new ConflictError('Generate the return before exporting');

    const settings = await this.settings();
    const deductor: Form24QDeductor = {
      tan: ret.tan,
      // Deductor PAN is embedded in the GSTIN (chars 3-12).
      pan: settings.gstin ? settings.gstin.slice(2, 12) : null,
      name: settings.legalName ?? '',
      financialYear: ret.financialYear,
      quarter: ret.quarter,
    };
    const body = buildForm24QExport(deductor, ret.data);

    if (ret.status === 'validated') {
      await this.db
        .update(tdsReturns)
        .set({ status: 'generated', updatedAt: new Date() })
        .where(eq(tdsReturns.id, id));
    }
    return { filename: `form-24q-${ret.financialYear}-Q${ret.quarter}.csv`, body };
  }

  /** Record the provisional receipt / token after filing on TRACES. */
  async markFiled(id: string, token: string, userId: string, notes?: string | null): Promise<TdsReturn> {
    const ret = await this.getById(id);
    if (ret.status === 'filed') throw new ConflictError('Return is already filed');
    const [updated] = await this.db
      .update(tdsReturns)
      .set({
        status: 'filed', token, filedBy: userId, filedAt: new Date(),
        notes: notes ?? ret.notes, updatedAt: new Date(),
      })
      .where(eq(tdsReturns.id, id))
      .returning();
    return updated;
  }

  async delete(id: string): Promise<void> {
    const ret = await this.getById(id);
    if (ret.status === 'filed') {
      throw new ConflictError('Cannot delete a filed return — amendments are required');
    }
    await this.db.delete(tdsReturns).where(eq(tdsReturns.id, id));
  }

  // ── internals ────────────────────────────────────────────────────────

  private async findReturn(financialYear: string, quarter: number) {
    const [row] = await this.db
      .select()
      .from(tdsReturns)
      .where(and(
        eq(tdsReturns.tenantId, this.tenantId),
        eq(tdsReturns.returnType, '24q'),
        eq(tdsReturns.financialYear, financialYear),
        eq(tdsReturns.quarter, quarter),
      ))
      .limit(1);
    return row;
  }

  private async settings(): Promise<Partial<TenantSettings>> {
    const [row] = await this.db
      .select({ settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, this.tenantId))
      .limit(1);
    return (row?.settings ?? {}) as Partial<TenantSettings>;
  }

  /** Payslips for the given months, joined to employee identity. */
  private async slipsForMonths(months: Array<{ year: number; month: number }>) {
    const runs = await this.db
      .select({ id: payrollRuns.id, month: payrollRuns.month, year: payrollRuns.year })
      .from(payrollRuns)
      .where(and(
        eq(payrollRuns.tenantId, this.tenantId),
        inArray(payrollRuns.month, months.map((m) => m.month)),
        inArray(payrollRuns.year, months.map((m) => m.year)),
      ));
    // inArray on month/year independently can over-match across years — keep
    // only runs whose (year, month) pair is actually in the requested set.
    const wanted = new Set(months.map((m) => `${m.year}-${m.month}`));
    const runsInScope = runs.filter((r) => wanted.has(`${r.year}-${r.month}`));
    if (runsInScope.length === 0) return [];

    const runMonth = new Map(runsInScope.map((r) => [r.id, { year: r.year, month: r.month }]));
    const slips = await this.db
      .select({
        employeeId: payslips.employeeId,
        payrollRunId: payslips.payrollRunId,
        gross: payslips.gross,
        tds: payslips.tds,
        employeeCode: employees.employeeCode,
        firstName: employees.firstName,
        lastName: employees.lastName,
        pan: employees.pan,
      })
      .from(payslips)
      .innerJoin(employees, eq(employees.id, payslips.employeeId))
      .where(inArray(payslips.payrollRunId, runsInScope.map((r) => r.id)));

    return slips.map((s) => ({
      ...s,
      ...runMonth.get(s.payrollRunId)!,
    }));
  }

  /** month-of-year → deposited challan CIN, for linking deductions. */
  private async challanCinByMonth(months: Array<{ year: number; month: number }>) {
    const rows = await this.db
      .select()
      .from(tdsChallans)
      .where(and(
        eq(tdsChallans.tenantId, this.tenantId),
        inArray(tdsChallans.periodMonth, months.map((m) => m.month)),
        inArray(tdsChallans.periodYear, months.map((m) => m.year)),
      ));
    const map = new Map<string, { bsr: string | null; serial: string | null; date: string | null }>();
    for (const c of rows) {
      if (c.status !== 'deposited') continue;
      map.set(`${c.periodYear}-${c.periodMonth}`, {
        bsr: c.bsrCode, serial: c.challanSerialNo, date: c.depositDate,
      });
    }
    return map;
  }

  private async buildAnnexureI(
    financialYear: string,
    quarter: number,
  ): Promise<Form24QAnnexureIRow[]> {
    const months = quarterMonths(financialYear, quarter);
    const slips = await this.slipsForMonths(months);
    const cinByMonth = await this.challanCinByMonth(months);

    return slips
      .filter((s) => Number(s.tds) > 0)
      .map((s) => {
        const cin = cinByMonth.get(`${s.year}-${s.month}`);
        return {
          employeeId: s.employeeId,
          employeeCode: s.employeeCode,
          employeeName: `${s.firstName}${s.lastName ? ' ' + s.lastName : ''}`,
          pan: s.pan,
          challanBsrCode: cin?.bsr ?? null,
          challanSerialNo: cin?.serial ?? null,
          challanDepositDate: cin?.date ?? null,
          paymentMonth: s.month,
          amountPaid: r2(Number(s.gross)),
          tdsDeducted: r2(Number(s.tds)),
        };
      })
      .sort((a, b) => a.paymentMonth - b.paymentMonth
        || a.employeeCode.localeCompare(b.employeeCode));
  }

  private async buildAnnexureII(financialYear: string): Promise<Form24QAnnexureIIRow[]> {
    const slips = await this.slipsForMonths(fyMonths(financialYear));

    const byEmp = new Map<string, Form24QAnnexureIIRow & { _gross: number }>();
    for (const s of slips) {
      const existing = byEmp.get(s.employeeId) ?? {
        employeeId: s.employeeId,
        employeeCode: s.employeeCode,
        employeeName: `${s.firstName}${s.lastName ? ' ' + s.lastName : ''}`,
        pan: s.pan,
        grossSalary: 0,
        standardDeduction: 0,
        taxableIncome: 0,
        taxOnIncome: 0,
        tdsDeducted: 0,
        monthsPaid: 0,
        _gross: 0,
      };
      existing._gross += Number(s.gross);
      existing.tdsDeducted += Number(s.tds);
      existing.monthsPaid++;
      byEmp.set(s.employeeId, existing);
    }

    return [...byEmp.values()]
      .map((e) => {
        const grossSalary = r2(e._gross);
        const standardDeduction = Math.min(STANDARD_DEDUCTION, grossSalary);
        return {
          employeeId: e.employeeId,
          employeeCode: e.employeeCode,
          employeeName: e.employeeName,
          pan: e.pan,
          grossSalary,
          standardDeduction,
          taxableIncome: r2(Math.max(0, grossSalary - standardDeduction)),
          taxOnIncome: computeNewRegimeAnnualTax(grossSalary),
          tdsDeducted: r2(e.tdsDeducted),
          monthsPaid: e.monthsPaid,
        };
      })
      .sort((a, b) => a.employeeCode.localeCompare(b.employeeCode));
  }
}
