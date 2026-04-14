import { eq, and, ilike } from 'drizzle-orm';
import { vendors } from '@runq/db';
import type { Db } from '@runq/db';
import type { BillCategory } from '@runq/validators';
import { PurchaseInvoiceService } from './purchase-invoice.service';

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

export class BillImportService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async importFromCSV(csvData: string, category: BillCategory): Promise<ImportResult> {
    const lines = csvData.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n').filter(Boolean);
    if (lines.length < 2) return { created: 0, errors: [{ row: 0, vendorName: '', message: 'No data rows found' }] };

    const headers = this.parseCSVLine(lines[0]!).map((h) => h.toLowerCase().trim());
    const invoiceService = new PurchaseInvoiceService(this.db, this.tenantId);

    let created = 0;
    const errors: ImportError[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = this.parseCSVLine(lines[i]!);
      const rowNum = i + 1;
      const get = (key: string) => cols[headers.indexOf(key)]?.trim() ?? '';

      try {
        const parsed = this.parseRow(category, get);
        if (!parsed.vendorName) { errors.push({ row: rowNum, vendorName: '', message: 'Vendor Name is required' }); continue; }
        if (!parsed.invoiceNumber) { errors.push({ row: rowNum, vendorName: parsed.vendorName, message: 'Invoice Number is required' }); continue; }
        if (!parsed.amount || parsed.amount <= 0) { errors.push({ row: rowNum, vendorName: parsed.vendorName, message: 'Amount must be positive' }); continue; }

        const vendorId = await this.resolveVendorId(parsed.vendorName);
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

  private async resolveVendorId(vendorName: string): Promise<string | null> {
    const cleanName = vendorName.replace(/\r/g, '').trim();
    const exact = await this.db.select({ id: vendors.id }).from(vendors)
      .where(and(eq(vendors.tenantId, this.tenantId), ilike(vendors.name, cleanName))).limit(1);
    if (exact.length === 1) return exact[0]!.id;

    const contains = await this.db.select({ id: vendors.id }).from(vendors)
      .where(and(eq(vendors.tenantId, this.tenantId), ilike(vendors.name, `%${vendorName}%`))).limit(2);
    if (contains.length === 1) return contains[0]!.id;

    const firstWord = vendorName.trim().split(/\s+/)[0];
    if (!firstWord || firstWord.length < 2) return null;
    const partial = await this.db.select({ id: vendors.id }).from(vendors)
      .where(and(eq(vendors.tenantId, this.tenantId), ilike(vendors.name, `${firstWord}%`))).limit(2);
    if (partial.length === 1) return partial[0]!.id;

    return null;
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
