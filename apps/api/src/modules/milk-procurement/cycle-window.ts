/**
 * Calendar-aligned payout windows. Extracted from payout.service so the
 * running-balance preview can ask for the *open* window using the very same
 * arithmetic that generation uses for the closed one — two derivations of a
 * cycle boundary would drift, and the preview would stop matching the bill.
 */

/**
 * Cycle windows within one month: 15-day → [1-15],[16-end]; 10-day →
 * [1-10],[11-20],[21-end]. The final window absorbs the remainder so cycles
 * never cross months. `month` is 1-based. Returned ascending.
 */
export function monthCycles(year: number, month: number, n: number): { start: string; end: string }[] {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const threshold = Math.min(30, daysInMonth); // merge a 31st-day stub
  const starts: number[] = [];
  for (let s = 1; s <= threshold; s += n) starts.push(s);
  const iso = (d: number) =>
    `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return starts.map((s, i) => ({ start: iso(s), end: iso(i < starts.length - 1 ? starts[i + 1]! - 1 : daysInMonth) }));
}

/**
 * The most recently *closed* window (end strictly before `today`), or null if
 * none has closed yet. Scans the current + previous month.
 */
export function computeDuePeriod(cycleDays: number, today: string): { start: string; end: string } | null {
  if (cycleDays < 1) return null;
  const [ty, tm] = today.split('-').map(Number);
  if (!ty || !tm) return null;
  let y = ty, m = tm;
  const candidates: { start: string; end: string }[] = [];
  for (let back = 0; back < 2; back++) {
    candidates.push(...monthCycles(y, m, cycleDays));
    m -= 1; if (m === 0) { m = 12; y -= 1; }
  }
  const closed = candidates.filter((c) => c.end < today).sort((a, b) => (a.end < b.end ? 1 : -1));
  return closed[0] ?? null;
}

/**
 * The window that CONTAINS `today` — the one still being collected into, and so
 * the one no cycle row exists for yet. Counterpart to [computeDuePeriod], which
 * deliberately skips it.
 */
export function computeCurrentPeriod(cycleDays: number, today: string): { start: string; end: string } | null {
  if (cycleDays < 1) return null;
  const [y, m] = today.split('-').map(Number);
  if (!y || !m) return null;
  return monthCycles(y, m, cycleDays).find((c) => c.start <= today && today <= c.end) ?? null;
}

/** Today in IST — collection days are Indian calendar days, not UTC ones. */
export function istToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}
