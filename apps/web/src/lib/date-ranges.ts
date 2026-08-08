/**
 * Named date ranges for report/analytics filters.
 *
 * Financial years are Indian FY (1 Apr – 31 Mar), matching how the rest of
 * the finance module frames periods.
 */

export type DateRangePresetId =
  | 'this_month'
  | 'last_month'
  | 'last_3_months'
  | 'this_fy'
  | 'last_fy'
  | 'custom';

export interface DateRange {
  dateFrom: string;
  dateTo: string;
}

function iso(d: Date): string {
  // Build the ISO date from local parts — `toISOString()` would shift the
  // day backwards for anyone east of UTC, which is every IST user.
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Calendar year in which the FY containing `on` starts. */
function fyStartYear(on: Date): number {
  return on.getMonth() >= 3 ? on.getFullYear() : on.getFullYear() - 1;
}

export function financialYearRange(startYear: number): DateRange {
  return { dateFrom: `${startYear}-04-01`, dateTo: `${startYear + 1}-03-31` };
}

export const DATE_RANGE_PRESETS: { id: DateRangePresetId; label: string }[] = [
  { id: 'this_month', label: 'This month' },
  { id: 'last_month', label: 'Last month' },
  { id: 'last_3_months', label: 'Last 3 months' },
  { id: 'this_fy', label: 'This FY' },
  { id: 'last_fy', label: 'Last FY' },
  { id: 'custom', label: 'Custom' },
];

/**
 * Resolve a preset to concrete dates. Ranges never run past today — an
 * end date in the future reads as missing data rather than "not yet".
 * `custom` has no intrinsic range; callers keep their own state for it.
 */
export function resolveDateRangePreset(preset: Exclude<DateRangePresetId, 'custom'>, today = new Date()): DateRange {
  const todayIso = iso(today);
  switch (preset) {
    case 'this_month':
      return { dateFrom: iso(new Date(today.getFullYear(), today.getMonth(), 1)), dateTo: todayIso };
    case 'last_month': {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const last = new Date(today.getFullYear(), today.getMonth(), 0);
      return { dateFrom: iso(first), dateTo: iso(last) };
    }
    case 'last_3_months': {
      const from = new Date(today.getFullYear(), today.getMonth() - 2, 1);
      return { dateFrom: iso(from), dateTo: todayIso };
    }
    case 'this_fy':
      return { dateFrom: `${fyStartYear(today)}-04-01`, dateTo: todayIso };
    case 'last_fy':
      return financialYearRange(fyStartYear(today) - 1);
  }
}

/**
 * Pick a trend bucket that keeps the chart readable: daily bars for short
 * windows, weekly up to about six months, monthly beyond that.
 */
export function autoGroupBy(range: DateRange): 'day' | 'week' | 'month' {
  const days = Math.round((Date.parse(range.dateTo) - Date.parse(range.dateFrom)) / 86400000);
  if (days <= 62) return 'day';
  if (days <= 190) return 'week';
  return 'month';
}
