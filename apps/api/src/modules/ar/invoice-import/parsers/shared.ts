import type { MatchResult, ParsedInvoice, ParsedLineItem } from '@runq/types';

/**
 * Empty match — parsers produce these and the matcher fills them in.
 * Lifting it into a helper keeps each parser short and prevents drift if
 * the MatchResult shape changes.
 */
export function emptyMatch(): MatchResult {
  return {
    resolvedId: null,
    source: 'unmatched',
    confidence: 0,
    resolvedName: null,
    suggestions: [],
  };
}

/**
 * Builds a ParsedLineItem with sane defaults for fields the source file
 * may not provide. Computes lineTotal from qty × unitPrice for cross-check.
 */
export function makeLineItem(args: {
  sourceName: string;
  quantity: number;
  unitPrice: number;
  hsnSacCode?: string | null;
  taxRate?: number | null;
}): ParsedLineItem {
  const qty = Number(args.quantity) || 0;
  const price = Number(args.unitPrice) || 0;
  return {
    sourceName: args.sourceName,
    quantity: qty,
    unitPrice: price,
    hsnSacCode: args.hsnSacCode ?? null,
    taxRate: args.taxRate ?? null,
    lineTotal: Math.round(qty * price * 100) / 100,
    match: emptyMatch(),
  };
}

/**
 * Excel stores dates as a serial number of days since 1899-12-30 (with the
 * historical leap year bug baked in). Convert to ISO yyyy-mm-dd.
 */
export function excelSerialToISO(serial: number): string {
  const epoch = Date.UTC(1899, 11, 30);
  const ms = epoch + serial * 86_400 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Default due date when the source file doesn't provide one. Most B2B
 * invoices in India default to 30-day terms; tenants can edit per-customer
 * later via the AR list.
 */
export function defaultDueDate(invoiceDate: string, days = 30): string {
  const d = new Date(invoiceDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Input passed to every parser in the cascade. The cascade extracts the
 * mime type once and lets each parser decide whether it can handle that
 * input (xlsx/csv parsers reject PDFs by returning null, the AI parser
 * handles PDFs via Claude Vision, etc.).
 */
export interface ParserInput {
  buffer: Buffer;
  fileName: string;
  /** Lowercase mime type, e.g. 'application/pdf'. May be empty string. */
  mimeType: string;
}

/**
 * A parser takes ParserInput and either returns the parsed invoices or
 * null when the format isn't recognized. Returning null lets the cascade
 * try the next parser without errors. Async because the AI parser will
 * make a network call.
 *
 * Throw only for unexpected runtime failures (corrupt files, library
 * exceptions). Recognition failures are signalled by returning null.
 */
export interface InvoiceParser {
  readonly name: ParsedInvoice['parserUsed'];
  parse(input: ParserInput): Promise<ParsedInvoice[] | null> | ParsedInvoice[] | null;
}

/** True when the file is recognised as a spreadsheet (xlsx/xls/csv). */
export function isSpreadsheet(input: ParserInput): boolean {
  if (
    input.mimeType.includes('spreadsheet') ||
    input.mimeType === 'application/vnd.ms-excel' ||
    input.mimeType === 'text/csv' ||
    input.mimeType === 'text/plain' ||
    input.mimeType === 'application/octet-stream'
  ) {
    return true;
  }
  return /\.(xlsx|xls|csv)$/i.test(input.fileName);
}

/** True when the file is recognised as a PDF. */
export function isPdf(input: ParserInput): boolean {
  return input.mimeType === 'application/pdf' || /\.pdf$/i.test(input.fileName);
}
