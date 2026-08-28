import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format number in Indian numbering system
 * 1234567 → "12,34,567"
 */
export function formatIndianNumber(num: number): string {
  const str = Math.abs(num).toFixed(2);
  const [integer, decimal] = str.split('.');
  const lastThree = integer.slice(-3);
  const rest = integer.slice(0, -3);
  const formatted = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  const result = rest ? `${formatted},${lastThree}` : lastThree;
  return `${num < 0 ? '-' : ''}${result}.${decimal}`;
}

/**
 * Format amount as Indian Rupees
 * 1234567 → "₹12,34,567.00"
 */
export function formatINR(amount: number): string {
  return `₹${formatIndianNumber(amount)}`;
}

/** Short-form INR — 1.23 Cr / 4.56 L / 7.89k. Negative-safe. */
export function formatINRShort(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  const n = Math.abs(amount);
  if (n >= 1e7) return `${sign}₹${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `${sign}₹${(n / 1e5).toFixed(2)} L`;
  if (n >= 1e3) return `${sign}₹${(n / 1e3).toFixed(1)}k`;
  return `${sign}₹${n.toFixed(0)}`;
}

/**
 * Format in Indian accounting convention — negatives in parentheses
 * -1234567 → "(₹12,34,567.00)"
 */
export function formatINRAccounting(amount: number): string {
  if (amount < 0) {
    const str = formatIndianNumber(Math.abs(amount));
    return `(₹${str})`;
  }
  return `₹${formatIndianNumber(amount)}`;
}

/**
 * How much of something there is, written the way it is measured.
 *
 * Stock quantities are numeric(18,3), and screens used to each decide how many
 * of those decimals to show — some two, some three, some trimming trailing
 * zeros. The same 7.415 litres read as "7.42" on one and "7.415" on the next,
 * which makes two views of one number look like a discrepancy.
 *
 * The rule is about whether the thing is counted or measured. A finished good
 * is counted: there are 22 pouches, never 22.35, so it reads bare. A raw
 * material is measured: bulk milk arrives at 7.4 litres and the plant floor
 * works to one decimal, so a second is noise.
 *
 * Rounds for display only — the ledger keeps all three decimals, so a column
 * of one-decimal figures may not visibly add up to its own total. That is the
 * accepted cost of showing the precision people actually work in.
 */
const MEASURED_CLASSES = new Set(['raw_material']);

/**
 * Bare units of measure, as opposed to pack sizes. "litre" is a unit you
 * measure in; "1L" is the size of a thing you count. Matched exactly so
 * "500ml" and "1L" stay counted.
 */
const MEASURED_UNITS = new Set(['litre', 'litres', 'ltr', 'l', 'kg', 'kgs', 'kilogram', 'kilograms']);

/** Whether this item is measured rather than counted. */
export function isMeasuredItem(itemClass?: string | null, unit?: string | null): boolean {
  return MEASURED_CLASSES.has(itemClass ?? '')
    || MEASURED_UNITS.has((unit ?? '').trim().toLowerCase());
}

/**
 * A stock quantity as its item wants it read.
 *
 * Takes either signal, because neither is available everywhere. `itemClass` is
 * authoritative where a payload carries it; most do not, so `unit` stands in —
 * and for stock that is genuinely measured the two agree.
 */
export function formatItemQty(
  qty: number | string | null | undefined,
  itemClass?: string | null,
  unit?: string | null,
): string {
  const v = typeof qty === 'string' ? Number(qty) : qty;
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return isMeasuredItem(itemClass, unit) ? formatMeasuredQty(v) : formatCountedQty(v);
}

/**
 * One decimal, trailing zero dropped: 7.415 → "7.4", 90.5 → "90.5".
 *
 * A remainder too small to show reads "<0.1" rather than "0". Every other
 * rounding here is off by a tenth; "0" instead says the shelf is empty when it
 * isn't, which is a different sentence.
 */
export function formatMeasuredQty(qty: number): string {
  if (qty !== 0 && Math.abs(qty) < 0.05) return qty < 0 ? '>-0.1' : '<0.1';
  return trimQty(qty, 1);
}

/** Bare when whole, two decimals when not: 22 → "22", 22.5 → "22.5". */
export function formatCountedQty(qty: number): string {
  return trimQty(qty, 2);
}

function trimQty(v: number, places: number): string {
  const s = v.toFixed(places);
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}
