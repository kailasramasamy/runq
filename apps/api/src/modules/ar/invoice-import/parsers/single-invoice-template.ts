import * as XLSX from 'xlsx';
import type { ParsedInvoice } from '@runq/types';
import {
  defaultDueDate,
  emptyMatch,
  excelSerialToISO,
  isSpreadsheet,
  makeLineItem,
  type InvoiceParser,
  type ParserInput,
} from './shared';

/**
 * Parser for the "one xlsx file = one invoice" template layout used by
 * Vrindavan-style invoices (and many small dairies/wholesalers that adapt
 * the same template).
 *
 * Recognises the format by checking that:
 *   - Cell D5 holds an invoice number
 *   - Some row in 18..20 has the literal "Products" header in column A
 *
 * Returns null when those signals are missing — the cascade falls through
 * to the next parser.
 *
 * Once recognised, walks rows from 19 onwards to find:
 *   - Line items: column A = item name, B = qty (>0), D = unit price,
 *                 F = CGST, G = SGST, H = line total
 *   - Stops at the row whose column A is the literal "Grand Total"
 *
 * Header cells (template-fixed):
 *   D4 = invoice date (Excel serial or string)
 *   D5 = invoice number
 *   D6 = PO number
 *   C9 = buyer name
 *   C13 = buyer GSTIN row, e.g. "GSTN: 29AAMCT1355L1ZS"
 */
class SingleInvoiceTemplateParser implements InvoiceParser {
  readonly name = 'single-invoice-template' as const;

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

    const cell = (addr: string): unknown => sheet[addr]?.v;

    // Recognition signals
    const rawInvoiceNumber = cell('D5');
    if (rawInvoiceNumber == null || String(rawInvoiceNumber).trim() === '') return null;

    const headerLooksRight = ['A18', 'A19', 'A20'].some((addr) => {
      const v = cell(addr);
      return typeof v === 'string' && v.trim().toLowerCase() === 'products';
    });
    if (!headerLooksRight) return null;

    const invoiceNumber = String(rawInvoiceNumber).trim();
    const dateRaw = cell('D4');
    const invoiceDate =
      typeof dateRaw === 'number'
        ? excelSerialToISO(dateRaw)
        : dateRaw != null
        ? String(dateRaw)
        : new Date().toISOString().slice(0, 10);

    const poNumber = cell('D6') != null ? String(cell('D6')).trim() || null : null;
    const customerSourceName = cell('C9') != null ? String(cell('C9')).trim() : '';

    // Buyer GSTIN — the template stores it as "GSTN: 29ABC..." in C13.
    const gstinRaw = cell('C13');
    const customerSourceGstin =
      typeof gstinRaw === 'string'
        ? gstinRaw.replace(/^gst[in]*:?\s*/i, '').trim() || null
        : null;

    // Layout-agnostic line item walk: April 1 has 11 line slots (rows
    // 19..29) with the grand total at row 30; April 3+ has 13 line slots
    // (rows 19..31) with the grand total at row 33. Walk forward until we
    // hit the literal "Grand Total" row.
    const lineItems = [];
    let sourceGrandTotal = 0;
    const warnings: string[] = [];

    for (let row = 19; row <= 60; row++) {
      const a = cell(`A${row}`);
      if (typeof a === 'string' && a.trim().toLowerCase() === 'grand total') {
        sourceGrandTotal = Number(cell(`H${row}`) ?? 0);
        break;
      }
      if (a == null || typeof a !== 'string') continue;
      const qty = cell(`B${row}`);
      if (qty == null || qty === '' || Number(qty) <= 0) continue;

      const sourceName = String(a).trim();
      const quantity = Number(qty);
      const unitPrice = Number(cell(`D${row}`) ?? 0);
      const hsnSacCode = (() => {
        const raw = cell(`C${row}`);
        return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
      })();
      const cgst = Number(cell(`F${row}`) ?? 0);
      const sgst = Number(cell(`G${row}`) ?? 0);
      const taxRate = cgst > 0 || sgst > 0 ? 5 : 0;

      lineItems.push(
        makeLineItem({ sourceName, quantity, unitPrice, hsnSacCode, taxRate }),
      );
    }

    if (lineItems.length === 0) {
      // The template was recognised but had no line items with qty > 0.
      // Skip the file rather than emit an empty invoice.
      return null;
    }

    const computedSubtotal =
      Math.round(lineItems.reduce((acc, li) => acc + li.lineTotal, 0) * 100) / 100;

    // Cross-check the source grand total against our computed subtotal +
    // implied 5% GST on taxable lines. If it diverges by more than ₹2 we
    // surface a warning so the user can spot template inconsistencies in
    // the staging UI before committing.
    const taxableSubtotal =
      Math.round(
        lineItems
          .filter((li) => (li.taxRate ?? 0) > 0)
          .reduce((acc, li) => acc + li.lineTotal, 0) * 100,
      ) / 100;
    const impliedTax = Math.round(taxableSubtotal * 0.05 * 100) / 100;
    const expectedTotal = Math.round((computedSubtotal + impliedTax) * 100) / 100;
    if (sourceGrandTotal > 0 && Math.abs(expectedTotal - sourceGrandTotal) > 2) {
      warnings.push(
        `Source grand total ₹${sourceGrandTotal.toFixed(2)} differs from computed ₹${expectedTotal.toFixed(
          2,
        )} (subtotal ₹${computedSubtotal.toFixed(2)} + tax ₹${impliedTax.toFixed(2)}).`,
      );
    }

    if (!customerSourceName) {
      warnings.push('Customer name cell C9 was empty.');
    }

    const parsed: ParsedInvoice = {
      sourceFile: fileName,
      parserUsed: 'single-invoice-template',
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
    };

    return [parsed];
  }
}

export const singleInvoiceTemplateParser = new SingleInvoiceTemplateParser();
