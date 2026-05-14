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

  const start = new Date(fromDate + 'T00:00:00Z');
  const end = new Date(toDate + 'T00:00:00Z');
  let days = 0;
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    if (opts.holidayDates.has(iso)) continue;
    if (opts.weeklyOffDays.includes(d.getUTCDay())) continue;
    days++;
  }
  return days;
}
