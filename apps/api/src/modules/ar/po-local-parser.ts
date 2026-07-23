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

// Same-line whitespace only ([ \t]) so a stray "PURCHASE … ORDER" spread
// across the masthead doesn't gobble up the document and capture
// whatever word lands further down. Requires at least 3 chars after the
// label so we don't latch onto noise like "ID".
const PO_NO_RE =
  /\b(?:po\.?|p\.[ \t]*o\.?|purchase[ \t]+order|order)[ \t]*(?:no\.?|number|#|id)?\.?[ \t]*[:\-]?[ \t]*([A-Z0-9][A-Z0-9\-\/_]{2,49})/i;

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
  customerSku: string | null;
  quantity: number;
  uom: string | null;
  rate: number | null;
  amount: number | null;
  taxRatePct: number | null;
  taxableAmount: number | null;
  taxAmount: number | null;
}

interface ExtractedPo {
  buyerName: string | null;
  buyerGstin: string | null;
  buyerPhone: string | null;
  poNumber: string | null;
  poDate: string | null;
  deliveryDate: string | null;
  pricesIncludeTax: boolean | null;
  items: ExtractedItem[];
  subtotal: number | null;
  taxTotal: number | null;
  totalAmount: number | null;
  confidence: number;
}

// ─── Column synonym map for xlsx header detection ──────────────────────────

const COL_SYNONYMS: Record<string, string[]> = {
  description: ['item', 'itemname', 'productname', 'product', 'description', 'particulars', 'material'],
  customerSku: ['sku', 'article', 'articleno', 'code', 'itemcode', 'productcode', 'materialcode', 'partno', 'partnumber'],
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
  // Need at least one identifier (description or SKU) plus quantity.
  if ((!('description' in cols) && !('customerSku' in cols)) || !('quantity' in cols)) {
    return null;
  }
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
      const desc = cols.description !== undefined ? String(r[cols.description] ?? '').trim() : '';
      const sku = cols.customerSku !== undefined ? String(r[cols.customerSku] ?? '').trim() : '';
      // The user-facing identifier — prefer the descriptive name, fall back to
      // the SKU when only a code column is present.
      const identifier = desc || sku;
      if (!identifier) continue;
      const qty = Number(r[cols.quantity!] ?? 0);
      if (qty <= 0) continue;
      const rate = cols.rate !== undefined && r[cols.rate] != null ? Number(r[cols.rate]) : null;
      const amount = cols.amount !== undefined && r[cols.amount] != null ? Number(r[cols.amount]) : null;
      const uom = cols.uom !== undefined && r[cols.uom] != null ? String(r[cols.uom]).trim() || null : null;
      items.push({
        description: identifier,
        customerSku: sku || null,
        quantity: qty,
        uom,
        rate,
        amount,
        taxRatePct: null,
        taxableAmount: null,
        taxAmount: null,
      });
    }

    if (items.length === 0) continue;

    const subtotal = items.reduce((s, it) => s + (it.amount ?? (it.rate ? it.quantity * it.rate : 0)), 0);

    return {
      ...headerInfo,
      pricesIncludeTax: null,
      items,
      subtotal: subtotal > 0 ? Math.round(subtotal * 100) / 100 : null,
      taxTotal: null,
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

// Standalone UOM token between qty and rate. Word-boundary on both sides so
// it doesn't fire on "500ml" inside "A2 Cow Milk 500ml" (no space → no match).
const UOM_RE =
  /\b(PCS|pcs|Pcs|nos|NOS|Nos|kg|KG|Kg|gms?|GMS?|grams?|L|l|ltr|LTR|Ltr|ml|ML|Ml|packets?|PACKETS?|Packets?|boxes?|BOXES?|Boxes?|dozen|DOZEN|Dozen|units?|UNITS?|Units?|cases?|CASES?|Cases?)\b/g;

/**
 * Pick the UOM token that represents the line's UNIT COLUMN (e.g. "PCS"
 * between qty and rate), not a pack-size suffix in the description (e.g.
 * "ml" in "Cold Pressed Mustard Oil 500 ml"). Pack-size matches are
 * preceded by a number + optional whitespace; the unit column is preceded
 * by something else (typically a SKU or a space-padded gap).
 */
function findColumnUom(line: string): { index: number; length: number; token: string } | null {
  const matches = Array.from(line.matchAll(UOM_RE));
  if (matches.length === 0) return null;
  // Prefer the first match NOT preceded by a number — that's the unit column.
  for (const m of matches) {
    const idx = m.index ?? 0;
    const head = line.slice(0, idx).trimEnd();
    const lastChar = head.slice(-1);
    if (!/\d/.test(lastChar)) {
      return { index: idx, length: m[0].length, token: m[1] ?? m[0] };
    }
  }
  // Every UOM match was a pack-size suffix — fall back to the LAST one
  // (the column UOM, if any, would be closer to the end of the line).
  const last = matches[matches.length - 1]!;
  return { index: last.index ?? 0, length: last[0].length, token: last[1] ?? last[0] };
}

// SKU-like token: an uppercase code with at least one separator (e.g.
// "D-C-01", "FCM-1L", "ITEM-3142", "SKU/123"). Tight enough to skip plain
// words like "PCS" or "GST" but loose enough to catch most real SKU formats.
const SKU_RE = /\b[A-Z][A-Z0-9]*[-/_][A-Z0-9][A-Z0-9\-/_]*\b/;

// Currency-symbol prefix that may sit immediately before a money value. The
// rupee glyph ₹ sometimes renders in PDFs as ¹ (superscript 1) or as plain
// "Rs" / "INR". We don't strip these from the line — extractNumbers already
// ignores leading symbols — but we do strip them from the description.

function detectTextLineItem(line: string): ExtractedItem | null {
  const trimmed = line.trim();
  if (trimmed.length < 4) return null;
  if (/^(?:po|purchase\s*order|invoice|gstn?|bank|total|sub\s*total|grand|page|sign)/i.test(trimmed)) return null;

  const numbers = extractNumbers(trimmed);
  if (numbers.length < 2) return null;

  const total = numbers[numbers.length - 1]!;
  if (total.value <= 0) return null;

  // Preferred path: UOM-anchored parsing. When the PO has a clear unit of
  // measure between qty and rate (most B2B POs do), we can identify each
  // value by position relative to the UOM token instead of guessing via
  // qty × rate ≈ total math. This avoids the embedded-number trap entirely:
  // "100% Cow Milk Curd 400g D-C-01 2 PCS ₹36.66 ₹73.32" → qty is the
  // number IMMEDIATELY BEFORE "PCS", rate is the first number after.
  const uomMatch = findColumnUom(trimmed);
  if (uomMatch) {
    const uomStart = uomMatch.index;
    const uomEnd = uomStart + uomMatch.length;
    const before = numbers.filter((n) => n.index < uomStart);
    const after = numbers.filter((n) => n.index >= uomEnd);
    const qty = before.length > 0 ? before[before.length - 1]! : null;
    const rate = after.length > 0 ? after[0]! : null;
    const amount = after.length > 0 ? after[after.length - 1]! : null;
    if (qty && qty.value > 0 && qty.value < 100000) {
      const headSlice = trimmed.slice(0, qty.index).trim();
      const cleaned = cleanItemHead(headSlice);
      if (cleaned.description.length >= 2 && /[a-zA-Z]/.test(cleaned.description)) {
        return {
          description: cleaned.description,
          customerSku: cleaned.customerSku,
          quantity: qty.value,
          uom: uomMatch.token,
          rate: rate && rate.value > 0 && rate !== amount ? rate.value : null,
          amount: amount && amount.value > 0 ? amount.value : (rate ? rate.value : null),
          taxRatePct: null,
          taxableAmount: null,
          taxAmount: null,
        };
      }
    }
    // UOM matched but nothing qty-shaped before it — fall through to
    // brute-force, this row probably isn't a line item.
  }

  // Fallback path: brute-force (qty, rate) ≈ total math. Used when no UOM
  // token is printed (some POs just have qty / rate columns with no unit).
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
        const headSlice = trimmed.slice(0, qty.index).trim();
        const cleaned = cleanItemHead(headSlice);
        if (cleaned.description.length < 2 || !/[a-zA-Z]/.test(cleaned.description)) continue;
        return {
          description: cleaned.description,
          customerSku: cleaned.customerSku,
          quantity: qty.value,
          uom: null,
          rate: rate.value,
          amount: total.value,
          taxRatePct: null,
          taxableAmount: null,
          taxAmount: null,
        };
      }
    }
  }

  return null;
}

/**
 * Strip the leading line-number ("1 ", "1.", "1)") and any SKU-like code
 * embedded in the head portion of the row, returning the clean human
 * description plus the captured customer SKU (if any).
 */
function cleanItemHead(head: string): { description: string; customerSku: string | null } {
  let s = head.replace(/^\d+[.)\s]+/, '').trim();
  let customerSku: string | null = null;
  const skuMatch = SKU_RE.exec(s);
  if (skuMatch) {
    customerSku = skuMatch[0];
    s = (s.slice(0, skuMatch.index) + s.slice(skuMatch.index + skuMatch[0].length)).replace(/\s+/g, ' ').trim();
  }
  return { description: s, customerSku };
}

// A wide line-total (e.g. "Rs. 20,973.75") can render as two physical lines:
// the row ending in a dangling "Rs." and the amount alone on the next line.
// Left unstitched, the row loses its line total, the unit rate leaks into the
// amount slot, and quantity reconciliation later divides amount/rate ≈ 1 and
// corrupts the real quantity. Merge the wrapped amount back onto its row.
const CURRENCY_TAIL_RE = /(?:Rs\.?|₹|INR)\s*$/i;
const BARE_AMOUNT_RE = /^\s*(?:Rs\.?|₹|INR)?\s*[\d,]+(?:\.\d+)?\s*$/i;

function repairWrappedAmounts(raw: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const cur = raw[i]!;
    const next = raw[i + 1];
    if (next !== undefined && CURRENCY_TAIL_RE.test(cur.trim()) && BARE_AMOUNT_RE.test(next.trim())) {
      out.push(`${cur.trim()} ${next.trim()}`);
      i++; // consume the wrapped amount line
    } else {
      out.push(cur);
    }
  }
  return out;
}

function parseText(text: string): ExtractedPo | null {
  if (!text || text.length < 50) return null;

  const lines = repairWrappedAmounts(text.split(/\r?\n/));

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
    pricesIncludeTax: null,
    items,
    subtotal: subtotal > 0 ? Math.round(subtotal * 100) / 100 : null,
    taxTotal: null,
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
