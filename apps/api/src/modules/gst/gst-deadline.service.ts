import { and, eq } from 'drizzle-orm';
import { gstReturns, tenants } from '@runq/db';
import type { Db } from '@runq/db';
import type { TenantSettings } from '@runq/types';
import {
  alertTierFor,
  daysUntilDue,
  dueDateFor,
  estimateLateFee,
  istNow,
  periodIsBefore,
  periodToLabel,
  previousMonthPeriod,
  type GstAlertTier,
  type GstReturnType,
} from './gst-due-dates';

export interface GstDeadlineAlert {
  returnId: string | null;
  returnType: GstReturnType;
  returnLabel: string;            // "GSTR-1"
  period: string;                 // MMYYYY
  periodLabel: string;            // "Aug 2026"
  dueDate: string;                // YYYY-MM-DD
  daysLeft: number;               // negative once overdue
  status: string;                 // 'pending' when no draft exists yet
  tier: GstAlertTier;
  lateFeeEstimate: number;        // 0 until overdue
}

const RETURN_TYPES: GstReturnType[] = ['gstr1', 'gstr3b'];
const RETURN_LABEL: Record<GstReturnType, string> = { gstr1: 'GSTR-1', gstr3b: 'GSTR-3B' };

export interface GstReturnRow {
id: string | null;
returnType: string;
period: string;
status: string;
}

/**
 * One candidate per unfiled return, plus a synthetic `pending` candidate for
 * each return of the current period that has no row at all.
 *
 * That second half matters: if the 1st-of-month draft generation failed
 * there is no row to find, and keying the alert off row existence would go
 * silent at exactly the moment the tenant most needs the nudge. It is also
 * why `seen` is built from every row rather than only the unfiled ones —
 * "already filed" and "never drafted" must not look the same.
 */
export function selectDeadlineAlert(
  rows: GstReturnRow[],
  period: string,
  settings: TenantSettings,
  today: Date,
): GstDeadlineAlert | null {
  const seen = new Set(rows.map((r) => `${r.returnType}:${r.period}`));
  const pending = RETURN_TYPES
    .filter((t) => !seen.has(`${t}:${period}`))
    .map((t) => ({ id: null, returnType: t, period, status: 'pending' }));

  const candidates = [...rows.filter((r) => r.status !== 'filed'), ...pending]
    .filter((r) => !isBeforeFilingStart(r.period, settings))
    .map((r) => toCandidate(r, today))
    .filter((c): c is GstDeadlineAlert => c !== null);

  // Most urgent first — an older overdue return outranks a nearer deadline.
  candidates.sort((a, b) => a.daysLeft - b.daysLeft);
  return candidates[0] ?? null;
}

function toCandidate(
  row: GstReturnRow,
  today: Date,
): GstDeadlineAlert | null {
  const returnType = row.returnType as GstReturnType;
  const daysLeft = daysUntilDue(returnType, row.period, today);
  const tier = alertTierFor(daysLeft);
  if (tier === 'none') return null;

  return {
    returnId: row.id,
    returnType,
    returnLabel: RETURN_LABEL[returnType],
    period: row.period,
    periodLabel: periodToLabel(row.period),
    dueDate: toDateOnly(dueDateFor(returnType, row.period)),
    daysLeft,
    status: row.status,
    tier,
    lateFeeEstimate: daysLeft < 0 ? estimateLateFee(Math.abs(daysLeft)) : 0,
  };
}

function toDateOnly(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Periods the tenant filed elsewhere, before runQ took over their GST. */
function isBeforeFilingStart(period: string, settings: TenantSettings): boolean {
  const start = settings.gstFilingStartPeriod;
  return !!start && periodIsBefore(period, start);
}

/**
 * The in-app GST deadline alert: at most one return at a time, the most
 * urgent one, with the escalation tier the UI should render.
 *
 * The tier is decided here rather than in the browser so the ladder lives in
 * one testable place and the client stays a dumb renderer.
 */
export class GstDeadlineService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async getAlert(): Promise<GstDeadlineAlert | null> {
    const settings = await this.getSettings();
    if (!settings?.gstin) return null;

    const period = previousMonthPeriod();
    const today = istNow().date;

    return selectDeadlineAlert(await this.getReturns(period), period, settings, today);
  }

  /**
   * Every return for `period` and anything older — filed ones included.
   *
   * Filed rows have to come back even though they can never be a candidate:
   * they are what tells `buildCandidates` a return exists. Filtering them out
   * in SQL makes a filed return indistinguishable from a missing one, and the
   * synthesised `pending` branch then resurrects it as overdue the moment it
   * is filed.
   */
  private async getReturns(period: string) {
    const rows = await this.db
      .select({
        id: gstReturns.id,
        returnType: gstReturns.returnType,
        period: gstReturns.period,
        status: gstReturns.status,
      })
      .from(gstReturns)
      .where(eq(gstReturns.tenantId, this.tenantId));
    // Period is MMYYYY text, so "122025" sorts after "012026" in SQL — the
    // cutoff has to be applied with real period ordering, not a string
    // comparison. A tenant only ever has two rows a month, so filtering here
    // costs nothing.
    return rows.filter((r) => r.period === period || periodIsBefore(r.period, period));
  }

  private async getSettings(): Promise<TenantSettings | null> {
    const [row] = await this.db
      .select({ settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, this.tenantId));
    return (row?.settings as TenantSettings) ?? null;
  }

}
