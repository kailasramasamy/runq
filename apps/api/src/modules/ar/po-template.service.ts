import { createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '@runq/db';
import { poTemplatePatterns } from '@runq/db';
import { extractPdfText } from './invoice-import/extractors/pdf-text';

/**
 * Hints learned from a previous LLM-driven parse of this PO template. We
 * apply these to the local-parser output so a future parse of the same
 * template doesn't need to call the LLM.
 *
 * Kept narrow on purpose — only the bits the local parser can't infer on
 * its own. The line-by-line column detection is already handled by the
 * generic local parser; what we don't know locally is the GST style.
 */
export interface PoTemplateHints {
  /** true = line rates/amounts on the PO already include GST (Type A).
   *  false = pre-tax (Type B). null = couldn't tell. */
  pricesIncludeTax: boolean | null;
  /** When the entire PO uses a single GST %, store it so unmatched lines
   *  still get the right tax rate without hitting the items master. */
  defaultTaxRatePct: number | null;
  /** Mean line count observed for this template — used as a sanity check
   *  when applying hints (a parse that returns 1 line for a template that
   *  averages 25 lines is suspect). */
  expectedLineCount: number | null;
  /** Free-form label of the sender, e.g. "BigBasket" — informational only. */
  sourceHint: string | null;
}

export type PoTemplateFormat = 'xlsx' | 'pdf_text';

const PDF_MIME = 'application/pdf';
const XLSX_MIMES: ReadonlySet<string> = new Set([
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

/**
 * Compute a stable structural fingerprint of a PO buffer. Returns null when
 * the file format isn't fingerprint-able (images, scanned PDFs, exotic
 * binaries). The fingerprint is per-format so an xlsx and a PDF with the
 * same header words don't collide.
 */
export async function computePoFingerprint(
  buffer: Buffer,
  mime: string,
): Promise<{ fingerprint: string; format: PoTemplateFormat } | null> {
  const lower = mime.toLowerCase();
  if (XLSX_MIMES.has(lower)) {
    const features = await xlsxLayoutFeatures(buffer);
    if (!features) return null;
    return { fingerprint: hashFeatures('xlsx', features), format: 'xlsx' };
  }
  if (lower === PDF_MIME) {
    const pdf = await extractPdfText(buffer);
    if (!pdf.hasUsableText) return null;
    return { fingerprint: hashFeatures('pdf_text', textLayoutFeatures(pdf.text)), format: 'pdf_text' };
  }
  if (lower === 'text/plain' || lower === 'text/csv') {
    return {
      fingerprint: hashFeatures('pdf_text', textLayoutFeatures(buffer.toString('utf8'))),
      format: 'pdf_text',
    };
  }
  return null;
}

function hashFeatures(format: string, features: string[]): string {
  const payload = `${format}\n${features.join('\n')}`;
  return createHash('sha256').update(payload).digest('hex');
}

/**
 * Structural tokens for an xlsx PO: the normalized header row (first row
 * with >=3 column-name-ish tokens). Column ORDER matters — a swapped layout
 * is a different template.
 */
async function xlsxLayoutFeatures(buffer: Buffer): Promise<string[] | null> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: '' });
    for (let i = 0; i < Math.min(rows.length, 25); i++) {
      const r = rows[i] as unknown[];
      if (!r || r.length < 3) continue;
      const headers = r.map((c) => normalizeToken(c == null ? '' : String(c))).filter(Boolean);
      const colNamey = headers.filter((h) => isColumnKeyword(h)).length;
      if (colNamey >= 3) return headers;
    }
  }
  return null;
}

/**
 * For PDF text / plain text POs: extract a header line (line containing
 * 2+ column keywords) and the keywords found in the document's summary
 * section (last ~25% of the text). Both are normalized to lowercase
 * alphanumerics so trivial whitespace differences don't change the hash.
 */
function textLayoutFeatures(text: string): string[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  let header: string[] = [];
  for (const line of lines) {
    const tokens = line.toLowerCase().split(/[^a-z0-9%]+/).filter(Boolean);
    const hits = tokens.filter(isColumnKeyword).length;
    if (hits >= 2) {
      header = tokens.filter((t) => t.length >= 2);
      break;
    }
  }

  const tailStart = Math.floor(lines.length * 0.75);
  const tail = lines.slice(tailStart).join(' ').toLowerCase();
  const anchors = SUMMARY_KEYWORDS.filter((kw) => tail.includes(kw));

  return ['header', ...header, '|', 'summary', ...anchors];
}

function normalizeToken(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const COLUMN_KEYWORDS = new Set([
  'description', 'item', 'product', 'particulars', 'material',
  'sku', 'code', 'hsn', 'sac', 'partno', 'partnumber',
  'qty', 'quantity', 'units', 'nos', 'pcs',
  'rate', 'price', 'unitprice', 'mrp', 'unitrate',
  'amount', 'total', 'value', 'linetotal', 'netamount',
  'uom', 'unit', 'measure',
  'gst', 'cgst', 'sgst', 'igst', 'tax', 'gstpct', 'taxrate',
  'taxable', 'taxablevalue', 'taxableamount',
]);

function isColumnKeyword(token: string): boolean {
  if (!token) return false;
  return COLUMN_KEYWORDS.has(token);
}

const SUMMARY_KEYWORDS = [
  'subtotal', 'sub total',
  'cgst', 'sgst', 'igst', 'gst',
  'tax', 'taxable value', 'taxable amount',
  'round off', 'rounding',
  'grand total', 'total amount', 'net amount', 'final total',
  'inclusive of tax', 'inclusive of gst', 'incl. tax', 'incl. gst',
];

/**
 * CRUD around the per-tenant template cache.
 */
export class PoTemplateService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  async lookup(fingerprint: string): Promise<PoTemplateHints | null> {
    const [row] = await this.db
      .select({ hints: poTemplatePatterns.hints })
      .from(poTemplatePatterns)
      .where(
        and(
          eq(poTemplatePatterns.tenantId, this.tenantId),
          eq(poTemplatePatterns.fingerprint, fingerprint),
        ),
      )
      .limit(1);
    return row ? (row.hints as unknown as PoTemplateHints) : null;
  }

  async recordUse(fingerprint: string): Promise<void> {
    await this.db
      .update(poTemplatePatterns)
      .set({
        useCount: sql`${poTemplatePatterns.useCount} + 1`,
        lastUsedAt: new Date(),
      })
      .where(
        and(
          eq(poTemplatePatterns.tenantId, this.tenantId),
          eq(poTemplatePatterns.fingerprint, fingerprint),
        ),
      );
  }

  /**
   * Persist (or refine) a template after a successful LLM extraction.
   * Existing rows take a weighted-average update for expectedLineCount
   * and overwrite the GST style only when the new observation is decisive
   * (null hints don't clobber known ones).
   */
  async upsert(args: {
    fingerprint: string;
    format: PoTemplateFormat;
    hints: PoTemplateHints;
  }): Promise<void> {
    const { fingerprint, format, hints } = args;
    const existing = await this.lookup(fingerprint);
    if (!existing) {
      await this.db.insert(poTemplatePatterns).values({
        tenantId: this.tenantId,
        fingerprint,
        format,
        hints: hints as unknown as object,
        useCount: 1,
        lastUsedAt: new Date(),
      });
      return;
    }
    const merged: PoTemplateHints = {
      pricesIncludeTax: hints.pricesIncludeTax ?? existing.pricesIncludeTax,
      defaultTaxRatePct: hints.defaultTaxRatePct ?? existing.defaultTaxRatePct,
      expectedLineCount:
        hints.expectedLineCount != null && existing.expectedLineCount != null
          ? Math.round((hints.expectedLineCount + existing.expectedLineCount) / 2)
          : (hints.expectedLineCount ?? existing.expectedLineCount),
      sourceHint: hints.sourceHint ?? existing.sourceHint,
    };
    await this.db
      .update(poTemplatePatterns)
      .set({
        hints: merged as unknown as object,
        useCount: sql`${poTemplatePatterns.useCount} + 1`,
        lastUsedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(poTemplatePatterns.tenantId, this.tenantId),
          eq(poTemplatePatterns.fingerprint, fingerprint),
        ),
      );
  }
}

/**
 * Build a hint set from an LLM-extracted PO. Used to populate the template
 * cache after a successful AI extraction.
 *
 * - pricesIncludeTax: trust the LLM's doc-level flag.
 * - defaultTaxRatePct: only set when ALL lines that have a tax rate use the
 *   same %.  Mixed-rate POs leave this null and fall back to items master.
 */
export function hintsFromExtraction(extracted: {
  pricesIncludeTax: boolean | null;
  items: Array<{ taxRatePct: number | null }>;
}): PoTemplateHints {
  const rates = extracted.items.map((i) => i.taxRatePct).filter((r): r is number => r != null);
  const uniqRates = Array.from(new Set(rates));
  const defaultTaxRatePct = uniqRates.length === 1 ? uniqRates[0]! : null;
  return {
    pricesIncludeTax: extracted.pricesIncludeTax,
    defaultTaxRatePct,
    expectedLineCount: extracted.items.length > 0 ? extracted.items.length : null,
    sourceHint: null,
  };
}
