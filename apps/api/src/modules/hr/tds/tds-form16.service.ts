import { eq, and, inArray } from 'drizzle-orm';
import {
  payrollRuns, payslips, employees, designations, tenants, tdsReturns,
} from '@runq/db';
import type { Db } from '@runq/db';
import type { TenantSettings } from '@runq/types';
import { computeNewRegimeTaxBreakdown } from '../payroll/statutory';
import { quarterMonths } from './tds-return.service';

const STANDARD_DEDUCTION = 75000; // mirrors statutory.ts

function r2(n: number): number { return Math.round(n * 100) / 100; }

/** FY '2026-27' → assessment year '2027-28'. */
function assessmentYearOf(financialYear: string): string {
  const start = Number(financialYear.slice(0, 4)) + 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** Payroll month (1-12) → FY quarter (1-4). Apr–Jun = Q1 … Jan–Mar = Q4. */
function quarterOfMonth(month: number): number {
  if (month >= 4 && month <= 6) return 1;
  if (month >= 7 && month <= 9) return 2;
  if (month >= 10 && month <= 12) return 3;
  return 4; // Jan–Mar
}

export interface Form16Employer {
  name: string;
  tan: string | null;
  pan: string | null;
}

export interface Form16QuarterRow {
  quarter: number;
  tds: number;
  /** Form 24Q provisional receipt number — populated once the quarter is filed. */
  receiptNumber: string | null;
}

export interface Form16PartB {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  employeePan: string | null;
  designation: string | null;
  grossSalary: number;
  standardDeduction: number;
  incomeChargeableSalaries: number;
  chapterVIADeductions: number;    // 0 — new regime, no declarations
  totalIncome: number;
  taxBeforeRebate: number;
  rebate87A: number;
  taxAfterRebate: number;
  cess: number;
  totalTaxLiability: number;
  tdsDeducted: number;
  /** +ve = shortfall still payable, −ve = excess to be refunded. */
  balancePayable: number;
  monthsPaid: number;
  quarterly: Form16QuarterRow[];
}

export interface Form16Result {
  financialYear: string;
  assessmentYear: string;
  employer: Form16Employer;
  employees: Form16PartB[];
}

/**
 * Form 16 Part B — annual salary + tax computation per employee, derived from
 * payslips. Computed on demand, not persisted. Part A (TRACES-signed challan
 * summary) is downloaded separately by the employer and is out of scope.
 */
export class TdsForm16Service {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  async generate(financialYear: string): Promise<Form16Result> {
    const months = [1, 2, 3, 4].flatMap((q) => quarterMonths(financialYear, q));
    const settings = await this.settings();

    const employer: Form16Employer = {
      name: settings.legalName ?? '',
      tan: settings.tan ?? null,
      // Deductor PAN is embedded in the GSTIN (chars 3-12).
      pan: settings.gstin ? settings.gstin.slice(2, 12) : null,
    };
    const result: Form16Result = {
      financialYear,
      assessmentYear: assessmentYearOf(financialYear),
      employer,
      employees: [],
    };

    const runs = await this.db
      .select({ id: payrollRuns.id, month: payrollRuns.month, year: payrollRuns.year })
      .from(payrollRuns)
      .where(and(
        eq(payrollRuns.tenantId, this.tenantId),
        inArray(payrollRuns.month, months.map((m) => m.month)),
        inArray(payrollRuns.year, months.map((m) => m.year)),
      ));
    const wanted = new Set(months.map((m) => `${m.year}-${m.month}`));
    const runsInScope = runs.filter((r) => wanted.has(`${r.year}-${r.month}`));
    if (runsInScope.length === 0) return result;

    const runMonth = new Map(runsInScope.map((r) => [r.id, r.month]));
    const slips = await this.db
      .select({
        employeeId: payslips.employeeId,
        payrollRunId: payslips.payrollRunId,
        // Salary chargeable to tax is what was paid, not the contracted gross.
        gross: payslips.paidWages,
        tds: payslips.tds,
        employeeCode: employees.employeeCode,
        firstName: employees.firstName,
        lastName: employees.lastName,
        pan: employees.pan,
        designationId: employees.designationId,
      })
      .from(payslips)
      .innerJoin(employees, eq(employees.id, payslips.employeeId))
      .where(inArray(payslips.payrollRunId, runsInScope.map((r) => r.id)));

    const desigMap = await this.designationNames(slips.map((s) => s.designationId));
    const tokenByQuarter = await this.filedReceiptsByQuarter(financialYear);

    type Acc = {
      employeeId: string; employeeCode: string; employeeName: string;
      employeePan: string | null; designation: string | null;
      gross: number; tds: number; monthsPaid: number; quarterlyTds: Record<number, number>;
    };
    const byEmp = new Map<string, Acc>();
    for (const s of slips) {
      const month = runMonth.get(s.payrollRunId)!;
      const quarter = quarterOfMonth(month);
      const acc = byEmp.get(s.employeeId) ?? {
        employeeId: s.employeeId,
        employeeCode: s.employeeCode,
        employeeName: `${s.firstName}${s.lastName ? ' ' + s.lastName : ''}`,
        employeePan: s.pan,
        designation: s.designationId ? desigMap.get(s.designationId) ?? null : null,
        gross: 0, tds: 0, monthsPaid: 0, quarterlyTds: {},
      };
      acc.gross += Number(s.gross);
      acc.tds += Number(s.tds);
      acc.monthsPaid++;
      acc.quarterlyTds[quarter] = (acc.quarterlyTds[quarter] ?? 0) + Number(s.tds);
      byEmp.set(s.employeeId, acc);
    }

    for (const acc of byEmp.values()) {
      const grossSalary = r2(acc.gross);
      const standardDeduction = Math.min(STANDARD_DEDUCTION, grossSalary);
      const b = computeNewRegimeTaxBreakdown(grossSalary);
      result.employees.push({
        employeeId: acc.employeeId,
        employeeCode: acc.employeeCode,
        employeeName: acc.employeeName,
        employeePan: acc.employeePan,
        designation: acc.designation,
        grossSalary,
        standardDeduction,
        incomeChargeableSalaries: r2(Math.max(0, grossSalary - standardDeduction)),
        chapterVIADeductions: 0,
        totalIncome: b.taxableIncome,
        taxBeforeRebate: b.taxBeforeRebate,
        rebate87A: b.rebate87A,
        taxAfterRebate: b.taxAfterRebate,
        cess: b.cess,
        totalTaxLiability: b.totalTax,
        tdsDeducted: r2(acc.tds),
        balancePayable: r2(b.totalTax - acc.tds),
        monthsPaid: acc.monthsPaid,
        quarterly: [1, 2, 3, 4].map((q) => ({
          quarter: q,
          tds: r2(acc.quarterlyTds[q] ?? 0),
          receiptNumber: tokenByQuarter.get(q) ?? null,
        })),
      });
    }
    result.employees.sort((a, b) => a.employeeCode.localeCompare(b.employeeCode));
    return result;
  }

  // ── internals ────────────────────────────────────────────────────────

  private async settings(): Promise<Partial<TenantSettings>> {
    const [row] = await this.db
      .select({ settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, this.tenantId))
      .limit(1);
    return (row?.settings ?? {}) as Partial<TenantSettings>;
  }

  private async designationNames(ids: Array<string | null>): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((x): x is string => !!x))];
    const map = new Map<string, string>();
    if (unique.length === 0) return map;
    const rows = await this.db
      .select({ id: designations.id, name: designations.name })
      .from(designations)
      .where(inArray(designations.id, unique));
    for (const r of rows) map.set(r.id, r.name);
    return map;
  }

  /** quarter → Form 24Q receipt number, only for quarters already filed. */
  private async filedReceiptsByQuarter(financialYear: string): Promise<Map<number, string | null>> {
    const rows = await this.db
      .select({ quarter: tdsReturns.quarter, token: tdsReturns.token, status: tdsReturns.status })
      .from(tdsReturns)
      .where(and(
        eq(tdsReturns.tenantId, this.tenantId),
        eq(tdsReturns.financialYear, financialYear),
      ));
    const map = new Map<number, string | null>();
    for (const r of rows) {
      if (r.status === 'filed') map.set(r.quarter, r.token);
    }
    return map;
  }
}
