/**
 * Local PO parser — extracts purchase order data from xlsx, PDF text,
 * or plain text WITHOUT calling Claude AI.
 *
 * Used as a first-pass attempt by the PO parser service. Only falls
 * through to AI when this returns null (unrecognised layout, scanned
 * PDFs with no text layer, etc.).
 *
 * For xlsx files (the most common PO format from marketplaces like
 * BigBasket, Swiggy, Zepto):
 *   - SheetJS reads the workbook
 *   - Heuristic header-row detection finds the item table
 *   - Buyer info extracted from cells above the table (GSTIN, phone,
 *     company name, PO number, dates)
 *
 * For PDF / plain text:
 *   - Regex-based header field extraction (PO number, date, GSTIN, etc.)
 *   - Line item detection via the same "name + numbers" brute-force
 *     approach used by the AR invoice text-heuristic parser
 */

import * as XLSX from 'xlsx';
import { extractPdfText } from './invoice-import/extractors/pdf-text';

const GSTIN_RE = /\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/g;
const PHONE_RE = /(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/;

const PO_NO_RE =
  /(?:po|p\.?\s*o\.?|purchase\s*order|order)\s*(?:no|number|#|id)?\.?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-\/_]{0,49})/i;

const PO_DATE_RE =
  /(?:po\s*date|order\s*date|date)\s*[:\-]?\s*([\d]{1,2}[\-\/\s.][\w]+[\-\/\s.][\d]{2,4}|[\d]{4}[\-\/][\d]{1,2}[\-\/][\d]{1,2})/i;

const DELIVERY_DATE_RE =
  /(?:delivery\s*date|expected\s*(?:date|by)|ship\s*date|required\s*(?:by|date))\s*[:\-]?\s*([\d]{1,2}[\-\/\s.][\w]+[\-\/\s.][\d]{2,4}|[\d]{4}[\-\/][\d]{1,2}[\-\/][\d]{1,2})/i;

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

function pad(n: number): string { return n < 10 ? `0${n}` : String(n); }

function coerceDate(raw: string): string | null {
  const s = raw.trim().replace(/\s+/g, ' ');
  let m = s.match(/^(\d{4})[\-\/](\d{1,2})[\-\/](\d{1,2})$/);
  if (m) return `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`;
  m = s.match(/^(\d{1,2})[\-\/.](\d{1,2})[\-\/.](\d{2,4})$/);
  if (m) {
    let yr = Number(m[3]); if (yr < 100) yr += yr < 50 ? 2000 : 1900;
    return `${yr}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
  }
  m = s.match(/^(\d{1,2})[\-\/\s]+([A-Za-z]+)[\-\/\s]+(\d{2,4})$/);
  if (m) {
    const mo = MONTHS[m[2]!.toLowerCase()]; if (!mo) return null;
    let yr = Number(m[3]); if (yr < 100) yr += yr < 50 ? 2000 : 1900;
    return `${yr}-${pad(mo)}-${pad(Number(m[1]))}`;
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

interface ExtractedItem {
  description: string;
  quantity: number;
  uom: string | null;
  rate: number | null;
  amount: number | null;
}

interface ExtractedPo {
  buyerName: string | null;
  buyerGstin: string | null;
  buyerPhone: string | null;
  poNumber: string | null;
  poDate: string | null;
  deliveryDate: string | null;
  items: ExtractedItem[];
  subtotal: number | null;
  totalAmount: number | null;
  confidence: number;
}

// ─── Column synonym map for xlsx header detection ──────────────────────────

const COL_SYNONYMS: Record<string, string[]> = {
  description: ['item', 'itemname', 'productname', 'product', 'description', 'particulars', 'material', 'sku', 'article'],
  quantity: ['quantity', 'qty', 'orderqty', 'orderedqty', 'units', 'nos', 'pcs'],
  rate: ['rate', 'unitprice', 'price', 'mrp', 'unitrate', 'up', 'sellingprice'],
  amount: ['amount', 'total', 'value', 'lineamount', 'linetotal', 'netamount'],
  uom: ['uom', 'unit', 'unitofmeasure', 'measure'],
  hsn: ['hsn', 'hsncode', 'hsnsac', 'sac'],
};

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function detectColumns(headers: string[]): Record<string, number> | null {
  const normed = headers.map(normalize);
  const cols: Record<string, number> = {};
  for (const [field, synonyms] of Object.entries(COL_SYNONYMS)) {
    const idx = normed.findIndex((h) => synonyms.includes(h));
    if (idx !== -1) cols[field] = idx;
  }
  // Need at least description + quantity
  if (!('description' in cols) || !('quantity' in cols)) return null;
  return cols;
}

function findHeaderRow(rows: unknown[][]): { rowIdx: number; cols: Record<string, number> } | null {
  const limit = Math.min(rows.length, 25);
  let best: { rowIdx: number; score: number; cols: Record<string, number> } | null = null;
  for (let i = 0; i < limit; i++) {
    const r = rows[i];
    if (!r || r.length < 2) continue;
    const headers = r.map((c) => (c == null ? '' : String(c)));
    const cols = detectColumns(headers);
    if (!cols) continue;
    const score = Object.keys(cols).length;
    if (score >= 2 && (!best || score > best.score)) {
      best = { rowIdx: i, score, cols };
    }
  }
  return best;
}

/**
 * Extract buyer info from cells ABOVE the header row in an xlsx.
 * Scans for GSTIN, phone, PO number, dates, and company name in the
 * first N rows.
 */
function extractHeaderInfo(rows: unknown[][], headerRowIdx: number): {
  buyerName: string | null;
  buyerGstin: string | null;
  buyerPhone: string | null;
  poNumber: string | null;
  poDate: string | null;
  deliveryDate: string | null;
} {
  // Flatten all cells above the header into a single text block for regex
  const textLines: string[] = [];
  for (let i = 0; i < headerRowIdx; i++) {
    const r = rows[i];
    if (!r) continue;
    const line = r.map((c) => (c == null ? '' : String(c))).join('  ');
    if (line.trim()) textLines.push(line.trim());
  }
  const text = textLines.join('\n');

  const gstinMatch = text.match(GSTIN_RE);
  const phoneMatch = text.match(PHONE_RE);
  const poNoMatch = text.match(PO_NO_RE);
  const poDateMatch = text.match(PO_DATE_RE);
  const deliveryMatch = text.match(DELIVERY_DATE_RE);

  // Buyer name: first line with alphabetic content that isn't a keyword
  let buyerName: string | null = null;
  for (const ln of textLines) {
    const trimmed = ln.trim();
    if (/^(?:tax\s*invoice|invoice|purchase\s*order|po\b|date|gstn?|phone|email|address)/i.test(trimmed)) continue;
    if (trimmed.length < 3 || !/[a-zA-Z]{2,}/.test(trimmed)) continue;
    buyerName = trimmed.slice(0, 200);
    break;
  }

  return {
    buyerName,
    buyerGstin: gstinMatch ? gstinMatch[0] : null,
    buyerPhone: phoneMatch ? phoneMatch[0] : null,
    poNumber: poNoMatch ? poNoMatch[1]!.trim() : null,
    poDate: poDateMatch ? coerceDate(poDateMatch[1]!) : null,
    deliveryDate: deliveryMatch ? coerceDate(deliveryMatch[1]!) : null,
  };
}

// ─── xlsx parser ───────────────────────────────────────────────────────────

function parseXlsx(buffer: Buffer): ExtractedPo | null {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  } catch {
    return null;
  }

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });
    if (rows.length < 2) continue;

    const header = findHeaderRow(rows);
    if (!header) continue;

    const { rowIdx, cols } = header;
    const headerInfo = extractHeaderInfo(rows, rowIdx);

    const items: ExtractedItem[] = [];
    for (let i = rowIdx + 1; i < rows.length; i++) {
      const r = rows[i] ?? [];
      const desc = String(r[cols.description!] ?? '').trim();
      if (!desc) continue;
      const qty = Number(r[cols.quantity!] ?? 0);
      if (qty <= 0) continue;
      const rate = cols.rate !== undefined && r[cols.rate] != null ? Number(r[cols.rate]) : null;
      const amount = cols.amount !== undefined && r[cols.amount] != null ? Number(r[cols.amount]) : null;
      const uom = cols.uom !== undefined && r[cols.uom] != null ? String(r[cols.uom]).trim() || null : null;
      items.push({ description: desc, quantity: qty, uom, rate, amount });
    }

    if (items.length === 0) continue;

    const subtotal = items.reduce((s, it) => s + (it.amount ?? (it.rate ? it.quantity * it.rate : 0)), 0);

    return {
      ...headerInfo,
      items,
      subtotal: subtotal > 0 ? Math.round(subtotal * 100) / 100 : null,
      totalAmount: subtotal > 0 ? Math.round(subtotal * 100) / 100 : null,
      confidence: 0.75,
    };
  }

  return null;
}

// ─── Text parser (for PDF text or plain text POs) ──────────────────────────

function extractNumbers(line: string): { value: number; index: number }[] {
  const re = /[-+]?\d+(?:,\d{3})*(?:\.\d+)?/g;
  const out: { value: number; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const n = Number(m[0].replace(/,/g, ''));
    if (Number.isFinite(n)) out.push({ value: n, index: m.index });
  }
  return out;
}

function numberValues(line: string): number[] {
  return extractNumbers(line).map((n) => n.value);
}

function detectTextLineItem(line: string): ExtractedItem | null {
  const trimmed = line.trim();
  if (trimmed.length < 4) return null;
  if (/^(?:po|purchase\s*order|invoice|gstn?|bank|total|sub\s*total|grand|page|sign)/i.test(trimmed)) return null;

  const numbers = extractNumbers(trimmed);
  if (numbers.length < 2) return null;

  // Simple: first number after the name is qty, last is amount or rate
  const total = numbers[numbers.length - 1]!;
  if (total.value <= 0) return null;

  // Try brute-force (qty, rate) matching
  for (let i = 0; i < numbers.length - 1; i++) {
    const qty = numbers[i]!;
    if (qty.value <= 0 || qty.value > 100000) continue;
    if (Number.isInteger(qty.value) && qty.value >= 10000) continue;
    for (let j = i + 1; j < numbers.length; j++) {
      const rate = numbers[j]!;
      if (rate.value <= 0) continue;
      const expected = qty.value * rate.value;
      if (expected === 0) continue;
      const err = Math.abs(expected - total.value) / expected;
      if (err < 0.06) {
        let name = trimmed.slice(0, qty.index).trim().replace(/^\d+[.)\s]+/, '').trim();
        if (name.length < 2 || !/[a-zA-Z]/.test(name)) continue;
        return {
          description: name,
          quantity: qty.value,
          uom: null,
          rate: rate.value,
          amount: total.value,
        };
      }
    }
  }

  // Fallback: just qty + name (no rate verification)
  if (numbers.length >= 1) {
    const qty = numbers[0]!;
    if (qty.value > 0 && qty.value < 100000) {
      let name = trimmed.slice(0, qty.index).trim().replace(/^\d+[.)\s]+/, '').trim();
      if (name.length >= 2 && /[a-zA-Z]/.test(name)) {
        const rate = numbers.length >= 2 ? numbers[1]!.value : null;
        return {
          description: name,
          quantity: qty.value,
          uom: null,
          rate: rate && rate > 0 ? rate : null,
          amount: numbers[numbers.length - 1]!.value,
        };
      }
    }
  }

  return null;
}

function parseText(text: string): ExtractedPo | null {
  if (!text || text.length < 50) return null;

  const lines = text.split(/\r?\n/);

  // Header fields
  const gstinMatch = text.match(GSTIN_RE);
  const phoneMatch = text.match(PHONE_RE);
  const poNoMatch = text.match(PO_NO_RE);
  const poDateMatch = text.match(PO_DATE_RE);
  const deliveryMatch = text.match(DELIVERY_DATE_RE);

  // Buyer name
  let buyerName: string | null = null;
  for (const ln of lines) {
    const t = ln.trim();
    if (/^(?:purchase\s*order|po\b|tax|invoice|date|gstn?|phone|from|to)/i.test(t)) continue;
    if (t.length < 3 || !/[a-zA-Z]{2,}/.test(t)) continue;
    buyerName = t.slice(0, 200);
    break;
  }

  // Line items
  const items: ExtractedItem[] = [];
  let inItemsSection = false;
  for (const ln of lines) {
    if (!inItemsSection) {
      const lower = ln.toLowerCase();
      const hits = ['product', 'description', 'item', 'qty', 'quantity', 'rate', 'price', 'amount']
        .filter((kw) => lower.includes(kw)).length;
      if (hits >= 2 && numberValues(ln).length === 0) { inItemsSection = true; continue; }
    }
    if (!inItemsSection) continue;
    if (/^\s*(?:grand\s*total|sub\s*total|total\b|net\s*amount)/i.test(ln)) break;
    const item = detectTextLineItem(ln);
    if (item) items.push(item);
  }

  if (items.length === 0) return null;

  const subtotal = items.reduce((s, it) => s + (it.amount ?? 0), 0);

  return {
    buyerName,
    buyerGstin: gstinMatch ? gstinMatch[0] : null,
    buyerPhone: phoneMatch ? phoneMatch[0] : null,
    poNumber: poNoMatch ? poNoMatch[1]!.trim() : null,
    poDate: poDateMatch ? coerceDate(poDateMatch[1]!) : null,
    deliveryDate: deliveryMatch ? coerceDate(deliveryMatch[1]!) : null,
    items,
    subtotal: subtotal > 0 ? Math.round(subtotal * 100) / 100 : null,
    totalAmount: subtotal > 0 ? Math.round(subtotal * 100) / 100 : null,
    confidence: 0.65,
  };
}

// ─── Public API ────────────────────────────────────────────────────────────

const XLSX_MIMES = new Set([
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

/**
 * Try to parse a PO locally without AI. Returns null when the format
 * can't be recognised or the extracted data is too sparse to be useful.
 *
 * Supports:
 *   - xlsx/xls files (SheetJS column detection)
 *   - PDF files (pdf-parse text extraction → regex parsing)
 *   - Plain text / CSV (regex parsing directly)
 *   - Images → returns null (needs AI Vision or OCR — handled upstream)
 */
export async function tryLocalPoParse(
  buffer: Buffer,
  mime: string,
): Promise<ExtractedPo | null> {
  const lower = mime.toLowerCase();

  // xlsx / xls → SheetJS
  if (XLSX_MIMES.has(lower)) {
    return parseXlsx(buffer);
  }

  // PDF → extract text first, then parse as text
  if (lower === 'application/pdf') {
    const pdf = await extractPdfText(buffer);
    if (pdf.hasUsableText) {
      return parseText(pdf.text);
    }
    return null; // scanned PDF — needs AI
  }

  // Plain text / CSV
  if (lower === 'text/plain' || lower === 'text/csv') {
    return parseText(buffer.toString('utf8'));
  }

  return null; // images etc → needs AI
}
