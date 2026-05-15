import { eq, and, desc } from 'drizzle-orm';
import { statutoryChallans, tdsReturns, payrollRuns, tenants } from '@runq/db';
import type { Db } from '@runq/db';
import type { TenantSettings } from '@runq/types';
import { ptDueDate } from './payroll/statutory';

/**
 * The DB-backed statutory deadlines — TDS deposits, Form 24Q, and Professional
 * Tax — each carrying real filing status. PF/ESI and GST deadlines are pure
 * date arithmetic and are computed client-side by the calendar component.
 */
export interface StatutoryDeadline {
  kind: 'tds_deposit' | 'tds_24q' | 'pt';
  label: string;
  sublabel: string;
  dueDate: string;                 // YYYY-MM-DD
  status: 'pending' | 'done';
  amount?: number;
}

const MONTHS = ['', 'Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** TDS deducted in `month` is deposited by the 7th of the next month — except
 *  March, which is due 30 April. */
function tdsDepositDue(year: number, month: number): string {
  if (month === 3) return iso(year, 4, 30);
  return month === 12 ? iso(year + 1, 1, 7) : iso(year, month + 1, 7);
}

/** Form 24Q quarter → filing deadline. Q1 Jul 31, Q2 Oct 31, Q3 Jan 31, Q4 May 31. */
function quarterDeadline(financialYear: string, quarter: number): string {
  const sy = Number(financialYear.slice(0, 4));
  if (quarter === 1) return iso(sy, 7, 31);
  if (quarter === 2) return iso(sy, 10, 31);
  if (quarter === 3) return iso(sy + 1, 1, 31);
  return iso(sy + 1, 5, 31);
}

/** The Form 24Q quarter whose deadline is next (allowing a 20-day grace so a
 *  just-passed deadline still surfaces). */
function nextQuarter(today: Date): { financialYear: string; quarter: number; dueDate: string } {
  const fyStart = today.getMonth() + 1 >= 4 ? today.getFullYear() : today.getFullYear() - 1;
  const fy = (y: number) => `${y}-${pad((y + 1) % 100)}`;
  const candidates = [
    { financialYear: fy(fyStart - 1), quarter: 4 },
    { financialYear: fy(fyStart), quarter: 1 },
    { financialYear: fy(fyStart), quarter: 2 },
    { financialYear: fy(fyStart), quarter: 3 },
    { financialYear: fy(fyStart), quarter: 4 },
  ].map((c) => ({ ...c, dueDate: quarterDeadline(c.financialYear, c.quarter) }));

  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - 20);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  return candidates.find((c) => c.dueDate >= cutoffIso) ?? candidates[candidates.length - 1];
}

export class StatutoryCalendarService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  async upcoming(): Promise<StatutoryDeadline[]> {
    const today = new Date();
    const items: StatutoryDeadline[] = [];

    // TDS deposits — every TDS challan still awaiting deposit. Reads from
    // the unified statutory_challans table, filtered to TDS.
    const challans = await this.db
      .select()
      .from(statutoryChallans)
      .where(and(
        eq(statutoryChallans.tenantId, this.tenantId),
        eq(statutoryChallans.kind, 'tds'),
        eq(statutoryChallans.status, 'pending'),
      ));
    for (const c of challans) {
      items.push({
        kind: 'tds_deposit',
        label: `TDS deposit — ${MONTHS[c.periodMonth]} ${c.periodYear}`,
        sublabel: 'Challan ITNS-281',
        dueDate: tdsDepositDue(c.periodYear, c.periodMonth),
        status: 'pending',
        amount: Number(c.liabilityAmount),
      });
    }

    // Form 24Q — the next quarter due, with its real lifecycle status.
    const q = nextQuarter(today);
    const [ret] = await this.db
      .select()
      .from(tdsReturns)
      .where(and(
        eq(tdsReturns.tenantId, this.tenantId),
        eq(tdsReturns.financialYear, q.financialYear),
        eq(tdsReturns.quarter, q.quarter),
      ))
      .limit(1);
    items.push({
      kind: 'tds_24q',
      label: `Form 24Q — FY ${q.financialYear} Q${q.quarter}`,
      sublabel: ret ? `Status: ${ret.status}` : 'Not generated yet',
      dueDate: q.dueDate,
      status: ret?.status === 'filed' ? 'done' : 'pending',
    });

    // Professional Tax — state-specific due date for the latest payroll month.
    const settings = await this.settings();
    const [latestRun] = await this.db
      .select({ month: payrollRuns.month, year: payrollRuns.year })
      .from(payrollRuns)
      .where(eq(payrollRuns.tenantId, this.tenantId))
      .orderBy(desc(payrollRuns.year), desc(payrollRuns.month))
      .limit(1);
    if (latestRun && settings.stateCode) {
      const due = ptDueDate(settings.stateCode, latestRun.year, latestRun.month);
      if (due) {
        items.push({
          kind: 'pt',
          label: `Professional Tax — ${MONTHS[latestRun.month]} ${latestRun.year}`,
          sublabel: `Form ${due.form} · ${due.portal}`,
          dueDate: due.date,
          status: 'pending',
        });
      }
    }

    return items.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }

  private async settings(): Promise<Partial<TenantSettings>> {
    const [row] = await this.db
      .select({ settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, this.tenantId))
      .limit(1);
    return (row?.settings ?? {}) as Partial<TenantSettings>;
  }
}
