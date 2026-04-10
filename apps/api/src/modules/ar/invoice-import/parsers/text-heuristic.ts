import type { ParsedInvoice } from '@runq/types';
import {
  defaultDueDate,
  emptyMatch,
  isPdf,
  makeLineItem,
  type InvoiceParser,
  type ParserInput,
} from './shared';

/**
 * Text-heuristic parser. Operates on plain text extracted from a PDF
 * (via pdf-parse) or an image (via tesseract.js OCR). Slots into the
 * cascade *after* the spreadsheet parsers and *before* the AI fallback —
 * the goal is to handle the common case (text-based PDFs from Tally,
 * Zoho, runq's own templates, clean image scans) without burning AI
 * tokens.
 *
 * Strategy:
 *   1. Header fields via labelled regex scans (invoice number, date,
 *      PO number, buyer GSTIN, buyer name).
 *   2. Buyer name lifted from the line(s) following "Bill(ed) To:" /
 *      "Buyer:" / "Party:" markers.
 *   3. Line items detected line-by-line. A line is a line item if it
 *      has ≥3 numeric tokens AND its (qty × unitPrice) approximates
 *      either the last number (no-tax case) or the third-from-last
 *      number (taxable case where the last number is the post-tax
 *      total).
 *   4. Grand total detected via "Grand Total" / "Net Amount" / "Total"
 *      keywords, falling back to summing line totals.
 *
 * Returns null when the absolute essentials (invoice number, ≥1 line
 * item) cannot be found — the cascade then falls through to AI.
 *
 * The heuristics are intentionally conservative: false positives (wrong
 * extracted values) are worse than false negatives (cascade falls
 * through to AI), because the user reviews the staging UI before
 * commit but won't catch a subtly-wrong qty.
 */

const GSTIN_RE = /\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/;

const INVOICE_NO_RE =
  /(?:tax\s+invoice\s+(?:no|#|number)|invoice\s*(?:no|#|number)|bill\s*(?:no|#|number)|voucher\s*(?:no|#|number))\.?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-\/_]{0,49})/i;

const DATE_RE =
  /(?:invoice\s+date|bill\s+date|date)\s*[:\-]?\s*([\d]{1,2}[\-\/\s.][\w]+[\-\/\s.][\d]{2,4}|[\d]{4}[\-\/][\d]{1,2}[\-\/][\d]{1,2})/i;

const PO_NO_RE =
  /(?:po|p\.\s*o\.?|purchase\s*order)\s*(?:no|#|number)?\.?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-\/_]{0,49})/i;

/**
 * Lines that act as grand-total markers. We then take the *last* number
 * on the matching line — many invoice templates put "Grand Total" then
 * a qty subtotal, then tax subtotals, then the actual total. Picking
 * the first number after the marker would give the qty.
 */
const GRAND_TOTAL_LINE_RE =
  /^\s*(?:grand\s*total|invoice\s*total|net\s*(?:amount|payable)|amount\s*payable|total\s*amount|total)\b/i;

/**
 * Months in various formats — used to coerce dates extracted by the
 * regex into yyyy-mm-dd. Index 1..12.
 */
const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Coerce a free-text date into yyyy-mm-dd. Returns null on failure. */
function coerceDate(raw: string): string | null {
  const s = raw.trim().replace(/\s+/g, ' ');

  // ISO yyyy-mm-dd or yyyy/mm/dd
  let m = s.match(/^(\d{4})[\-\/](\d{1,2})[\-\/](\d{1,2})$/);
  if (m) return `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`;

  // dd-mm-yyyy or dd/mm/yyyy or dd.mm.yyyy
  m = s.match(/^(\d{1,2})[\-\/.](\d{1,2})[\-\/.](\d{2,4})$/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    let year = Number(m[3]);
    if (year < 100) year += year < 50 ? 2000 : 1900;
    return `${year}-${pad(month)}-${pad(day)}`;
  }

  // dd-Mon-yyyy or dd Month yyyy
  m = s.match(/^(\d{1,2})[\-\/\s]+([A-Za-z]+)[\-\/\s]+(\d{2,4})$/);
  if (m) {
    const day = Number(m[1]);
    const month = MONTHS[m[2]!.toLowerCase()];
    let year = Number(m[3]);
    if (!month) return null;
    if (year < 100) year += year < 50 ? 2000 : 1900;
    return `${year}-${pad(month)}-${pad(day)}`;
  }

  // Month dd, yyyy
  m = s.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m) {
    const month = MONTHS[m[1]!.toLowerCase()];
    if (!month) return null;
    return `${m[3]}-${pad(month)}-${pad(Number(m[2]))}`;
  }

  // Last-resort: let JS parse it.
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

/**
 * Extract every numeric token from a line. Returns the value and its
 * starting character index so the line-item detector can slice the
 * item name from the position of the chosen quantity number.
 */
interface ExtractedNumber {
  value: number;
  index: number;
}
function extractNumbers(line: string): ExtractedNumber[] {
  // Greedy: match one or more digits, optional Indian/US thousand
  // separators, optional decimal portion. The greedy `\d+` (rather than
  // `\d{1,3}`) is critical — without it "2859.15" parses as two numbers
  // ("285" and "9.15") because the digit run is capped at 3.
  const re = /[-+]?\d+(?:,\d{3})*(?:\.\d+)?/g;
  const out: ExtractedNumber[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const cleaned = m[0].replace(/,/g, '');
    const n = Number(cleaned);
    if (Number.isFinite(n)) out.push({ value: n, index: m.index });
  }
  return out;
}

function numberValues(line: string): number[] {
  return extractNumbers(line).map((n) => n.value);
}

/**
 * Pulls a likely buyer name from text following a "Bill To" / "Buyer"
 * marker. Takes up to 4 lines after the marker, stops at the first
 * blank line, header keyword, or GSTIN. Trims and returns the joined
 * lines.
 */
function extractBuyerName(text: string): { name: string; gstin: string | null } {
  const lines = text.split(/\r?\n/);
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/(?:bill(?:ed)?\s*to|buyer|party|consignee)\s*:?/i.test(lines[i]!)) {
      startIdx = i + 1;
      break;
    }
  }
  if (startIdx === -1) return { name: '', gstin: null };

  const buyerLines: string[] = [];
  let gstin: string | null = null;
  for (let i = startIdx; i < Math.min(startIdx + 5, lines.length); i++) {
    const ln = lines[i]!.trim();
    if (!ln) break;
    if (/(?:items?|products?|particulars?|description|qty|rate|hsn)/i.test(ln) && extractNumbers(ln).length === 0) {
      break;
    }
    const gstMatch = ln.match(GSTIN_RE);
    if (gstMatch) {
      gstin = gstMatch[0];
      // Don't include the GSTIN line itself in the name capture.
      continue;
    }
    buyerLines.push(ln);
    // First non-empty line is usually the company name. After 1 line we
    // have a name; after 2 we have name + first address line. Stop at 1
    // for cleaner matches against the master.
    if (buyerLines.length >= 1) break;
  }

  // If GSTIN wasn't right after the marker, scan the rest of the document
  // for it as a fallback. This catches templates that put GSTIN below the
  // address block.
  if (!gstin) {
    const allMatch = text.match(GSTIN_RE);
    if (allMatch) gstin = allMatch[0];
  }

  return { name: buyerLines.join(' ').trim(), gstin };
}

/**
 * Detect line items in a block of text. Walks each line and applies
 * the "name + ≥3 numbers + qty × unitPrice ≈ total" check.
 */
interface DetectedLine {
  sourceName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

function isLikelyLineItem(line: string): DetectedLine | null {
  const trimmed = line.trim();
  if (trimmed.length < 4) return null;

  // Skip obvious non-line-items.
  if (/^(?:tax\s*invoice|invoice|bill|gstn?|bank|ifsc|account|terms|grand\s*total|sub\s*total|amount|signature|page)\b/i.test(trimmed)) {
    return null;
  }

  const numbers = extractNumbers(trimmed);
  if (numbers.length < 3) return null;

  // Total is always the rightmost number on the line — this is universally
  // true across invoice templates. The line "Curd 400g 3 04031000 35 105
  // 2.63 2.63 110.25" has 110.25 as the total.
  const totalNum = numbers[numbers.length - 1]!;
  if (totalNum.value <= 0) return null;
  const total = totalNum.value;

  // Brute-force the (qty, unitPrice) pair: find any pair where qty appears
  // before unitPrice in the line and qty × unitPrice ≈ total (allowing
  // up to ~6% deviation for taxable lines where the total includes ~5%
  // GST). This robustly handles the common gotcha where the item name
  // has a numeric size suffix (e.g. "Curd 400g") that would otherwise
  // be misread as the qty.
  let best: { qty: ExtractedNumber; unitPrice: ExtractedNumber; lineTotal: number; score: number } | null = null;
  for (let i = 0; i < numbers.length - 2; i++) {
    const qty = numbers[i]!;
    // Reject HSN-like 8-digit integers and other unreasonable qty values.
    if (qty.value <= 0 || qty.value > 100000) continue;
    if (Number.isInteger(qty.value) && qty.value >= 10000) continue;
    for (let j = i + 1; j < numbers.length - 1; j++) {
      const unitPrice = numbers[j]!;
      if (unitPrice.value <= 0 || unitPrice.value > 1_000_000) continue;
      const expected = qty.value * unitPrice.value;
      if (expected === 0) continue;
      // Pre-tax match (basic price line) and post-tax match (total
      // includes 5% GST). Take whichever has the smaller error.
      const errPre = Math.abs(expected - total) / expected;
      const errGst = Math.abs(expected * 1.05 - total) / (expected * 1.05);
      const err = Math.min(errPre, errGst);
      if (err < 0.06) {
        const score = 1 - err;
        if (!best || score > best.score) {
          best = { qty, unitPrice, lineTotal: total, score };
        }
      }
    }
  }

  if (!best) return null;

  // Name = text before the qty's character position. Strip a leading
  // line number ("1.", "1)") if present.
  let name = trimmed.slice(0, best.qty.index).trim();
  name = name.replace(/^\d+[.)\s]+/, '').trim();
  if (name.length < 2) return null;
  if (!/[a-zA-Z]/.test(name)) return null;
  if (/^(?:total|sub\s*total|grand\s*total)/i.test(name)) return null;

  return {
    sourceName: name,
    quantity: best.qty.value,
    unitPrice: best.unitPrice.value,
    lineTotal: best.lineTotal,
  };
}

class TextHeuristicParser implements InvoiceParser {
  readonly name = 'heuristic' as const;

  parse(input: ParserInput): ParsedInvoice[] | null {
    // This parser only operates on pre-extracted text. The cascade
    // populates extractedText for PDFs (via pdf-parse) and images
    // (via tesseract OCR) before invoking this parser.
    const text = input.extractedText;
    if (!text || text.length < 80) return null;

    // Header fields via labelled regex scans.
    const invoiceNoMatch = text.match(INVOICE_NO_RE);
    const invoiceNumber = invoiceNoMatch ? invoiceNoMatch[1]!.trim() : '';
    if (!invoiceNumber) return null;

    const dateMatch = text.match(DATE_RE);
    const invoiceDate = dateMatch ? coerceDate(dateMatch[1]!) : null;
    if (!invoiceDate) return null;

    const poMatch = text.match(PO_NO_RE);
    const poNumber = poMatch ? poMatch[1]!.trim() : null;

    const { name: customerSourceName, gstin: customerSourceGstin } = extractBuyerName(text);

    // Line items: walk every line, keep the ones that look like items.
    const lines = text.split(/\r?\n/);
    const detected: DetectedLine[] = [];
    let inItemsSection = false;
    for (const ln of lines) {
      // Trip the "in items section" flag when we see a header row.
      if (!inItemsSection) {
        const lower = ln.toLowerCase();
        const headerHits = ['products', 'description', 'particulars', 'item', 'qty', 'quantity', 'rate', 'price', 'amount']
          .filter((kw) => lower.includes(kw)).length;
        if (headerHits >= 2 && extractNumbers(ln).length === 0) {
          inItemsSection = true;
          continue;
        }
      }
      if (!inItemsSection) continue;

      // Stop at the totals block.
      if (/^\s*(?:grand\s*total|sub\s*total|total\s+\u20B9|net\s*(?:amount|payable))/i.test(ln)) {
        break;
      }

      const item = isLikelyLineItem(ln);
      if (item) detected.push(item);
    }

    if (detected.length === 0) return null;

    const lineItems = detected.map((d) =>
      makeLineItem({
        sourceName: d.sourceName,
        quantity: d.quantity,
        unitPrice: d.unitPrice,
      }),
    );

    const computedSubtotal =
      Math.round(lineItems.reduce((acc, li) => acc + li.lineTotal, 0) * 100) / 100;

    // Grand total: find the line containing the marker keyword, take its
    // last number (templates often put qty subtotal + tax subtotals
    // before the actual total on the same line).
    let sourceGrandTotal = computedSubtotal;
    for (const ln of lines) {
      if (GRAND_TOTAL_LINE_RE.test(ln)) {
        const nums = numberValues(ln);
        if (nums.length > 0) {
          sourceGrandTotal = nums[nums.length - 1]!;
          break;
        }
      }
    }

    const warnings: string[] = [];
    if (sourceGrandTotal > 0 && Math.abs(sourceGrandTotal - computedSubtotal) > computedSubtotal * 0.15) {
      warnings.push(
        `Source total \u20B9${sourceGrandTotal.toFixed(2)} differs noticeably from computed subtotal \u20B9${computedSubtotal.toFixed(
          2,
        )} — extracted line items may be incomplete.`,
      );
    }
    warnings.push(
      isPdf(input)
        ? 'Extracted via local PDF text parser — please verify line items before importing.'
        : 'Extracted via local OCR — please verify line items before importing.',
    );

    return [
      {
        sourceFile: input.fileName,
        parserUsed: 'heuristic',
        invoiceNumber,
        invoiceDate,
        dueDate: defaultDueDate(invoiceDate),
        poNumber,
        notes: null,
        customerSourceName,
        customerSourceGstin,
        customerMatch: emptyMatch(),
        lineItems,
        sourceGrandTotal,
        computedSubtotal,
        parseable: lineItems.length > 0 && customerSourceName.length > 0,
        warnings,
      },
    ];
  }
}

export const textHeuristicParser = new TextHeuristicParser();
