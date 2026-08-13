/**
 * Count working days between two ISO dates inclusive, excluding holidays
 * and weekly-off days.
 *
 * Half-day requests are always 0.5 regardless of range — the UI restricts
 * half-day to a single date.
 */
export function countLeaveDays(
  fromDate: string,
  toDate: string,
  opts: {
    halfDay: boolean;
    holidayDates: Set<string>;
    weeklyOffDays: number[]; // 0=Sun..6=Sat
  },
): number {
  if (opts.halfDay) return 0.5;
  return countedLeaveDates(fromDate, toDate, opts).length;
}

/**
 * The dates a leave request actually consumes, in order — the same set
 * countLeaveDays() totals. Callers that have to split a request into paid and
 * unpaid portions need the dates themselves, not just the count, so they can
 * mark the right days' attendance.
 */
export function countedLeaveDates(
  fromDate: string,
  toDate: string,
  opts: { holidayDates: Set<string>; weeklyOffDays: number[] },
): string[] {
  const start = new Date(fromDate + 'T00:00:00Z');
  const end = new Date(toDate + 'T00:00:00Z');
  const out: string[] = [];
  for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    if (opts.holidayDates.has(iso)) continue;
    if (opts.weeklyOffDays.includes(d.getUTCDay())) continue;
    out.push(iso);
  }
  return out;
}
