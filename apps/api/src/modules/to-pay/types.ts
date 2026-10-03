/** What the business pays, grouped the way an owner thinks about it. */
export type ToPayCategory = 'bills' | 'rent_transport' | 'salaries' | 'statutory' | 'milk' | 'claims';

export type ToPayStatus = 'paid' | 'partial' | 'due';

export interface ToPayItem {
  /** Stable per source row (or per run / cycle when rolled up). */
  id: string;
  category: ToPayCategory;
  title: string;
  subtitle: string;
  /** First of the month this payment is FOR (payroll month, billed period…). */
  period: string;
  /**
   * The part of the month it covers when that's narrower than the month —
   * a milk cycle ("1–15 Sep") or a twice-monthly rent half. Null otherwise.
   * `subPeriodStart` (YYYY-MM-DD) orders the groups.
   */
  subPeriod: string | null;
  subPeriodStart: string | null;
  /**
   * What to open for a breakdown when the item rolls many payees into one
   * line: a milk cycle's farmers (all direct lines, or one VMCC's). Null when
   * the item is a single payment.
   */
  detail: { kind: 'milk_cycle'; cycleId: string; vmccNodeId: string | null } | null;
  amount: number;
  paid: number;
  balance: number;
  status: ToPayStatus;
  /** YYYY-MM-DD — when it is (or was) due. */
  dueDate: string;
  /** Where to act on it. Mobile is null where the app has no screen for it. */
  webLink: string;
  mobileLink: string | null;
}

/**
 * Which payments a source returns: everything still owed (any period), or
 * every payment — paid or not — belonging to one month (YYYY-MM-01).
 */
export type ToPayScope = { kind: 'outstanding' } | { kind: 'month'; month: string };

export const CATEGORY_LABEL: Record<ToPayCategory, string> = {
  bills: 'Vendor bills',
  rent_transport: 'Rent & transport',
  salaries: 'Salaries',
  statutory: 'Statutory dues',
  milk: 'Milk payments',
  claims: 'Employee claims',
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Build the money fields consistently from a total and what's been paid. */
export function money(amount: number, paid: number) {
  const a = r2(amount);
  const p = r2(Math.min(paid, a));
  const balance = r2(a - p);
  const status: ToPayStatus = balance <= 0 ? 'paid' : p > 0 ? 'partial' : 'due';
  return { amount: a, paid: p, balance, status };
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "1–15 Sep", or "28 Sep – 4 Oct" across a month boundary. */
export function rangeLabel(start: string, end: string): string {
  const d = (x: string) => Number(x.slice(8, 10));
  const m = (x: string) => MON[Number(x.slice(5, 7)) - 1];
  return start.slice(0, 7) === end.slice(0, 7)
    ? `${d(start)}–${d(end)} ${m(end)}`
    : `${d(start)} ${m(start)} – ${d(end)} ${m(end)}`;
}

/** Last day of [date]'s month, as YYYY-MM-DD. */
export function monthEnd(date: string): string {
  const y = Number(date.slice(0, 4));
  const mo = Number(date.slice(5, 7));
  return `${date.slice(0, 8)}${String(new Date(Date.UTC(y, mo, 0)).getUTCDate()).padStart(2, '0')}`;
}

/** No narrower span than the month. */
export const WHOLE_MONTH = { subPeriod: null, subPeriodStart: null, detail: null } as const;

/** First of the month for a YYYY-MM-DD date. */
export const monthOf = (date: string) => `${date.slice(0, 7)}-01`;

/** Whether an item belongs in [scope]. */
export function inScope(scope: ToPayScope, i: { period: string; balance: number }): boolean {
  return scope.kind === 'outstanding' ? i.balance > 0 : i.period === scope.month;
}
