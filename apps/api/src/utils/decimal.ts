/**
 * Safe decimal arithmetic for money values.
 * Operates on string representations to avoid floating-point errors.
 * All values stored as DECIMAL(15,2) in PostgreSQL.
 */

/** Convert decimal string to integer cents/paise (multiply by 100) */
function toPaise(value: string | number): number {
  const str = typeof value === 'number' ? value.toFixed(2) : value;
  const [whole, frac = '0'] = str.split('.');
  return parseInt(whole, 10) * 100 + parseInt(frac.padEnd(2, '0').slice(0, 2), 10);
}

/** Convert paise back to decimal string */
function fromPaise(paise: number): string {
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(paise);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  return `${sign}${whole}.${frac.toString().padStart(2, '0')}`;
}

export function decimalAdd(a: string | number, b: string | number): string {
  return fromPaise(toPaise(a) + toPaise(b));
}

export function decimalSubtract(a: string | number, b: string | number): string {
  return fromPaise(toPaise(a) - toPaise(b));
}

export function decimalMin(a: string | number, b: string | number): string {
  return fromPaise(Math.min(toPaise(a), toPaise(b)));
}

export function decimalEquals(a: string | number, b: string | number): boolean {
  return toPaise(a) === toPaise(b);
}

export function decimalGt(a: string | number, b: string | number): boolean {
  return toPaise(a) > toPaise(b);
}

export function decimalLte(a: string | number, b: string | number): boolean {
  return toPaise(a) <= toPaise(b);
}

export function decimalIsZero(a: string | number): boolean {
  return toPaise(a) === 0;
}

/** Parse a decimal string to number (for API responses only, NOT for arithmetic) */
export function toNumber(value: string): number {
  return toPaise(value) / 100;
}

/** Sum an array of decimal strings */
export function decimalSum(values: (string | number)[]): string {
  const total = values.reduce((sum: number, v) => sum + toPaise(v), 0);
  return fromPaise(total);
}
