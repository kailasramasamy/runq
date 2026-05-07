import { eq, and, ilike } from 'drizzle-orm';
import { vendors } from '@runq/db';
import type { Db } from '@runq/db';
import type { BillCategory } from '@runq/validators';
import { PurchaseInvoiceService } from './purchase-invoice.service';

export interface PreviewRow {
  rowNum: number;
  vendorName: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  itemName: string;
  amount: number;
  matchStatus: 'matched' | 'ambiguous' | 'not_found' | 'parse_error';
  vendorId?: string;
  matchedVendorName?: string;
  candidates: Array<{ id: string; name: string }>;
  parseError?: string;
}

export interface PreviewResult {
  rows: PreviewRow[];
  headerErrors: string[];
}

interface ImportError {
  row: number;
  vendorName: string;
  message: string;
}

interface ImportResult {
  created: number;
  errors: ImportError[];
}

interface ParsedRow {
  vendorName: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  hsnSacCode?: string;
  taxRate?: number;
  tdsSection?: string;
  tdsRate?: number;
}

const CATEGORY_HEADERS: Record<BillCategory, string[]> = {
  employee_salary: ['Vendor Name', 'Invoice Number', 'Invoice Date', 'Due Date', 'Item Name', 'Amount', 'TDS Section', 'TDS Rate'],
  delivery_boys: ['Vendor Name', 'Invoice Number', 'Invoice Date', 'Due Date', 'Item Name', 'Amount'],
  farmers_suppliers: ['Vendor Name', 'Invoice Number', 'Invoice Date', 'Due Date', 'Item Name', 'Quantity', 'Unit Price', 'Amount', 'HSN Code', 'Tax Rate'],
  rent_fixed: ['Vendor Name', 'Invoice Number', 'Invoice Date', 'Due Date', 'Item Name', 'Amount', 'TDS Section', 'TDS Rate'],
  general: ['Vendor Name', 'Invoice Number', 'Invoice Date', 'Due Date', 'Item Name', 'Quantity', 'Unit Price', 'Amount', 'HSN Code', 'Tax Rate', 'TDS Section', 'TDS Rate'],
};

export { CATEGORY_HEADERS };

// Header aliases — accepts common alternative names so users don't have to
// reformat their CSVs. Keys are the canonical lowercase header the parser
// looks up; values are alternatives also matched.
const HEADER_SYNONYMS: Record<string, string[]> = {
  'vendor name': ['name', 'employee', 'employee name', 'staff name', 'driver', 'driver name'],
  'amount': ['salary', 'pay', 'payout', 'wage', 'wages'],
  'invoice number': ['invoice no', 'invoice #', 'bill number', 'bill no'],
  'invoice date': ['date', 'bill date'],
  'due date': ['payment due'],
  'item name': ['description', 'particulars', 'narration'],
};

export class BillImportService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async importFromCSV(
    csvData: string,
    category: BillCategory,
    opts: { periodMonth?: number; periodYear?: number; vendorOverrides?: Record<string, string> } = {},
  ): Promise<ImportResult> {
    const parsedRows = this.parseRowsFromCsv(csvData, category, opts);
    if (parsedRows.headerErrors) return { created: 0, errors: parsedRows.headerErrors };

    const invoiceService = new PurchaseInvoiceService(this.db, this.tenantId);
    const overrides = opts.vendorOverrides ?? {};
    let created = 0;
    const errors: ImportError[] = [];

    for (const row of parsedRows.rows) {
      const { rowNum, parsed, parseError, get } = row;
      try {
        if (parseError) { errors.push({ row: rowNum, vendorName: parsed?.vendorName ?? '', message: parseError }); continue; }
        if (!parsed) continue;

        const vendorId = overrides[String(rowNum)] ?? (await this.resolveVendor(parsed.vendorName)).vendorId;
        if (!vendorId) {
          errors.push({ row: rowNum, vendorName: parsed.vendorName, message: `Vendor "${parsed.vendorName}" not found` });
          continue;
        }

        const today = new Date().toISOString().split('T')[0]!;
        await invoiceService.create({
          vendorId,
          invoiceNumber: parsed.invoiceNumber,
          invoiceDate: parsed.invoiceDate || today,
          dueDate: parsed.dueDate || today,
          items: [{
            itemName: parsed.itemName || `${category.replace(/_/g, ' ')} payment`,
            quantity: parsed.quantity,
            unitPrice: parsed.unitPrice,
            amount: parsed.amount,
            hsnSacCode: parsed.hsnSacCode || undefined,
            taxRate: parsed.taxRate,
            tdsSection: parsed.tdsSection || undefined,
            tdsRate: parsed.tdsRate,
          }],
          subtotal: parsed.amount,
          taxAmount: parsed.taxRate ? (parsed.amount * parsed.taxRate / 100) : 0,
          totalAmount: parsed.amount + (parsed.taxRate ? (parsed.amount * parsed.taxRate / 100) : 0),
          reverseCharge: false,
        });
        created++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Bill import row ${rowNum} error:`, msg);
        errors.push({ row: rowNum, vendorName: get('vendor name'), message: msg });
      }
    }

    return { created, errors };
  }

  /**
   * Parse + resolve every row in the CSV without writing anything. Used by
   * the importer's preview step so the user can fix vendor mismatches
   * (pick from candidates, or create a new vendor inline) before commit.
   */
  async previewFromCSV(
    csvData: string,
    category: BillCategory,
    opts: { periodMonth?: number; periodYear?: number } = {},
  ): Promise<PreviewResult> {
    const parsedRows = this.parseRowsFromCsv(csvData, category, opts);
    if (parsedRows.headerErrors) {
      return { rows: [], headerErrors: parsedRows.headerErrors.map((e) => e.message) };
    }

    const out: PreviewRow[] = [];
    for (const row of parsedRows.rows) {
      const p = row.parsed;
      if (row.parseError || !p) {
        out.push({
          rowNum: row.rowNum,
          vendorName: p?.vendorName ?? '',
          invoiceNumber: p?.invoiceNumber ?? '',
          invoiceDate: p?.invoiceDate ?? '',
          dueDate: p?.dueDate ?? '',
          itemName: p?.itemName ?? '',
          amount: p?.amount ?? 0,
          matchStatus: 'parse_error',
          candidates: [],
          parseError: row.parseError,
        });
        continue;
      }
      const resolution = await this.resolveVendor(p.vendorName);
      out.push({
        rowNum: row.rowNum,
        vendorName: p.vendorName,
        invoiceNumber: p.invoiceNumber,
        invoiceDate: p.invoiceDate,
        dueDate: p.dueDate,
        itemName: p.itemName,
        amount: p.amount,
        matchStatus: resolution.status,
        vendorId: resolution.vendorId ?? undefined,
        matchedVendorName: resolution.matchedVendorName ?? undefined,
        candidates: resolution.candidates,
      });
    }
    return { rows: out, headerErrors: [] };
  }

  /**
   * Single-pass CSV parsing used by both preview and import. Returns
   * structured per-row parses plus any header-level errors.
   */
  private parseRowsFromCsv(
    csvData: string,
    category: BillCategory,
    opts: { periodMonth?: number; periodYear?: number },
  ): { headerErrors?: ImportError[]; rows: Array<{ rowNum: number; parsed?: ParsedRow; parseError?: string; get: (k: string) => string }> } {
    const lines = csvData.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n').filter(Boolean);
    if (lines.length < 2) {
      return { headerErrors: [{ row: 0, vendorName: '', message: 'No data rows found' }], rows: [] };
    }
    const headers = this.parseCSVLine(lines[0]!).map((h) => h.toLowerCase().trim().replace(/^﻿/, ''));
    const isSalary = category === 'employee_salary' || category === 'delivery_boys';
    const period = this.resolvePeriod(category, opts);

    const rows: Array<{ rowNum: number; parsed?: ParsedRow; parseError?: string; get: (k: string) => string }> = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = this.parseCSVLine(lines[i]!);
      const rowNum = i + 1;
      const get = (key: string) => {
        const aliases = HEADER_SYNONYMS[key] ?? [];
        for (const k of [key, ...aliases]) {
          const idx = headers.indexOf(k);
          if (idx >= 0) return cols[idx]?.trim() ?? '';
        }
        return '';
      };

      try {
        const parsed = this.parseRow(category, get);
        if (isSalary && period) {
          if (!parsed.invoiceNumber) parsed.invoiceNumber = `${period.prefix}-${period.year}${String(period.month).padStart(2, '0')}-${String(i).padStart(3, '0')}`;
          if (!parsed.invoiceDate) parsed.invoiceDate = period.invoiceDate;
          if (!parsed.dueDate) parsed.dueDate = period.dueDate;
          if (!parsed.itemName) parsed.itemName = period.itemName;
        }
        let parseError: string | undefined;
        if (!parsed.vendorName) parseError = 'Vendor name is required';
        else if (!parsed.invoiceNumber) parseError = 'Invoice number is required (or supply a period for salary imports)';
        else if (!parsed.amount || parsed.amount <= 0) parseError = 'Amount must be positive';
        rows.push({ rowNum, parsed, parseError, get });
      } catch (err) {
        rows.push({ rowNum, parseError: err instanceof Error ? err.message : String(err), get });
      }
    }
    return { rows };
  }

  private resolvePeriod(
    category: BillCategory,
    opts: { periodMonth?: number; periodYear?: number },
  ): { invoiceDate: string; dueDate: string; itemName: string; prefix: string; year: number; month: number } | null {
    if (!opts.periodMonth || !opts.periodYear) return null;
    const month = opts.periodMonth;
    const year = opts.periodYear;
    const lastDay = new Date(year, month, 0).getDate();
    const invoiceDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const due = new Date(year, month - 1, lastDay);
    due.setDate(due.getDate() + 15);
    const dueDate = due.toISOString().split('T')[0]!;
    const monthName = new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'long' });
    const itemName = `${monthName} ${year} ${category === 'delivery_boys' ? 'delivery payout' : 'salary'}`;
    const prefix = category === 'delivery_boys' ? 'DEL' : 'SAL';
    return { invoiceDate, dueDate, itemName, prefix, year, month };
  }

  private normalizeDate(raw: string): string {
    if (!raw) return '';
    // Already ISO: 2026-03-31
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    // DD/MM/YYYY or DD-MM-YYYY
    const full = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (full) return `${full[3]}-${full[2]!.padStart(2, '0')}-${full[1]!.padStart(2, '0')}`;
    // DD/MM/YY or DD-MM-YY
    const short = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
    if (short) {
      const yr = parseInt(short[3]!, 10);
      const fullYear = yr >= 50 ? 1900 + yr : 2000 + yr;
      return `${fullYear}-${short[2]!.padStart(2, '0')}-${short[1]!.padStart(2, '0')}`;
    }
    return raw;
  }

  private parseRow(category: BillCategory, get: (key: string) => string): ParsedRow {
    const vendorName = get('vendor name');
    const invoiceNumber = get('invoice number');
    const invoiceDate = this.normalizeDate(get('invoice date'));
    const dueDate = this.normalizeDate(get('due date'));
    const itemName = get('item name');

    switch (category) {
      case 'employee_salary':
      case 'rent_fixed': {
        const amount = parseFloat(get('amount')) || 0;
        return {
          vendorName, invoiceNumber, invoiceDate, dueDate, itemName,
          quantity: 1, unitPrice: amount, amount,
          tdsSection: get('tds section') || undefined,
          tdsRate: parseFloat(get('tds rate')) || undefined,
        };
      }
      case 'delivery_boys': {
        const amount = parseFloat(get('amount')) || 0;
        return {
          vendorName, invoiceNumber, invoiceDate, dueDate, itemName,
          quantity: 1, unitPrice: amount, amount,
        };
      }
      case 'farmers_suppliers': {
        const qty = parseFloat(get('quantity')) || 1;
        const price = parseFloat(get('unit price')) || 0;
        const amount = parseFloat(get('amount')) || (qty * price);
        return {
          vendorName, invoiceNumber, invoiceDate, dueDate, itemName,
          quantity: qty, unitPrice: price, amount,
          hsnSacCode: get('hsn code') || undefined,
          taxRate: parseFloat(get('tax rate')) || undefined,
        };
      }
      case 'general':
      default: {
        const qty = parseFloat(get('quantity')) || 1;
        const price = parseFloat(get('unit price')) || 0;
        const amount = parseFloat(get('amount')) || (qty * price);
        return {
          vendorName, invoiceNumber, invoiceDate, dueDate, itemName,
          quantity: qty, unitPrice: price, amount,
          hsnSacCode: get('hsn code') || undefined,
          taxRate: parseFloat(get('tax rate')) || undefined,
          tdsSection: get('tds section') || undefined,
          tdsRate: parseFloat(get('tds rate')) || undefined,
        };
      }
    }
  }

  /**
   * Resolve a CSV vendor name to a runQ vendor. Returns the matched id when
   * unambiguous, or the candidate list when multiple vendors match — the
   * caller (import preview UI) surfaces candidates to the user.
   */
  private async resolveVendor(vendorName: string): Promise<{
    status: 'matched' | 'ambiguous' | 'not_found';
    vendorId?: string;
    matchedVendorName?: string;
    candidates: Array<{ id: string; name: string }>;
  }> {
    const cleanName = vendorName.replace(/\r/g, '').trim();
    if (!cleanName) return { status: 'not_found', candidates: [] };

    const exact = await this.db.select({ id: vendors.id, name: vendors.name }).from(vendors)
      .where(and(eq(vendors.tenantId, this.tenantId), ilike(vendors.name, cleanName))).limit(2);
    if (exact.length === 1) return { status: 'matched', vendorId: exact[0]!.id, matchedVendorName: exact[0]!.name, candidates: exact };

    const contains = await this.db.select({ id: vendors.id, name: vendors.name }).from(vendors)
      .where(and(eq(vendors.tenantId, this.tenantId), ilike(vendors.name, `%${cleanName}%`))).limit(5);
    if (contains.length === 1) return { status: 'matched', vendorId: contains[0]!.id, matchedVendorName: contains[0]!.name, candidates: contains };
    if (contains.length > 1) return { status: 'ambiguous', candidates: contains };

    const firstWord = cleanName.split(/\s+/)[0];
    if (firstWord && firstWord.length >= 2) {
      const partial = await this.db.select({ id: vendors.id, name: vendors.name }).from(vendors)
        .where(and(eq(vendors.tenantId, this.tenantId), ilike(vendors.name, `${firstWord}%`))).limit(5);
      if (partial.length === 1) return { status: 'matched', vendorId: partial[0]!.id, matchedVendorName: partial[0]!.name, candidates: partial };
      if (partial.length > 1) return { status: 'ambiguous', candidates: partial };
    }
    return { status: 'not_found', candidates: [] };
  }

  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { result.push(current); current = ''; continue; }
      current += ch;
    }
    result.push(current);
    return result;
  }
}
