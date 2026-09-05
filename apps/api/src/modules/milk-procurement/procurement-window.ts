/** A (collection date, shift) slot — the unit a CC's dispatch pool is built from. */
export type Slot = { date: string; shift: 'am' | 'pm' };

/** ISO `yyyy-mm-dd` for the day before `iso`. */
export function prevDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** ISO `yyyy-mm-dd` for the day after `iso`. */
export function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * The (date, shift) slots that make up a CC's current dispatch pool, anchored on
 * `anchorDate` (today):
 *  - same-day  → today AM + today PM
 *  - overnight → previous-day PM + today AM (milk chilled overnight and dispatched
 *    with the next morning's collection)
 *
 * Today's PM under overnight belongs to the NEXT pool, so it's intentionally
 * excluded here.
 */
export function ccReceiveWindow(overnight: boolean, anchorDate: string): Slot[] {
  return overnight
    ? [{ date: prevDay(anchorDate), shift: 'pm' }, { date: anchorDate, shift: 'am' }]
    : [{ date: anchorDate, shift: 'am' }, { date: anchorDate, shift: 'pm' }];
}

/** How a node closes collection and dispatches. Mirrors the `mp_dispatch_mode`
 * DB enum; see its comment for what each value means. */
export type DispatchMode = 'per_shift' | 'day' | 'overnight';

/** Pooled modes dispatch one untagged tanker (`shift = null`); `per_shift`
 * tags each consignment with its own shift. This single predicate is what keeps
 * close, dispatch, and availability agreeing on the shape of a pool. */
export function isPooled(mode: DispatchMode): boolean {
  return mode !== 'per_shift';
}

/**
 * The slots a close or a dispatch covers, anchored on `anchorDate`.
 *
 * `per_shift` needs the caller to name which shift; the pooled modes ignore it
 * because the pool's membership is fixed by the mode, not by what the operator
 * has on screen. Returning the slot list (rather than a boolean each caller
 * re-interprets) is what stopped close and dispatch drifting apart — they now
 * gate on exactly the same set.
 *
 * Throws when `per_shift` is given no shift: silently defaulting would close or
 * dispatch a shift the operator didn't pick.
 */
export function poolSlots(mode: DispatchMode, anchorDate: string, shift?: 'am' | 'pm'): Slot[] {
  if (mode === 'overnight') return ccReceiveWindow(true, anchorDate);
  if (mode === 'day') return ccReceiveWindow(false, anchorDate);
  if (!shift) throw new Error('per_shift node requires a shift');
  return [{ date: anchorDate, shift }];
}

/**
 * The slots a status read reports on — always the node's whole current window,
 * regardless of which shift the caller is looking at, so the UI can show both
 * halves of a pool (and both shifts of a per-shift day) at once.
 */
export function statusSlots(mode: DispatchMode, anchorDate: string): Slot[] {
  return ccReceiveWindow(mode === 'overnight', anchorDate);
}

/** An accrual window: both ends inclusive, ISO `yyyy-mm-dd`. */
export type Period = { start: string; end: string };

/**
 * The bonus accrual period `onDate` falls in — `months` long, counted from
 * `anchor`, both ends inclusive.
 *
 * Anchored rather than calendar-quartered because Vrindavan's first period runs
 * 2026-08-01 → 2026-10-31. Dates before the anchor return null: nothing accrues
 * before the scheme starts, so the receipt quotes no running total for them.
 */
export function bonusPeriodFor(anchor: string, months: number, onDate: string): Period | null {
  if (months <= 0 || onDate < anchor) return null;
  const [ay, am, ad] = anchor.split('-').map(Number) as [number, number, number];
  const [oy, om] = onDate.split('-').map(Number) as [number, number, number];
  // Whole periods elapsed. The day-of-month check keeps a period that starts
  // mid-month from rolling early — anchor the 15th, and the 14th is still the
  // previous period.
  const monthsApart = (oy - ay) * 12 + (om - am) - (Number(onDate.slice(8, 10)) < ad ? 1 : 0);
  const idx = Math.floor(monthsApart / months);
  const startMonth = am - 1 + idx * months;
  const start = new Date(Date.UTC(ay, startMonth, ad));
  const end = new Date(Date.UTC(ay, startMonth + months, ad));
  end.setUTCDate(end.getUTCDate() - 1);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}
