/**
 * Local text-based extraction for AP vendor invoices / bills.
 *
 * Takes plain text (from pdf-parse or tesseract OCR) and returns the
 * same ExtractedInvoice shape the AI prompt returns, so the caller
 * can use it as a drop-in replacement for the Claude path. Returns
 * null when the text doesn't look like a parseable invoice.
 *
 * The extraction logic mirrors the AR text-heuristic parser but is
 * tailored for AP:
 *   - The VENDOR (seller) name comes from the top of the document
 *     (before any "Billed to" section), not the buyer section.
 *   - TDS section is detected via regex (194C, 194J, etc.).
 *   - Confidence is set lower (0.65) than AI (0.7–0.95) so the UI
 *     clearly flags local extractions for human review.
 */

const GSTIN_RE = /\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/g;

const INVOICE_NO_RE =
  /(?:tax\s+invoice\s+(?:no|#|number)|invoice\s*(?:no|#|number)|bill\s*(?:no|#|number)|voucher\s*(?:no|#|number))\.?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-\/_]{0,49})/i;

const DATE_RE =
  /(?:invoice\s+date|bill\s+date|date)\s*[:\-]?\s*([\d]{1,2}[\-\/\s.][\w]+[\-\/\s.][\d]{2,4}|[\d]{4}[\-\/][\d]{1,2}[\-\/][\d]{1,2})/i;

const TDS_RE = /\b(194[A-Z]|194[A-Z]{2}|195|196[A-Z]?)\b/;

const GRAND_TOTAL_LINE_RE =
  /^\s*(?:grand\s*total|invoice\s*total|net\s*(?:amount|payable)|amount\s*payable|total\s*amount|total)\b/i;

// GST tax-invoice column layout: bills that print Taxable Value + CGST/SGST/IGST
// as separate columns per item (not embedded tax rows).
const GST_COLUMN_HEADER_RE = /taxable\s*value/i;
const GST_COLUMN_TAX_RE = /\b(?:cgst|sgst|igst)\b/i;

// Each item row in a GST column layout looks like:
//   <sl> <desc...> <hsn 4-8> <qty> [<uom>] <rate> <taxable> (<pct>% <amount>){1,3}
// Trailing % pairs cover CGST+SGST (intra-state) or IGST (inter-state).
const GST_ROW_RE =
  /^(\d+)\s+(.+?)\s+(\d{4,8})\s+([\d,]+(?:\.\d+)?)\s+(?:([A-Za-z][A-Za-z.]{0,15})\s+)?([\d,]+\.\d{1,2})\s+([\d,]+\.\d{1,2})((?:\s+\d+(?:\.\d+)?\s*%\s+[\d,]+\.\d{1,2}){1,3})\s*$/;

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
  m = s.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m) { const mo = MONTHS[m[1]!.toLowerCase()]; if (!mo) return null; return `${m[3]}-${pad(mo)}-${pad(Number(m[2]))}`; }
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

interface ExtractedNumber { value: number; index: number; }
function extractNumbers(line: string): ExtractedNumber[] {
  const re = /[-+]?\d+(?:,\d{3})*(?:\.\d+)?/g;
  const out: ExtractedNumber[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const n = Number(m[0].replace(/,/g, ''));
    if (Number.isFinite(n)) out.push({ value: n, index: m.index });
  }
  return out;
}
function numberValues(line: string): number[] { return extractNumbers(line).map((n) => n.value); }

interface ExtractedItem {
  itemName: string;
  hsnSacCode: string | null;
  quantity: number;
  unitPrice: number;
  amount: number;
  taxRate: number | null;
  taxCategory: string | null;
}

interface ExtractedInvoice {
  vendorName: string;
  vendorGstin: string | null;
  vendorPan: string | null;
  vendorPhone: string | null;
  vendorEmail: string | null;
  vendorAddress: string | null;
  vendorCity: string | null;
  vendorState: string | null;
  vendorPincode: string | null;
  vendorBankAccount: string | null;
  vendorBankIfsc: string | null;
  vendorBankName: string | null;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string | null;
  items: ExtractedItem[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  tdsSection: string | null;
  confidence: number;
}

const PAN_RE = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/;
const PHONE_RE = /(?:\+91[\s-]?|0)?[6-9]\d{9}\b/;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const IFSC_RE = /\b[A-Z]{4}0[A-Z0-9]{6}\b/;
const ACCT_RE = /(?:a\/?c|account)\s*(?:no\.?|number|#)?\s*[:\-]?\s*(\d{9,18})/i;
const BANK_NAME_RE = /(?:bank\s*(?:name)?|beneficiary\s*bank)\s*[:\-]?\s*([A-Za-z][A-Za-z\s&.]+)/i;
const PINCODE_RE = /\b[1-9]\d{5}\b/;

function extractBankDetails(text: string): { account: string | null; ifsc: string | null; bankName: string | null } {
  const bankSection = text.match(/bank\s*details?[\s\S]{0,500}/i)?.[0] ?? text.slice(-1500);
  const ifscMatch = bankSection.match(IFSC_RE);
  const acctMatch = bankSection.match(ACCT_RE);
  const nameMatch = bankSection.match(BANK_NAME_RE);
  return {
    account: acctMatch?.[1] ?? null,
    ifsc: ifscMatch?.[0] ?? null,
    bankName: nameMatch?.[1]?.trim() ?? null,
  };
}

function extractVendorInfo(text: string): { name: string; gstin: string | null } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  // Vendor name: first substantive line that isn't a generic header.
  let name = '';
  for (const ln of lines) {
    if (/^(?:tax\s+invoice|invoice|original|duplicate|copy)/i.test(ln)) continue;
    if (/^\d+[\-\/]/.test(ln)) continue; // date-like
    if (ln.length < 3) continue;
    if (/[a-zA-Z]/.test(ln)) { name = ln; break; }
  }

  // Vendor GSTIN: the FIRST GSTIN found in the document (before any
  // "Billed to" section). Find the "Billed to" position, then only
  // look at GSTINs above it.
  const billedToIdx = text.search(/bill(?:ed)?\s*to\s*:?/i);
  const searchArea = billedToIdx > 0 ? text.slice(0, billedToIdx) : text.slice(0, Math.min(text.length, 1000));
  const gstinMatch = searchArea.match(GSTIN_RE);
  const gstin = gstinMatch ? gstinMatch[0] : null;

  return { name, gstin };
}

interface GstRowResult { item: ExtractedItem; taxAmount: number; }

function detectGstLineItem(line: string): GstRowResult | null {
  const trimmed = line.trim();
  const m = trimmed.match(GST_ROW_RE);
  if (!m) return null;

  const [, , desc, hsn, qtyStr, , rateStr, taxableStr, taxBlock] = m;
  const quantity = Number(qtyStr!.replace(/,/g, ''));
  const unitPrice = Number(rateStr!.replace(/,/g, ''));
  const amount = Number(taxableStr!.replace(/,/g, ''));
  if (!Number.isFinite(quantity) || !Number.isFinite(amount) || amount <= 0) return null;

  let taxRate = 0;
  let taxAmount = 0;
  const pairRe = /(\d+(?:\.\d+)?)\s*%\s+([\d,]+\.\d{1,2})/g;
  let pm: RegExpExecArray | null;
  while ((pm = pairRe.exec(taxBlock!)) !== null) {
    taxRate += Number(pm[1]);
    taxAmount += Number(pm[2]!.replace(/,/g, ''));
  }

  const itemName = desc!.trim().replace(/^\d+[.)\s]+/, '').trim();
  if (itemName.length < 2 || !/[a-zA-Z]/.test(itemName)) return null;

  return {
    item: {
      itemName,
      hsnSacCode: hsn!,
      quantity,
      unitPrice,
      amount: Math.round(amount * 100) / 100,
      taxRate: taxRate > 0 ? Math.round(taxRate * 100) / 100 : null,
      taxCategory: taxRate > 0 ? 'taxable' : null,
    },
    taxAmount: Math.round(taxAmount * 100) / 100,
  };
}

function detectLineItem(line: string): ExtractedItem | null {
  const trimmed = line.trim();
  if (trimmed.length < 4) return null;
  if (/^(?:tax\s*invoice|invoice|bill|gstn?|bank|ifsc|account|terms|grand\s*total|sub\s*total|amount|signature|page|total)\b/i.test(trimmed)) return null;

  const numbers = extractNumbers(trimmed);
  if (numbers.length < 3) return null;

  const totalNum = numbers[numbers.length - 1]!;
  if (totalNum.value <= 0) return null;
  const total = totalNum.value;

  let best: { qty: ExtractedNumber; unitPrice: ExtractedNumber; score: number } | null = null;
  for (let i = 0; i < numbers.length - 2; i++) {
    const qty = numbers[i]!;
    if (qty.value <= 0 || qty.value > 100000) continue;
    if (Number.isInteger(qty.value) && qty.value >= 10000) continue;
    for (let j = i + 1; j < numbers.length - 1; j++) {
      const unitPrice = numbers[j]!;
      if (unitPrice.value <= 0 || unitPrice.value > 1_000_000) continue;
      const expected = qty.value * unitPrice.value;
      if (expected === 0) continue;
      const errPre = Math.abs(expected - total) / expected;
      const errGst = Math.abs(expected * 1.05 - total) / (expected * 1.05);
      const err = Math.min(errPre, errGst);
      if (err < 0.06 && (!best || (1 - err) > best.score)) {
        best = { qty, unitPrice, score: 1 - err };
      }
    }
  }

  if (!best) return null;

  let itemName = trimmed.slice(0, best.qty.index).trim()
    .replace(/^\d+[.)\s]+/, '').trim();
  if (itemName.length < 2 || !/[a-zA-Z]/.test(itemName)) return null;
  if (/^(?:total|sub\s*total|grand\s*total)/i.test(itemName)) return null;

  return {
    itemName,
    hsnSacCode: null,
    quantity: best.qty.value,
    unitPrice: best.unitPrice.value,
    amount: Math.round(best.qty.value * best.unitPrice.value * 100) / 100,
    taxRate: null,
    taxCategory: null,
  };
}

export function tryLocalExtraction(text: string): ExtractedInvoice | null {
  if (!text || text.length < 80) return null;

  const invoiceNoMatch = text.match(INVOICE_NO_RE);
  const invoiceNumber = invoiceNoMatch ? invoiceNoMatch[1]!.trim() : '';
  if (!invoiceNumber) return null;

  const dateMatch = text.match(DATE_RE);
  const invoiceDate = dateMatch ? coerceDate(dateMatch[1]!) : null;
  if (!invoiceDate) return null;

  const { name: vendorName, gstin: vendorGstin } = extractVendorInfo(text);

  // Vendor details — extract from seller section (before "Billed to")
  const billedToIdx = text.search(/bill(?:ed)?\s*to\s*:?/i);
  const sellerSection = billedToIdx > 0 ? text.slice(0, billedToIdx) : text.slice(0, 1500);
  const vendorPan = sellerSection.match(PAN_RE)?.[0] ?? null;
  const vendorPhone = sellerSection.match(PHONE_RE)?.[0]?.replace(/^0/, '') ?? null;
  const vendorEmail = sellerSection.match(EMAIL_RE)?.[0] ?? null;
  const vendorPincode = sellerSection.match(PINCODE_RE)?.[0] ?? null;
  const bank = extractBankDetails(text);

  const tdsMatch = text.match(TDS_RE);
  const tdsSection = tdsMatch ? tdsMatch[1]! : null;

  // Detect whether the bill prints GST as columns (Taxable Value + CGST/SGST/IGST).
  // In that layout each item line carries its own tax amounts, so we sum from
  // rows rather than backing tax out of the printed grand total.
  const isGstColumnLayout =
    GST_COLUMN_HEADER_RE.test(text) && GST_COLUMN_TAX_RE.test(text);

  // Line items
  const lines = text.split(/\r?\n/);
  const items: ExtractedItem[] = [];
  let columnTaxAmount = 0;
  let inItemsSection = false;
  for (const ln of lines) {
    if (!inItemsSection) {
      const lower = ln.toLowerCase();
      const hits = ['products', 'description', 'particulars', 'item', 'qty', 'quantity', 'rate', 'price', 'amount', 'taxable']
        .filter((kw) => lower.includes(kw)).length;
      if (hits >= 2 && numberValues(ln).length === 0) { inItemsSection = true; continue; }
    }
    if (!inItemsSection) continue;
    if (/^\s*(?:grand\s*total|sub\s*total|total\s+\u20B9|net\s*(?:amount|payable))/i.test(ln)) break;

    if (isGstColumnLayout) {
      // In GST-column bills the row pattern is strict, so only trust
      // detectGstLineItem here. Falling back to the generic detector picks
      // up footer noise (GSTIN strings, account numbers) as phantom items.
      const gst = detectGstLineItem(ln);
      if (gst) {
        items.push(gst.item);
        columnTaxAmount += gst.taxAmount;
      }
      continue;
    }
    const item = detectLineItem(ln);
    if (item) items.push(item);
  }

  if (items.length === 0) return null;

  const subtotal = Math.round(items.reduce((s, i) => s + i.amount, 0) * 100) / 100;

  // Grand total: handle both single-line ("Total: 18,958") and split-line
  // ("Invoice Total\n18,957.88") variants seen on Indian tax invoices.
  let totalAmount = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!GRAND_TOTAL_LINE_RE.test(lines[i]!)) continue;
    const inline = numberValues(lines[i]!);
    if (inline.length > 0) { totalAmount = inline[inline.length - 1]!; break; }
    for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
      const next = numberValues(lines[j]!);
      if (next.length > 0) { totalAmount = next[0]!; break; }
    }
    if (totalAmount > 0) break;
  }

  let taxAmount: number;
  if (isGstColumnLayout) {
    taxAmount = Math.round(columnTaxAmount * 100) / 100;
    if (totalAmount <= 0) totalAmount = Math.round((subtotal + taxAmount) * 100) / 100;
  } else {
    if (totalAmount <= 0) totalAmount = subtotal;
    taxAmount = Math.max(0, Math.round((totalAmount - subtotal) * 100) / 100);
  }

  return {
    vendorName,
    vendorGstin,
    vendorPan,
    vendorPhone,
    vendorEmail,
    vendorAddress: null,
    vendorCity: null,
    vendorState: null,
    vendorPincode,
    vendorBankAccount: bank.account,
    vendorBankIfsc: bank.ifsc,
    vendorBankName: bank.bankName,
    invoiceNumber,
    invoiceDate,
    dueDate: null,
    items,
    subtotal,
    taxAmount,
    totalAmount,
    tdsSection,
    confidence: 0.65,
  };
}
