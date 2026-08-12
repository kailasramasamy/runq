import { eq, and, sql, inArray, lte, gte, or, isNull } from 'drizzle-orm';
import { labourContracts, contractMembers, contractDayLog } from '@runq/db';
import type { Db } from '@runq/db';
import { memberEarnings, type DayException, type MemberTerms } from './contracts/earnings';

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
 * (Regulation and Abolition) Act.
 *
 * Sourced from labour contracts rather than from `employees` rows flagged
 * wage/contract. That flag was always a proxy: contract labour is precisely
 * the people who are *not* on the rolls, and since contracts became
 * name-based most of them have no employee record to be flagged. Each crew
 * member is their own row, identified by contract number rather than an
 * employee code.
 *
 * A task-lumpsum contract has no per-day price, so it contributes a single
 * row with its agreed amount in the month the term covers, and zero days.
 */
export class WageRegisterService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  async generate(year: number, month: number): Promise<WageRegisterRow[]> {
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);

    // Any contract whose term overlaps the month. An open-ended contract
    // (null end date) overlaps every month from its start onward.
    const contracts = await this.db
      .select()
      .from(labourContracts)
      .where(and(
        eq(labourContracts.tenantId, this.tenantId),
        sql`${labourContracts.status}::text <> 'cancelled'`,
        lte(labourContracts.startDate, end),
        or(isNull(labourContracts.endDate), gte(labourContracts.endDate, start)),
      ));
    if (contracts.length === 0) return [];

    const ids = contracts.map((c) => c.id);
    const [members, exceptions] = await Promise.all([
      this.db.select().from(contractMembers).where(inArray(contractMembers.contractId, ids)),
      this.db.select().from(contractDayLog).where(and(
        inArray(contractDayLog.contractId, ids),
        gte(contractDayLog.logDate, start),
        lte(contractDayLog.logDate, end),
      )),
    ]);

    const exc: DayException[] = exceptions.map((e) => ({
      memberId: e.memberId,
      logDate: e.logDate,
      status: e.status,
    }));

    const rows: WageRegisterRow[] = [];
    for (const c of contracts) {
      if (c.contractType === 'task_lumpsum') {
        rows.push({
          employeeCode: c.contractNumber,
          employeeName: c.leadPersonName,
          designation: 'Crew lead',
          department: c.name,
          agency: null,
          dailyWageRate: 0,
          daysWorked: 0,
          halfDays: 0,
          otHours: 0,
          grossWages: Number(c.fixedAmount ?? 0),
        });
        continue;
      }

      // The month is the reporting window; the member's own accrual window
      // narrows it further via joined/left dates.
      const windowStart = c.startDate > start ? c.startDate : start;
      const windowEnd = c.endDate && c.endDate < end ? c.endDate : end;
      if (windowEnd < windowStart) continue;

      for (const m of members.filter((x) => x.contractId === c.id)) {
        const terms: MemberTerms = {
          id: m.id,
          name: m.name,
          role: m.role,
          dailyRate: Number(m.dailyRate),
          joinedOn: m.joinedOn,
          leftOn: m.leftOn,
        };
        // Same helper the settlement prices from, so the register a labour
        // inspector reads cannot disagree with what the worker was paid.
        const e = memberEarnings(terms, exc, windowStart, windowEnd);
        if (e.eligibleDays === 0) continue;
        rows.push({
          employeeCode: c.contractNumber,
          employeeName: m.name,
          designation: m.role,
          department: c.name,
          agency: c.leadPersonName,
          dailyWageRate: terms.dailyRate,
          daysWorked: e.eligibleDays - e.leaveDays - e.halfDays,
          halfDays: e.halfDays,
          otHours: 0,
          grossWages: e.earned,
        });
      }
    }

    return rows.sort(
      (a, b) =>
        a.employeeCode.localeCompare(b.employeeCode) ||
        a.employeeName.localeCompare(b.employeeName),
    );
  }

  toCsv(rows: WageRegisterRow[]): string {
    const head = 'Contract,Name,Role,Job,Crew lead,Daily Rate,Full Days,Half Days,OT Hours,Gross Wages';
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
