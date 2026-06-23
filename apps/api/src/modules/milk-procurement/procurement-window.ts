/** A (collection date, shift) slot — the unit a CC's dispatch pool is built from. */
export type Slot = { date: string; shift: 'am' | 'pm' };

/** ISO `yyyy-mm-dd` for the day before `iso`. */
export function prevDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
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
 * excluded here. Overnight pooling assumes per-shift source VMCCs (the norm) —
 * a whole-day (null-shift) incoming consignment won't match a window slot.
 */
export function ccReceiveWindow(overnight: boolean, anchorDate: string): Slot[] {
  return overnight
    ? [{ date: prevDay(anchorDate), shift: 'pm' }, { date: anchorDate, shift: 'am' }]
    : [{ date: anchorDate, shift: 'am' }, { date: anchorDate, shift: 'pm' }];
}
