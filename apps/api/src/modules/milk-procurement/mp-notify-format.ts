// Shared formatting for Interakt WhatsApp notifications (pour receipt, manual
// receipt). All helpers coerce missing/invalid values to '-' so template body
// params are never empty (Interakt/Meta reject blank values).

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type Shift = 'am' | 'pm' | null | undefined;

// "2026-07-03" → "03 Jul 2026"
export function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d] = m;
  return `${d} ${MONTHS[Number(mo) - 1] ?? mo} ${y}`;
}

export function shiftLabel(shift: Shift): string {
  return shift === 'am' ? 'Morning' : shift === 'pm' ? 'Evening' : '';
}

// "03 Jul 2026, Morning" — or just the date when there's no shift (BMC nodes).
export function dateShift(iso: string, shift: Shift): string {
  const s = shiftLabel(shift);
  return s ? `${formatDate(iso)}, ${s}` : formatDate(iso);
}

// decimal string → trimmed number ("12.500" → "12.5", "10.00" → "10")
export function trimNum(v: string | null): string {
  const n = Number(v ?? '');
  return v != null && Number.isFinite(n) ? String(n) : '-';
}

export function money(v: string | null): string {
  const n = Number(v ?? '');
  return Number.isFinite(n) ? `₹${n.toFixed(2)}` : '-';
}

// "4.2 / 8.6 / 0%" (water as a percentage; each part '-' when absent)
export function quality(fat: string | null, snf: string | null, water: string | null): string {
  const w = water != null ? `${trimNum(water)}%` : '-';
  return `${trimNum(fat)} / ${trimNum(snf)} / ${w}`;
}

// Guard: template params must be non-empty.
export function nz(v: string): string {
  return v.trim().length ? v : '-';
}
