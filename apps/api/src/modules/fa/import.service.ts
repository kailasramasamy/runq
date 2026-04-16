import * as XLSX from 'xlsx';
import { eq, and, ilike } from 'drizzle-orm';
import { assetCategories } from '@runq/db';
import type { Db } from '@runq/db';
import { FixedAssetService } from './asset.service';

interface ImportRow {
  name: string;
  category: string;
  acquisitionDate: string;
  acquisitionCost: number;
  residualValue: number;
  location: string | null;
  serialNumber: string | null;
  putToUseDate: string | null;
}

interface ImportResult {
  created: number;
  skipped: number;
  errors: { row: number; name: string; error: string }[];
}

const COL_MAP: Record<string, string> = {
  name: 'name', assetname: 'name', asset: 'name', description: 'name',
  category: 'category', assetcategory: 'category', type: 'category', group: 'category',
  acquisitiondate: 'acquisitionDate', purchasedate: 'acquisitionDate', date: 'acquisitionDate', dateofpurchase: 'acquisitionDate',
  cost: 'acquisitionCost', acquisitioncost: 'acquisitionCost', purchasecost: 'acquisitionCost', amount: 'acquisitionCost', value: 'acquisitionCost',
  residualvalue: 'residualValue', scrapvalue: 'residualValue', salvagevalue: 'residualValue',
  location: 'location', place: 'location', site: 'location',
  serialnumber: 'serialNumber', serial: 'serialNumber', serialno: 'serialNumber',
  puttousedate: 'putToUseDate', usedate: 'putToUseDate', inservicedate: 'putToUseDate',
};

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseDate(v: unknown): string | null {
  if (!v) return null;
  const s = String(v).trim();
  // yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // dd/mm/yyyy or dd-mm-yyyy
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) return `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  // Excel serial date
  const n = Number(v);
  if (Number.isFinite(n) && n > 30000 && n < 60000) {
    const d = new Date((n - 25569) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

export class AssetImportService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async importFromBuffer(buffer: Buffer, fileName: string, userId?: string): Promise<ImportResult> {
    const rows = this.parseFile(buffer, fileName);
    const result: ImportResult = { created: 0, skipped: 0, errors: [] };
    const assetService = new FixedAssetService(this.db, this.tenantId);

    // Pre-fetch categories for matching
    const categories = await this.db.select().from(assetCategories)
      .where(eq(assetCategories.tenantId, this.tenantId));
    const catByName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const rowNum = i + 2; // 1-indexed + header

      if (!row.name) { result.errors.push({ row: rowNum, name: '', error: 'Missing name' }); continue; }
      if (!row.acquisitionDate) { result.errors.push({ row: rowNum, name: row.name, error: 'Missing/invalid date' }); continue; }
      if (!row.acquisitionCost || row.acquisitionCost <= 0) { result.errors.push({ row: rowNum, name: row.name, error: 'Missing/invalid cost' }); continue; }

      // Match category
      const catId = catByName.get(row.category.toLowerCase());
      if (!catId) {
        result.errors.push({ row: rowNum, name: row.name, error: `Category "${row.category}" not found` });
        continue;
      }

      try {
        await assetService.create({
          name: row.name,
          categoryId: catId,
          acquisitionDate: row.acquisitionDate,
          acquisitionCost: row.acquisitionCost,
          residualValue: row.residualValue,
          putToUseDate: row.putToUseDate ?? undefined,
          location: row.location ?? undefined,
          serialNumber: row.serialNumber ?? undefined,
          gstCreditClaimed: false,
          gstAmount: 0,
        }, userId);
        result.created++;
      } catch (err) {
        result.errors.push({ row: rowNum, name: row.name, error: (err as Error).message });
      }
    }

    return result;
  }

  private parseFile(buffer: Buffer, fileName: string): ImportRow[] {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext === 'csv') {
      return this.parseCSV(buffer.toString('utf8'));
    }
    return this.parseXlsx(buffer);
  }

  private parseXlsx(buffer: Buffer): ImportRow[] {
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
    const sheet = wb.Sheets[wb.SheetNames[0]!];
    if (!sheet) return [];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
    return this.mapRows(rawRows);
  }

  private parseCSV(text: string): ImportRow[] {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];
    const headers = lines[0]!.split(',').map((h) => h.trim());
    const rows: Record<string, unknown>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i]!.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
      const row: Record<string, unknown> = {};
      headers.forEach((h, idx) => { row[h] = vals[idx] ?? ''; });
      rows.push(row);
    }
    return this.mapRows(rows);
  }

  private mapRows(rawRows: Record<string, unknown>[]): ImportRow[] {
    if (rawRows.length === 0) return [];
    const headers = Object.keys(rawRows[0]!);
    const colMap: Record<string, string> = {};
    for (const h of headers) {
      const mapped = COL_MAP[normalize(h)];
      if (mapped) colMap[h] = mapped;
    }

    return rawRows.map((raw) => {
      const get = (field: string): unknown => {
        for (const [src, dst] of Object.entries(colMap)) {
          if (dst === field) return raw[src];
        }
        return undefined;
      };
      return {
        name: String(get('name') ?? '').trim(),
        category: String(get('category') ?? '').trim(),
        acquisitionDate: parseDate(get('acquisitionDate')) ?? '',
        acquisitionCost: Number(get('acquisitionCost')) || 0,
        residualValue: Number(get('residualValue')) || 0,
        location: get('location') ? String(get('location')).trim() : null,
        serialNumber: get('serialNumber') ? String(get('serialNumber')).trim() : null,
        putToUseDate: parseDate(get('putToUseDate')),
      };
    });
  }
}
