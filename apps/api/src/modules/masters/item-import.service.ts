import * as XLSX from 'xlsx';
import { and, eq, ilike } from 'drizzle-orm';
import { categories, items } from '@runq/db';
import type { Db } from '@runq/db';
import type { CreateItemInput } from '@runq/validators';
import { analyze, isAIEnabled } from '../../utils/ai/claude.service';
import {
  ITEM_EXTRACTION_SYSTEM_PROMPT,
  ITEM_EXTRACTION_USER_PROMPT,
} from '../../utils/ai/prompts/item-extraction';
import { AppError } from '../../utils/errors';
import { ItemService } from './item.service';

// Claude Haiku 4.5 supports 8192 output tokens. We need this much for
// 100-500 item JSON responses — anything less truncates mid-array.
const EXTRACTION_MAX_TOKENS = 8192;

export interface ExtractedItem {
  name: string;
  sku: string | null;
  type: 'product' | 'service';
  hsnSacCode: string | null;
  unit: string | null;
  defaultSellingPrice: number | null;
  defaultPurchasePrice: number | null;
  mrp: number | null;
  costPrice: number | null;
  gstRate: number | null;
  category: string | null;
  subcategory: string | null;
  description: string | null;
}

export interface ExtractionResult {
  items: ExtractedItem[];
  notes: string;
  confidence: number;
}

export interface BulkImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; name: string; message: string }>;
}

const CSV_MIMES = new Set([
  'text/csv',
  'application/csv',
  'text/plain',
  'application/vnd.ms-excel.sheet.macroEnabled.12',
]);

const XLSX_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream', // some browsers send this for .xlsx
]);

export class ItemImportService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async extractFromFile(
    buffer: Buffer,
    mimeType: string,
    fileName: string,
  ): Promise<ExtractionResult> {
    if (!isAIEnabled()) {
      throw new AppError(503, 'AI features require ANTHROPIC_API_KEY');
    }

    const text = this.fileToText(buffer, mimeType, fileName);
    if (!text.trim()) {
      throw new AppError(400, 'File is empty or could not be parsed');
    }

    const raw = await analyze(
      ITEM_EXTRACTION_SYSTEM_PROMPT,
      `${ITEM_EXTRACTION_USER_PROMPT}${text}`,
      EXTRACTION_MAX_TOKENS,
    );

    if (!raw) {
      throw new AppError(502, 'AI returned empty response. Try again.');
    }

    return this.parseResponse(raw);
  }

  async bulkCreate(
    inputs: CreateItemInput[],
    mode: 'skip' | 'overwrite',
  ): Promise<BulkImportResult> {
    const result: BulkImportResult = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    };

    // Ensure every (category, subcategory) referenced by the import exists
    // in the categories master, so the edit dialog's Combobox can resolve
    // them. Done in one batch up-front rather than per-row.
    await this.ensureCategories(inputs);

    const itemService = new ItemService(this.db, this.tenantId);

    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i]!;
      try {
        const existing = await this.findExisting(input.sku ?? null, input.name);
        if (existing) {
          if (mode === 'overwrite') {
            await itemService.update(existing.id, input);
            result.updated++;
          } else {
            result.skipped++;
          }
        } else {
          await itemService.create(input);
          result.created++;
        }
      } catch (err) {
        result.errors.push({
          row: i + 1,
          name: input.name,
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    return result;
  }

  // Make sure every category and (category, subcategory) pair referenced by
  // the imported items exists as a row in the categories master. Without this,
  // imported items show up correctly in the list but the edit dialog Combobox
  // can't resolve them and renders empty.
  private async ensureCategories(inputs: CreateItemInput[]): Promise<void> {
    const rootNames = new Set<string>();
    const subPairs = new Set<string>(); // "<root>||<sub>"
    for (const it of inputs) {
      if (it.category) rootNames.add(it.category);
      if (it.category && it.subcategory) {
        subPairs.add(`${it.category}||${it.subcategory}`);
      }
    }
    if (rootNames.size === 0) return;

    const existing = await this.db
      .select({
        id: categories.id,
        name: categories.name,
        parentId: categories.parentId,
      })
      .from(categories)
      .where(eq(categories.tenantId, this.tenantId));

    // Lookup keyed by lowercased name + parent id (or 'root') so we match
    // case-insensitively but preserve original casing on first insert.
    const lookup = new Map<string, string>();
    const key = (name: string, parentId: string | null) =>
      `${name.toLowerCase()}||${parentId ?? 'root'}`;
    for (const c of existing) {
      lookup.set(key(c.name, c.parentId), c.id);
    }

    // Create missing root categories
    for (const name of rootNames) {
      if (lookup.has(key(name, null))) continue;
      const [row] = await this.db
        .insert(categories)
        .values({ tenantId: this.tenantId, name, parentId: null })
        .returning({ id: categories.id });
      if (row) lookup.set(key(name, null), row.id);
    }

    // Create missing subcategories under their parent
    for (const pair of subPairs) {
      const [rootName, subName] = pair.split('||') as [string, string];
      const parentId = lookup.get(key(rootName, null));
      if (!parentId) continue;
      if (lookup.has(key(subName, parentId))) continue;
      await this.db
        .insert(categories)
        .values({ tenantId: this.tenantId, name: subName, parentId });
    }
  }

  private fileToText(buffer: Buffer, mimeType: string, fileName: string): string {
    const lower = fileName.toLowerCase();
    const isXlsxByName = lower.endsWith('.xlsx') || lower.endsWith('.xls');
    const isCsvByName = lower.endsWith('.csv') || lower.endsWith('.txt');

    if (XLSX_MIMES.has(mimeType) || isXlsxByName) {
      return this.spreadsheetToText(buffer);
    }
    if (CSV_MIMES.has(mimeType) || isCsvByName) {
      return buffer.toString('utf-8');
    }

    throw new AppError(
      400,
      `Unsupported file type '${mimeType}'. Upload CSV or Excel (.xlsx).`,
    );
  }

  private spreadsheetToText(buffer: Buffer): string {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const parts: string[] = [];
    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      if (!sheet) continue;
      const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
      if (!csv.trim()) continue;
      parts.push(`=== Sheet: ${sheetName} ===\n${csv}`);
    }
    return parts.join('\n\n');
  }

  private parseResponse(raw: string): ExtractionResult {
    const jsonText = this.extractJsonObject(raw);
    if (!jsonText) {
      this.logRawForDebug(raw, 'no JSON object found in response');
      throw new AppError(
        502,
        'AI did not return a valid JSON object. Try a smaller file or a cleaner format.',
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (err) {
      // Most common cause: response truncated mid-JSON because max_tokens was hit.
      // Detect by checking if text ends mid-string/array.
      const isTruncated = !jsonText.trimEnd().endsWith('}');
      this.logRawForDebug(raw, err instanceof Error ? err.message : 'parse failed');
      throw new AppError(
        502,
        isTruncated
          ? 'AI response was truncated — your file has too many items. Try splitting it into smaller batches (max ~300 items).'
          : 'AI returned malformed JSON. Try a cleaner file or contact support.',
      );
    }

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !Array.isArray((parsed as { items?: unknown }).items)
    ) {
      this.logRawForDebug(raw, 'missing items array');
      throw new AppError(502, 'AI response missing items array. Try again.');
    }

    const obj = parsed as {
      items: unknown[];
      notes?: unknown;
      confidence?: unknown;
    };

    return {
      items: obj.items.map((it) => this.normalizeItem(it)),
      notes: typeof obj.notes === 'string' ? obj.notes : '',
      confidence:
        typeof obj.confidence === 'number'
          ? Math.max(0, Math.min(1, obj.confidence))
          : 0.5,
    };
  }

  // Pull the JSON object out of an AI response that may have prose, code
  // fences, or other noise around it. Strategy: find the first '{' and the
  // last '}' and slice. This handles "Here's the JSON: { ... }", markdown
  // fences, leading whitespace — anything except actual mid-JSON corruption.
  private extractJsonObject(raw: string): string | null {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    return raw.slice(start, end + 1);
  }

  private logRawForDebug(raw: string, reason: string): void {
    // eslint-disable-next-line no-console
    console.warn(
      `[item-import] AI parse failed (${reason}). First 1000 chars: ${raw.slice(0, 1000)}`,
    );
  }

  private normalizeItem(raw: unknown): ExtractedItem {
    const r = (raw ?? {}) as Record<string, unknown>;
    const str = (v: unknown): string | null => {
      if (v === null || v === undefined) return null;
      const s = String(v).trim();
      return s.length > 0 ? s : null;
    };
    const num = (v: unknown): number | null => {
      if (v === null || v === undefined || v === '') return null;
      const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d.-]/g, ''));
      return Number.isFinite(n) ? n : null;
    };
    const type = r.type === 'service' ? 'service' : 'product';

    return {
      name: str(r.name) ?? '',
      sku: str(r.sku),
      type,
      hsnSacCode: str(r.hsnSacCode),
      unit: str(r.unit),
      defaultSellingPrice: num(r.defaultSellingPrice),
      defaultPurchasePrice: num(r.defaultPurchasePrice),
      mrp: num(r.mrp),
      costPrice: num(r.costPrice),
      gstRate: num(r.gstRate),
      category: str(r.category),
      subcategory: str(r.subcategory),
      description: str(r.description),
    };
  }

  private async findExisting(
    sku: string | null,
    name: string,
  ): Promise<{ id: string } | null> {
    if (sku) {
      const [bySku] = await this.db
        .select({ id: items.id })
        .from(items)
        .where(and(eq(items.tenantId, this.tenantId), eq(items.sku, sku)))
        .limit(1);
      if (bySku) return bySku;
    }

    const [byName] = await this.db
      .select({ id: items.id })
      .from(items)
      .where(and(eq(items.tenantId, this.tenantId), ilike(items.name, name)))
      .limit(1);
    return byName ?? null;
  }
}
