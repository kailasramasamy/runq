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
 * Generic CSV/xlsx parser for the documented runq import schema.
 * One row per invoice line item; rows are grouped by invoice_no.
 *
 * Required columns (case-insensitive, fuzzy match against synonyms):
 *   invoice_no | invoice_number       — string
 *   invoice_date | date               — yyyy-mm-dd or any parseable
 *   customer_name | customer | buyer  — string
 *   item_name | item | product        — string
 *   quantity | qty                    — number
 *   unit_price | price | rate         — number
 *
 * Optional columns:
 *   customer_gstin | gstin           — buyer GSTIN
 *   hsn_sac | hsn                    — HSN code per line
 *   tax_rate | gst                   — % GST per line (0 = exempt)
 *   po_number | po                   — purchase order ref
 *   due_date                          — yyyy-mm-dd; defaults to invoice_date+30
 *   notes                             — invoice-level notes
 *
 * Returns null when none of the required columns can be detected — the
 * cascade falls through to the next parser. Throws only on corrupt files.
 */

const COLUMN_SYNONYMS: Record<string, string[]> = {
  invoiceNumber: ['invoice_no', 'invoice_number', 'invoiceno', 'invoicenumber', 'inv_no', 'bill_no'],
  invoiceDate: ['invoice_date', 'date', 'inv_date', 'bill_date'],
  dueDate: ['due_date', 'duedate'],
  customerName: ['customer_name', 'customer', 'buyer', 'billed_to', 'bill_to', 'party'],
  customerGstin: ['customer_gstin', 'gstin', 'buyer_gstin', 'gst_number'],
  itemName: ['item_name', 'item', 'product', 'description', 'particulars'],
  quantity: ['quantity', 'qty', 'units'],
  unitPrice: ['unit_price', 'price', 'rate', 'unit_rate'],
  hsnSacCode: ['hsn_sac', 'hsn', 'sac', 'hsn_code'],
  taxRate: ['tax_rate', 'gst', 'gst_rate', 'tax'],
  poNumber: ['po_number', 'po', 'po_no', 'purchase_order'],
  notes: ['notes', 'remarks', 'comments'],
};

/** Lowercase + strip non-alphanumerics for tolerant header matching. */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Build a lookup from normalized header → field name. Skips fields whose
 * synonyms aren't present in the actual header row.
 */
function detectColumns(headers: string[]): Record<string, number> | null {
  const normalizedHeaders = headers.map(normalize);
  const map: Record<string, number> = {};

  for (const [field, synonyms] of Object.entries(COLUMN_SYNONYMS)) {
    const normalizedSynonyms = synonyms.map(normalize);
    const idx = normalizedHeaders.findIndex((h) => normalizedSynonyms.includes(h));
    if (idx !== -1) map[field] = idx;
  }

  // Recognition: the four absolute essentials must be present.
  const required = ['invoiceNumber', 'invoiceDate', 'customerName', 'itemName'];
  if (!required.every((f) => f in map)) return null;
  return map;
}

function coerceDate(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  if (typeof raw === 'number') {
    // Excel serial — same epoch quirk as the other parser.
    const epoch = Date.UTC(1899, 11, 30);
    return new Date(epoch + raw * 86_400 * 1000).toISOString().slice(0, 10);
  }
  const s = String(raw).trim();
  // ISO yyyy-mm-dd passes through directly.
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // Try Date.parse for human formats — falls back to null on failure.
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

class GenericRowsParser implements InvoiceParser {
  readonly name = 'generic-rows' as const;

  parse(input: ParserInput): ParsedInvoice[] | null {
    if (!isSpreadsheet(input)) return null;
    const { buffer, fileName } = input;
    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
    } catch {
      return null;
    }
    const sheet = wb.Sheets[wb.SheetNames[0]!];
    if (!sheet) return null;

    // sheet_to_json with header:1 gives a 2D array (rows of cells), which
    // is the easiest way to detect & validate the header row.
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });
    if (rows.length < 2) return null;

    const header = (rows[0] ?? []).map((c) => (c == null ? '' : String(c)));
    const cols = detectColumns(header);
    if (!cols) return null;

    // Group data rows by invoice number.
    const grouped = new Map<string, unknown[][]>();
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i] ?? [];
      const invNo = String(r[cols.invoiceNumber!] ?? '').trim();
      if (!invNo) continue;
      const arr = grouped.get(invNo) ?? [];
      arr.push(r);
      grouped.set(invNo, arr);
    }
    if (grouped.size === 0) return null;

    const invoices: ParsedInvoice[] = [];
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

      const warnings: string[] = [];
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

      if (lineItems.length === 0) {
        warnings.push('No valid line items (all rows had missing item name or zero quantity).');
      }

      const computedSubtotal =
        Math.round(lineItems.reduce((acc, li) => acc + li.lineTotal, 0) * 100) / 100;

      invoices.push({
        sourceFile: fileName,
        parserUsed: 'generic-rows',
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
        parseable: lineItems.length > 0 && customerSourceName.length > 0,
        warnings,
      });
    }

    return invoices;
  }
}

export const genericRowsParser = new GenericRowsParser();
