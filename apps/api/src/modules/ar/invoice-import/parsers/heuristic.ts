import * as XLSX from 'xlsx';
import type { ParsedInvoice } from '@runq/types';
import {
  defaultDueDate,
  emptyMatch,
  isSpreadsheet,
  makeLineItem,
  type InvoiceParser,
  type ParserInput,
} from './shared';

/**
 * Heuristic spreadsheet parser. Sits between the strict explicit parsers
 * and the AI fallback in the cascade.
 *
 * Goal: handle arbitrary tabular exports (Tally, Zoho, Excel templates,
 * etc.) where columns roughly match invoice fields but the layout doesn't
 * follow runq's documented schema exactly. Two strategies:
 *
 *   1. **Header-row scan** — walk every sheet, find the row with the most
 *      matches against known column synonyms, treat that as the header,
 *      and group subsequent rows by invoice number. More lenient than the
 *      strict generic-rows parser because the header row can be anywhere
 *      on the sheet (not just row 1) and the synonym list is broader.
 *
 *   2. **Multi-sheet** — try every sheet in the workbook, return the
 *      first that yields ≥1 parseable invoice.
 *
 * Returns null when no sheet has a recognisable header row. Single-invoice
 * templates with non-standard cell positions are deferred to the AI parser.
 */

const HEURISTIC_SYNONYMS: Record<string, string[]> = {
  invoiceNumber: [
    'invoiceno',
    'invoicenumber',
    'invno',
    'billno',
    'invoiceref',
    'voucherno',
    'vchno',
    'docno',
  ],
  invoiceDate: ['invoicedate', 'date', 'invdate', 'billdate', 'voucherdate', 'docdate'],
  dueDate: ['duedate', 'paymentdue'],
  customerName: [
    'customername',
    'customer',
    'buyer',
    'billedto',
    'billto',
    'party',
    'partyname',
    'client',
    'consignee',
  ],
  customerGstin: ['customergstin', 'gstin', 'buyergstin', 'gstno', 'gstnumber'],
  itemName: [
    'itemname',
    'item',
    'product',
    'productname',
    'description',
    'particulars',
    'desc',
    'narration',
  ],
  quantity: ['quantity', 'qty', 'units', 'pcs'],
  unitPrice: ['unitprice', 'price', 'rate', 'unitrate', 'sellingprice', 'sp'],
  hsnSacCode: ['hsnsac', 'hsn', 'sac', 'hsncode', 'saccode'],
  taxRate: ['taxrate', 'gst', 'gstrate', 'tax', 'gstpercent'],
  poNumber: ['ponumber', 'po', 'pono', 'purchaseorder', 'poref'],
  notes: ['notes', 'remarks', 'comments', 'narration'],
};

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Score a row as a potential header — number of cells whose normalized
 * text matches at least one synonym. The row with the highest score that
 * has at least 3 hits AND covers the four absolute essentials wins.
 */
function scoreHeaderRow(row: unknown[]): { score: number; cols: Record<string, number> } {
  const cols: Record<string, number> = {};
  let score = 0;
  for (let i = 0; i < row.length; i++) {
    const cell = row[i];
    if (cell == null || typeof cell !== 'string') continue;
    const n = normalize(cell);
    for (const [field, synonyms] of Object.entries(HEURISTIC_SYNONYMS)) {
      if (synonyms.includes(n) && !(field in cols)) {
        cols[field] = i;
        score++;
        break;
      }
    }
  }
  return { score, cols };
}

function findHeaderRow(rows: unknown[][]): { rowIdx: number; cols: Record<string, number> } | null {
  let best: { rowIdx: number; score: number; cols: Record<string, number> } | null = null;
  // Scan a generous prefix — header rows are usually within the first 20
  // rows even on heavily-formatted templates with title bands.
  const limit = Math.min(rows.length, 20);
  for (let i = 0; i < limit; i++) {
    const r = rows[i];
    if (!r || r.length === 0) continue;
    const { score, cols } = scoreHeaderRow(r);
    if (score >= 3 && (!best || score > best.score)) {
      best = { rowIdx: i, score, cols };
    }
  }
  if (!best) return null;
  // Need at least the four essentials to bother grouping.
  const required = ['invoiceNumber', 'invoiceDate', 'customerName', 'itemName'];
  if (!required.every((f) => f in best!.cols)) return null;
  return { rowIdx: best.rowIdx, cols: best.cols };
}

function coerceDate(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  if (typeof raw === 'number') {
    const epoch = Date.UTC(1899, 11, 30);
    return new Date(epoch + raw * 86_400 * 1000).toISOString().slice(0, 10);
  }
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

function buildInvoicesFromRows(
  rows: unknown[][],
  headerRowIdx: number,
  cols: Record<string, number>,
  fileName: string,
  parserName: ParsedInvoice['parserUsed'],
): ParsedInvoice[] {
  const grouped = new Map<string, unknown[][]>();
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const invNo = String(r[cols.invoiceNumber!] ?? '').trim();
    if (!invNo) continue;
    const arr = grouped.get(invNo) ?? [];
    arr.push(r);
    grouped.set(invNo, arr);
  }

  const out: ParsedInvoice[] = [];
  for (const [invoiceNumber, lines] of grouped.entries()) {
    const first = lines[0]!;
    const invoiceDate =
      coerceDate(first[cols.invoiceDate!]) ?? new Date().toISOString().slice(0, 10);
    const dueDate =
      cols.dueDate !== undefined
        ? coerceDate(first[cols.dueDate]) ?? defaultDueDate(invoiceDate)
        : defaultDueDate(invoiceDate);
    const customerSourceName = String(first[cols.customerName!] ?? '').trim();
    const customerSourceGstin =
      cols.customerGstin !== undefined && first[cols.customerGstin] != null
        ? String(first[cols.customerGstin]).trim() || null
        : null;
    const poNumber =
      cols.poNumber !== undefined && first[cols.poNumber] != null
        ? String(first[cols.poNumber]).trim() || null
        : null;
    const notes =
      cols.notes !== undefined && first[cols.notes] != null
        ? String(first[cols.notes]).trim() || null
        : null;

    const lineItems = lines
      .map((row) => {
        const sourceName = String(row[cols.itemName!] ?? '').trim();
        const quantity = Number(row[cols.quantity!] ?? 0);
        const unitPrice = Number(row[cols.unitPrice!] ?? 0);
        if (!sourceName || quantity <= 0) return null;
        const hsnSacCode =
          cols.hsnSacCode !== undefined && row[cols.hsnSacCode] != null
            ? String(row[cols.hsnSacCode]).trim() || null
            : null;
        const taxRate =
          cols.taxRate !== undefined && row[cols.taxRate] != null && row[cols.taxRate] !== ''
            ? Number(row[cols.taxRate])
            : null;
        return makeLineItem({ sourceName, quantity, unitPrice, hsnSacCode, taxRate });
      })
      .filter((li): li is NonNullable<typeof li> => li !== null);

    if (lineItems.length === 0) continue;

    const computedSubtotal =
      Math.round(lineItems.reduce((acc, li) => acc + li.lineTotal, 0) * 100) / 100;

    out.push({
      sourceFile: fileName,
      parserUsed: parserName,
      invoiceNumber,
      invoiceDate,
      dueDate,
      poNumber,
      notes,
      customerSourceName,
      customerSourceGstin,
      customerMatch: emptyMatch(),
      lineItems,
      sourceGrandTotal: 0,
      computedSubtotal,
      parseable: customerSourceName.length > 0,
      warnings: [],
    });
  }

  return out;
}

class HeuristicParser implements InvoiceParser {
  readonly name = 'heuristic' as const;

  parse(input: ParserInput): ParsedInvoice[] | null {
    if (!isSpreadsheet(input)) return null;

    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.read(input.buffer, { type: 'buffer', cellDates: false });
    } catch {
      return null;
    }

    // Try every sheet — return the first one that yields parseable invoices.
    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      if (!sheet) continue;
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });
      if (rows.length < 2) continue;

      const header = findHeaderRow(rows);
      if (!header) continue;

      const invoices = buildInvoicesFromRows(rows, header.rowIdx, header.cols, input.fileName, this.name);
      if (invoices.length > 0) return invoices;
    }

    return null;
  }
}

export const heuristicParser = new HeuristicParser();
