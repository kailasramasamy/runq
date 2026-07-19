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

// Human-readable PDF file name — the trailing URL segment WhatsApp/Meta shows as
// the document title (they use the URL basename, not Content-Disposition). Each
// part is reduced to letters/digits joined by '-', parts joined by '_', e.g.
// pdfName('Milk statement', 'S16 Santhosh', '1–15 Jul 2026')
//   → "Milk-statement_S16-Santhosh_1-15-Jul-2026.pdf".
export function pdfName(...parts: string[]): string {
  const base = parts
    .map((p) => p.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, ''))
    .filter(Boolean)
    .join('_');
  return `${base || 'statement'}.pdf`;
}

// "16–31 Jul 2026" when one month, else "16 Jul 2026 – 03 Aug 2026".
export function cycleLabel(from: string, to: string): string {
  const mf = /^(\d{4})-(\d{2})-(\d{2})$/.exec(from);
  const mt = /^(\d{4})-(\d{2})-(\d{2})$/.exec(to);
  if (!mf || !mt) return `${from} – ${to}`;
  const [, yf, mof, df] = mf;
  const [, yt, mot, dt] = mt;
  if (yf === yt && mof === mot) return `${Number(df)}–${Number(dt)} ${MONTHS[Number(mof) - 1] ?? mof} ${yf}`;
  return `${formatDate(from)} – ${formatDate(to)}`;
}

// Whole-rupee amount, Indian grouping ("117850" → "1,17,850"). '-' when absent.
export function rupees(v: string | number | null): string {
  const n = Number(v ?? '');
  return Number.isFinite(n) ? Math.round(n).toLocaleString('en-IN') : '-';
}

const MODE_LABELS: Record<string, string> = {
  bank_transfer: 'Bank transfer', upi: 'UPI', cash: 'Cash', cheque: 'Cheque', other: 'Other',
};
export function paymentModeLabel(m: string): string {
  return MODE_LABELS[m] ?? m;
}
