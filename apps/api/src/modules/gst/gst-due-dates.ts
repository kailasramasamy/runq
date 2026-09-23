/**
 * GST filing calendar — the one place that knows when a return is due.
 *
 * Shared by the reminder scheduler (which emails + notifies on a cadence)
 * and the in-app deadline alert endpoint, so the banner a user sees and the
 * email they get can never disagree about how many days are left.
 *
 * Monthly filers only: GSTR-1 on the 11th, GSTR-3B on the 20th of the month
 * FOLLOWING the return period. QRMP (quarterly) filers have different dates
 * (IFF on the 13th, 3B on the 22nd/24th) and are not modelled here.
 */

export type GstReturnType = 'gstr1' | 'gstr3b';

/** Due day-of-month, in the month after the period (monthly filers). */
export const DUE_DAY: Record<GstReturnType, number> = { gstr1: 11, gstr3b: 20 };

// ── IST clock ──────────────────────────────────────────────────────────

/** Current wall-clock time in IST, decomposed. Filing deadlines are IST. */
export function istNow(): { date: Date; hour: number; min: number; day: number } {
  const nowUTC = new Date();
  const istHour = (nowUTC.getUTCHours() + 5 + Math.floor((nowUTC.getUTCMinutes() + 30) / 60)) % 24;
  const istMin = (nowUTC.getUTCMinutes() + 30) % 60;
  const istDate = new Date(nowUTC.getTime() + 5.5 * 60 * 60 * 1000);
  return { date: istDate, hour: istHour, min: istMin, day: istDate.getDate() };
}

// ── Period helpers (MMYYYY, the GSTN period format) ────────────────────

/** Format a Date as MMYYYY. */
export function periodFor(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${mm}${d.getFullYear()}`;
}

/** The period currently being filed — last calendar month. */
export function previousMonthPeriod(): string {
  const now = new Date();
  return periodFor(new Date(now.getFullYear(), now.getMonth() - 1, 1));
}

/** True if period `a` is strictly before period `b`. */
export function periodIsBefore(a: string, b: string): boolean {
  const aY = parseInt(a.substring(2), 10), aM = parseInt(a.substring(0, 2), 10);
  const bY = parseInt(b.substring(2), 10), bM = parseInt(b.substring(0, 2), 10);
  return aY < bY || (aY === bY && aM < bM);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "082026" → "Aug 2026" */
export function periodToLabel(period: string): string {
  const month = parseInt(period.substring(0, 2), 10);
  const year = parseInt(period.substring(2), 10);
  return `${MONTHS[month - 1]} ${year}`;
}

// ── Due dates ──────────────────────────────────────────────────────────

/** Due date for `period`, as a local Date at midnight. */
export function dueDateFor(returnType: GstReturnType, period: string): Date {
  const month = parseInt(period.substring(0, 2), 10);
  const year = parseInt(period.substring(2), 10);
  // `month` is 1-based, so passing it as a 0-based index lands on the
  // FOLLOWING month — which is exactly where the due date sits.
  return new Date(year, month, DUE_DAY[returnType]);
}

/** Days from `today` until the due date. Negative once overdue. */
export function daysUntilDue(returnType: GstReturnType, period: string, today: Date): number {
  const due = dueDateFor(returnType, period);
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((due.getTime() - from.getTime()) / 86_400_000);
}

/**
 * Late fee estimate: Rs 50/day combined CGST+SGST (Rs 25 each), capped at
 * Rs 5,000. An estimate only — the real figure depends on nil vs non-nil and
 * the turnover slab.
 */
export function estimateLateFee(daysOverdue: number): number {
  return Math.min(50 * daysOverdue, 5000);
}

// ── Alert escalation ───────────────────────────────────────────────────

/**
 * How loudly to nag, given days remaining. The ladder deliberately stays
 * quiet until T-5: a modal on every app open for two weeks trains people to
 * dismiss it blind, which costs more than it buys.
 *
 *   > 5 days   → nothing (the dashboard card already carries the date)
 *   3-5 days   → dismissible amber strip
 *   1-2 days   → strip + a modal on the first open of the day
 *   due/overdue → red strip that will not dismiss, + daily modal
 */
export type GstAlertTier = 'none' | 'strip' | 'modal' | 'critical';

export function alertTierFor(daysLeft: number): GstAlertTier {
  if (daysLeft <= 0) return 'critical';
  if (daysLeft <= 2) return 'modal';
  if (daysLeft <= 5) return 'strip';
  return 'none';
}
