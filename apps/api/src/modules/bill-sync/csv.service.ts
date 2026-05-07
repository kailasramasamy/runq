import type { Db } from '@runq/db';
import { BillSyncSourceService } from './source.service';
import { BillSyncIngestService, type IngestPayload, type IngestResult, type IngestLine } from './ingest.service';
import type { CanonicalField } from './ai-mapper.service';

export interface CsvPreviewRow {
  rowNum: number;
  externalId: string;
  vendorRef: string;
  invoiceNumber: string;
  totalAmount: number;
  outcome: 'create' | 'resync' | 'unchanged' | 'invalid' | 'unknown_vendor';
  message?: string;
}

export interface CsvPreviewResult {
  bills: Array<{
    externalId: string;
    payload: IngestPayload;
  }>;
  preview: CsvPreviewRow[];
  errors: Array<{ rowNum: number; message: string }>;
}

interface RowGroup {
  externalId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  vendor: IngestPayload['vendor'];
  lines: IngestLine[];
  subtotal?: number;
  taxAmount?: number;
  totalAmount?: number;
  version?: number;
  notes?: string;
  firstRowNum: number;
}

function parseCsv(csv: string): { headers: string[]; rows: string[][] } {
  const lines = csv.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n').filter(Boolean);
  if (!lines.length) return { headers: [], rows: [] };
  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = ''; let inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === ',' && !inQ) { out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  return { headers: parseLine(lines[0]!), rows: lines.slice(1).map(parseLine) };
}

function normalizeAmount(raw: string, format?: string): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/[₹\s,]/g, '').replace(/^\((.+)\)$/, '-$1');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function normalizeDate(raw: string, format?: string): string {
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (!m) return raw;
  const [, a, b, y] = m;
  const yr = y!.length === 2 ? (parseInt(y!, 10) >= 50 ? 1900 + parseInt(y!, 10) : 2000 + parseInt(y!, 10)) : parseInt(y!, 10);
  if (format === 'MDY') return `${yr}-${a!.padStart(2, '0')}-${b!.padStart(2, '0')}`;
  if (format === 'YMD') return raw;
  return `${yr}-${b!.padStart(2, '0')}-${a!.padStart(2, '0')}`;
}

export class BillSyncCsvService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  /**
   * Parse + validate a CSV against the source's saved column mapping.
   * Groups rows by external_id (multi-line bills) and produces an ingest plan
   * without writing anything. Caller calls commit() to actually ingest.
   */
  async preview(sourceId: string, csv: string): Promise<CsvPreviewResult> {
    const sourceSvc = new BillSyncSourceService(this.db, this.tenantId);
    const source = await sourceSvc.getById(sourceId);
    const mapping = (source.columnMapping ?? {}) as Record<string, CanonicalField>;
    const { headers, rows } = parseCsv(csv);
    if (!headers.length) return { bills: [], preview: [], errors: [{ rowNum: 0, message: 'Empty CSV' }] };

    const colIndex: Partial<Record<CanonicalField, number>> = {};
    for (const [header, field] of Object.entries(mapping)) {
      const idx = headers.indexOf(header);
      if (idx >= 0) colIndex[field] = idx;
    }

    const required: CanonicalField[] = ['external_id', 'invoice_number', 'invoice_date', 'total_amount'];
    const missing = required.filter((f) => colIndex[f] === undefined);
    if (missing.length) {
      return { bills: [], preview: [], errors: [{ rowNum: 0, message: `Missing required column mapping: ${missing.join(', ')}` }] };
    }

    const groups = new Map<string, RowGroup>();
    const errors: CsvPreviewResult['errors'] = [];

    rows.forEach((row, i) => {
      const rowNum = i + 2;
      const get = (f: CanonicalField) => colIndex[f] !== undefined ? (row[colIndex[f]!] ?? '').trim() : '';
      const externalId = get('external_id');
      if (!externalId) { errors.push({ rowNum, message: 'Missing external_id' }); return; }

      let g = groups.get(externalId);
      if (!g) {
        g = {
          externalId,
          invoiceNumber: get('invoice_number'),
          invoiceDate: normalizeDate(get('invoice_date'), source.dateFormat ?? undefined),
          dueDate: normalizeDate(get('due_date') || get('invoice_date'), source.dateFormat ?? undefined),
          vendor: {
            externalRef: get('vendor_external_ref') || undefined,
            gstin: get('vendor_gstin') || undefined,
            phone: get('vendor_phone') || undefined,
            name: get('vendor_name') || undefined,
          },
          lines: [],
          subtotal: normalizeAmount(get('subtotal'), source.amountFormat ?? undefined) || undefined,
          taxAmount: normalizeAmount(get('tax_amount'), source.amountFormat ?? undefined) || undefined,
          totalAmount: normalizeAmount(get('total_amount'), source.amountFormat ?? undefined) || undefined,
          version: parseInt(get('version'), 10) || 1,
          notes: get('notes') || undefined,
          firstRowNum: rowNum,
        };
        groups.set(externalId, g);
      }

      const lineAmount = normalizeAmount(get('line_amount'), source.amountFormat ?? undefined);
      const description = get('line_description');
      if (description || lineAmount) {
        g.lines.push({
          description: description || g.invoiceNumber,
          quantity: parseFloat(get('quantity')) || 1,
          unitPrice: normalizeAmount(get('unit_price'), source.amountFormat ?? undefined) || lineAmount,
          amount: lineAmount || (g.totalAmount ?? 0),
          hsnSacCode: get('hsn_sac') || undefined,
          taxRate: parseFloat(get('tax_rate')) || undefined,
        });
      }
    });

    const bills: CsvPreviewResult['bills'] = [];
    const preview: CsvPreviewRow[] = [];

    for (const g of groups.values()) {
      const total = g.totalAmount ?? g.lines.reduce((s, l) => s + l.amount, 0);
      if (!total) {
        preview.push({ rowNum: g.firstRowNum, externalId: g.externalId, vendorRef: g.vendor.externalRef ?? g.vendor.name ?? '', invoiceNumber: g.invoiceNumber, totalAmount: 0, outcome: 'invalid', message: 'Missing total_amount' });
        continue;
      }
      const payload: IngestPayload = {
        externalId: g.externalId,
        version: g.version ?? 1,
        vendor: g.vendor,
        invoiceNumber: g.invoiceNumber,
        invoiceDate: g.invoiceDate,
        dueDate: g.dueDate || g.invoiceDate,
        lines: g.lines.length ? g.lines : [{ description: g.invoiceNumber || 'Bill', amount: total }],
        subtotal: g.subtotal ?? total,
        taxAmount: g.taxAmount ?? 0,
        totalAmount: total,
        notes: g.notes,
      };
      bills.push({ externalId: g.externalId, payload });
      preview.push({
        rowNum: g.firstRowNum,
        externalId: g.externalId,
        vendorRef: g.vendor.externalRef ?? g.vendor.name ?? '',
        invoiceNumber: g.invoiceNumber,
        totalAmount: total,
        outcome: 'create',
      });
    }

    return { bills, preview, errors };
  }

  async commit(sourceId: string, slug: string, bills: Array<{ payload: IngestPayload }>): Promise<IngestResult[]> {
    const ingest = new BillSyncIngestService(this.db, this.tenantId);
    const results: IngestResult[] = [];
    for (const b of bills) {
      const r = await ingest.ingestBill(sourceId, slug, b.payload);
      results.push(r);
    }
    return results;
  }
}
