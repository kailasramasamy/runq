const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const next = (y: number, m: number) => (m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 });

/**
 * When a payroll month's salaries are due: the tenant's pay day in the
 * following month (clamped to that month's length), or — with no pay day set —
 * the last day of the payroll month itself.
 */
export function salaryDueDate(year: number, month: number, payDay?: number | null): string {
  if (!payDay) return iso(year, month, lastDay(year, month));
  const n = next(year, month);
  return iso(n.y, n.m, Math.min(payDay, lastDay(n.y, n.m)));
}

/** PF and ESI contributions are due by the 15th of the following month. */
export function pfEsiDueDate(year: number, month: number): string {
  const n = next(year, month);
  return iso(n.y, n.m, 15);
}

/** TDS is deposited by the 7th of the next month — March's by 30 April. */
export function tdsDueDate(year: number, month: number): string {
  if (month === 3) return iso(year, 4, 30);
  const n = next(year, month);
  return iso(n.y, n.m, 7);
}

/** Today's date in IST as YYYY-MM-DD. */
export function todayIst(): string {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

/** YYYY-MM-DD plus [days]. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
