import { eq, and, gte, lte, inArray, sql } from 'drizzle-orm';
import { employees, attendance, departments, designations } from '@runq/db';
import type { Db } from '@runq/db';

export interface WageRegisterRow {
  employeeCode: string;
  employeeName: string;
  designation: string | null;
  department: string | null;
  agency: string | null;
  dailyWageRate: number;
  daysWorked: number;
  halfDays: number;
  otHours: number;
  grossWages: number;
}

/**
 * Wage register — analogous to Form XVIII under the Contract Labour
 * (Regulation and Abolition) Act. One row per wage/contract employee
 * for the month with attendance + computed wage.
 */
export class WageRegisterService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  async generate(year: number, month: number): Promise<WageRegisterRow[]> {
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = new Date(Date.UTC(year, month, 0));
    const end = endDate.toISOString().slice(0, 10);

    const emps = await this.db
      .select({
        emp: employees,
        deptName: departments.name,
        desigName: designations.name,
      })
      .from(employees)
      .leftJoin(departments, eq(departments.id, employees.departmentId))
      .leftJoin(designations, eq(designations.id, employees.designationId))
      .where(and(
        eq(employees.tenantId, this.tenantId),
        inArray(employees.employmentType, ['wage', 'contract']),
      ));

    if (emps.length === 0) return [];

    const empIds = emps.map((r) => r.emp.id);
    const attRows = await this.db
      .select({
        employeeId: attendance.employeeId,
        status: attendance.status,
        otHours: attendance.otHours,
      })
      .from(attendance)
      .where(and(
        eq(attendance.tenantId, this.tenantId),
        gte(attendance.date, start),
        lte(attendance.date, end),
        inArray(attendance.employeeId, empIds),
      ));

    const byEmp = new Map<string, { full: number; half: number; ot: number }>();
    for (const a of attRows) {
      const k = byEmp.get(a.employeeId) ?? { full: 0, half: 0, ot: 0 };
      if (a.status === 'present') k.full++;
      else if (a.status === 'half_day') k.half++;
      k.ot += Number(a.otHours ?? 0);
      byEmp.set(a.employeeId, k);
    }

    return emps
      .map((r) => {
        const att = byEmp.get(r.emp.id) ?? { full: 0, half: 0, ot: 0 };
        const rate = Number(r.emp.dailyWageRate ?? 0);
        const daysWorked = att.full + att.half * 0.5;
        const gross = Math.round(daysWorked * rate * 100) / 100;
        return {
          employeeCode: r.emp.employeeCode,
          employeeName: `${r.emp.firstName}${r.emp.lastName ? ' ' + r.emp.lastName : ''}`,
          designation: r.desigName ?? null,
          department: r.deptName ?? null,
          agency: r.emp.agency ?? null,
          dailyWageRate: rate,
          daysWorked: att.full,
          halfDays: att.half,
          otHours: Math.round(att.ot * 100) / 100,
          grossWages: gross,
        };
      })
      .sort((a, b) => a.employeeCode.localeCompare(b.employeeCode));
  }

  toCsv(rows: WageRegisterRow[]): string {
    const head = 'Code,Name,Designation,Department,Agency,Daily Rate,Full Days,Half Days,OT Hours,Gross Wages';
    const body = rows.map((r) => [
      r.employeeCode,
      csvEsc(r.employeeName),
      csvEsc(r.designation ?? ''),
      csvEsc(r.department ?? ''),
      csvEsc(r.agency ?? ''),
      r.dailyWageRate,
      r.daysWorked,
      r.halfDays,
      r.otHours,
      r.grossWages,
    ].join(','));
    return [head, ...body].join('\n');
  }
}

function csvEsc(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}
