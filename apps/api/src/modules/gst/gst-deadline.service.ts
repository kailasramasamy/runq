import { and, eq, ne } from 'drizzle-orm';
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

    const rows = await this.getUnfiledReturns(period);
    const candidates = this.buildCandidates(rows, period, settings, today);
    if (candidates.length === 0) return null;

    // Most urgent first — an older overdue return outranks a nearer deadline.
    candidates.sort((a, b) => a.daysLeft - b.daysLeft);
    return candidates[0];
  }

  /**
   * Unfiled returns for `period` and anything older still outstanding. An
   * un-filed return from three months ago is more urgent than this month's.
   */
  private async getUnfiledReturns(period: string) {
    const rows = await this.db
      .select({
        id: gstReturns.id,
        returnType: gstReturns.returnType,
        period: gstReturns.period,
        status: gstReturns.status,
      })
      .from(gstReturns)
      .where(and(
        eq(gstReturns.tenantId, this.tenantId),
        ne(gstReturns.status, 'filed'),
      ));
    // Period is MMYYYY text, so "122025" sorts after "012026" in SQL — the
    // cutoff has to be applied with real period ordering, not a string
    // comparison. A tenant only ever has two rows a month, so filtering here
    // costs nothing.
    return rows.filter((r) => r.period === period || periodIsBefore(r.period, period));
  }

  /**
   * One candidate per unfiled return, plus a synthetic `pending` candidate for
   * each return of the current period that has no row at all.
   *
   * That second half matters: if the 1st-of-month draft generation failed
   * there is no row to find, and keying the alert off row existence would go
   * silent at exactly the moment the tenant most needs the nudge.
   */
  private buildCandidates(
    rows: Array<{ id: string; returnType: string; period: string; status: string }>,
    period: string,
    settings: TenantSettings,
    today: Date,
  ): GstDeadlineAlert[] {
    const seen = new Set(rows.map((r) => `${r.returnType}:${r.period}`));
    const pending = RETURN_TYPES
      .filter((t) => !seen.has(`${t}:${period}`))
      .map((t) => ({ id: null, returnType: t, period, status: 'pending' }));

    return [...rows, ...pending]
      .filter((r) => !this.isBeforeFilingStart(r.period, settings))
      .map((r) => this.toCandidate(r, today))
      .filter((c): c is GstDeadlineAlert => c !== null);
  }

  private toCandidate(
    row: { id: string | null; returnType: string; period: string; status: string },
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
      dueDate: this.toDateOnly(dueDateFor(returnType, row.period)),
      daysLeft,
      status: row.status,
      tier,
      lateFeeEstimate: daysLeft < 0 ? estimateLateFee(Math.abs(daysLeft)) : 0,
    };
  }

  /** Periods the tenant filed elsewhere, before runQ took over their GST. */
  private isBeforeFilingStart(period: string, settings: TenantSettings): boolean {
    const start = settings.gstFilingStartPeriod;
    return !!start && periodIsBefore(period, start);
  }

  private async getSettings(): Promise<TenantSettings | null> {
    const [row] = await this.db
      .select({ settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, this.tenantId));
    return (row?.settings as TenantSettings) ?? null;
  }

  private toDateOnly(d: Date): string {
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }
}
