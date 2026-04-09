import type { Readable } from 'node:stream';
import { eq, and, or, ilike } from 'drizzle-orm';
import {
  poUploads,
  poDrafts,
  poDraftLines,
  customers,
  customerSkuAliases,
  items,
} from '@runq/db';
import type { Db } from '@runq/db';
import type { StorageProvider } from '../../utils/storage';
import {
  extractFromPDF,
  extractFromImage,
  analyze,
  isAIEnabled,
} from '../../utils/ai/claude.service';
import {
  PO_EXTRACTION_SYSTEM_PROMPT,
  PO_EXTRACTION_USER_PROMPT,
  PO_EXTRACTION_TEXT_USER_PROMPT_PREFIX,
} from '../../utils/ai/prompts/po-extraction';
import { PriceResolverService } from '../masters/price-resolver.service';

const LLM_MODEL = 'claude-haiku-4-5-20251001';

const PDF_MIME = 'application/pdf';
const IMAGE_MIMES: Record<string, 'image/jpeg' | 'image/png' | 'image/webp'> = {
  'image/png': 'image/png',
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/webp': 'image/webp',
};
const TEXT_MIMES: ReadonlySet<string> = new Set(['text/plain', 'text/csv']);
const UNSUPPORTED_MIMES: ReadonlySet<string> = new Set([
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

type PoUploadRow = typeof poUploads.$inferSelect;

interface ExtractedItem {
  description: string;
  quantity: number;
  uom: string | null;
  rate: number | null;
  amount: number | null;
}

interface ExtractedPo {
  buyerName: string | null;
  buyerGstin: string | null;
  buyerPhone: string | null;
  poNumber: string | null;
  poDate: string | null;
  deliveryDate: string | null;
  items: ExtractedItem[];
  subtotal: number | null;
  totalAmount: number | null;
  confidence: number;
}

interface CustomerMatch {
  id: string;
  source: 'gstin' | 'phone' | 'name_fuzzy';
  confidence: number;
}

interface LineMatch {
  itemId: string | null;
  source: 'alias' | 'name_fuzzy' | null;
  confidence: number | null;
  resolvedRate: number | null;
  resolvedUom: string | null;
}

interface ReviewFlag {
  type: 'no_customer' | 'unmatched_sku' | 'low_confidence';
  lineIndex?: number;
  message?: string;
}

type LoadedContent =
  | { kind: 'pdf'; data: string }
  | { kind: 'image'; data: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' }
  | { kind: 'text'; data: string };

/**
 * Background parser for PO uploads. Pulls a po_uploads row, extracts the PO
 * via Claude, matches the customer + line items, resolves rates, and persists
 * a po_drafts + po_draft_lines pair. All errors are caught and persisted to
 * po_uploads.error_message so the user can retry from the inbox.
 *
 * Tenant isolation: every query scopes to this.tenantId. The constructor
 * receives the tenant from the caller (PoUploadService.createFromX), and
 * since this runs in a fire-and-forget background task there's no
 * request-bound RLS context to rely on.
 */
export class PoParserService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
    private readonly storage: StorageProvider,
  ) {}

  async parse(uploadId: string): Promise<void> {
    if (!isAIEnabled()) {
      await this.markParseError(
        uploadId,
        'AI extraction is not configured (ANTHROPIC_API_KEY missing)',
      );
      return;
    }

    const upload = await this.loadUpload(uploadId);
    if (!upload) return;

    await this.markParsing(uploadId);

    try {
      const content = await this.loadContent(upload);
      const extracted = await this.extract(content);
      const customerMatch = await this.matchCustomer(extracted);
      const lineMatches = await this.matchLines(extracted.items, customerMatch?.id ?? null);
      const { reviewStatus, reviewFlags } = this.computeReview(
        extracted,
        customerMatch,
        lineMatches,
      );

      await this.persistDraft({
        upload,
        extracted,
        customerMatch,
        lineMatches,
        reviewStatus,
        reviewFlags,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Parsing failed';
      await this.markParseError(uploadId, message);
    }
  }

  /**
   * Reset the parsing state on an existing upload (used by the reparse endpoint
   * and by the line-matching service when the user picks a customer manually
   * after an unmatched parse). Drops the existing draft + lines so a fresh
   * parse can run cleanly.
   */
  async resetForReparse(uploadId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      // Drop the existing draft (lines cascade)
      await tx
        .delete(poDrafts)
        .where(and(eq(poDrafts.poUploadId, uploadId), eq(poDrafts.tenantId, this.tenantId)));
      // Reset upload status
      await tx
        .update(poUploads)
        .set({ status: 'pending', errorMessage: null, parsedAt: null, updatedAt: new Date() })
        .where(and(eq(poUploads.id, uploadId), eq(poUploads.tenantId, this.tenantId)));
    });
  }

  // ─── Step helpers ────────────────────────────────────────────────────────

  private async loadUpload(uploadId: string): Promise<PoUploadRow | null> {
    const [row] = await this.db
      .select()
      .from(poUploads)
      .where(and(eq(poUploads.id, uploadId), eq(poUploads.tenantId, this.tenantId)))
      .limit(1);
    return row ?? null;
  }

  private async markParsing(uploadId: string): Promise<void> {
    await this.db
      .update(poUploads)
      .set({ status: 'parsing', updatedAt: new Date() })
      .where(and(eq(poUploads.id, uploadId), eq(poUploads.tenantId, this.tenantId)));
  }

  private async markParseError(uploadId: string, message: string): Promise<void> {
    await this.db
      .update(poUploads)
      .set({ status: 'parse_error', errorMessage: message, updatedAt: new Date() })
      .where(and(eq(poUploads.id, uploadId), eq(poUploads.tenantId, this.tenantId)));
  }

  private async loadContent(upload: PoUploadRow): Promise<LoadedContent> {
    if (upload.rawText) {
      return { kind: 'text', data: upload.rawText };
    }

    if (!upload.storageKey || !upload.fileMime) {
      throw new Error('Upload has no file content or text');
    }

    const mime = upload.fileMime.toLowerCase();

    if (UNSUPPORTED_MIMES.has(mime)) {
      throw new Error('Excel files are not yet supported. Convert to PDF or paste contents.');
    }

    const stream = await this.storage.getStream(upload.storageKey);
    const buffer = await streamToBuffer(stream);

    if (mime === PDF_MIME) {
      return { kind: 'pdf', data: buffer.toString('base64') };
    }

    const imageMedia = IMAGE_MIMES[mime];
    if (imageMedia) {
      return { kind: 'image', data: buffer.toString('base64'), mediaType: imageMedia };
    }

    if (TEXT_MIMES.has(mime)) {
      return { kind: 'text', data: buffer.toString('utf8') };
    }

    throw new Error(`Unsupported file type: ${mime}`);
  }

  private async extract(content: LoadedContent): Promise<ExtractedPo> {
    let raw: string | null;

    switch (content.kind) {
      case 'pdf':
        raw = await extractFromPDF(
          content.data,
          PO_EXTRACTION_SYSTEM_PROMPT,
          PO_EXTRACTION_USER_PROMPT,
        );
        break;
      case 'image':
        raw = await extractFromImage(
          content.data,
          content.mediaType,
          PO_EXTRACTION_SYSTEM_PROMPT,
          PO_EXTRACTION_USER_PROMPT,
        );
        break;
      case 'text':
        raw = await analyze(
          PO_EXTRACTION_SYSTEM_PROMPT,
          PO_EXTRACTION_TEXT_USER_PROMPT_PREFIX + content.data + '\n--- END INPUT ---',
        );
        break;
    }

    if (!raw) throw new Error('AI extraction returned empty response');

    return parseLLMResponse(raw);
  }

  private async matchCustomer(extracted: ExtractedPo): Promise<CustomerMatch | null> {
    // 1. Exact GSTIN match — highest confidence
    if (extracted.buyerGstin) {
      const [row] = await this.db
        .select({ id: customers.id })
        .from(customers)
        .where(
          and(
            eq(customers.tenantId, this.tenantId),
            eq(customers.gstin, extracted.buyerGstin),
            eq(customers.isActive, true),
          ),
        )
        .limit(1);
      if (row) return { id: row.id, source: 'gstin', confidence: 1.0 };
    }

    // 2. Phone match — last 10 digits to handle country-code variations
    if (extracted.buyerPhone) {
      const normalized = extracted.buyerPhone.replace(/\D/g, '');
      if (normalized.length >= 10) {
        const last10 = normalized.slice(-10);
        const [row] = await this.db
          .select({ id: customers.id })
          .from(customers)
          .where(
            and(
              eq(customers.tenantId, this.tenantId),
              eq(customers.isActive, true),
              ilike(customers.phone, `%${last10}`),
            ),
          )
          .limit(1);
        if (row) return { id: row.id, source: 'phone', confidence: 0.9 };
      }
    }

    // 3. Fuzzy name match — try the legal name first, then nickname.
    // The accountant's mental shorthand often shows up in customer-sent POs
    // (e.g. "PO from KC Mart" instead of "Krishna Cooperative Mart Pvt Ltd").
    if (extracted.buyerName && extracted.buyerName.length >= 3) {
      const term = `%${extracted.buyerName}%`;
      const [row] = await this.db
        .select({ id: customers.id })
        .from(customers)
        .where(
          and(
            eq(customers.tenantId, this.tenantId),
            eq(customers.isActive, true),
            or(ilike(customers.name, term), ilike(customers.nickname, term)),
          ),
        )
        .limit(1);
      if (row) return { id: row.id, source: 'name_fuzzy', confidence: 0.7 };
    }

    return null;
  }

  private async matchLines(
    extractedLines: ExtractedItem[],
    customerId: string | null,
  ): Promise<LineMatch[]> {
    const matches: LineMatch[] = [];
    const priceResolver = customerId ? new PriceResolverService(this.db, this.tenantId) : null;

    for (const line of extractedLines) {
      const matched = await this.matchSingleLine(line, customerId);

      let resolvedRate: number | null = null;
      let resolvedUom: string | null = null;

      if (matched.itemId) {
        const [it] = await this.db
          .select({ unit: items.unit })
          .from(items)
          .where(and(eq(items.id, matched.itemId), eq(items.tenantId, this.tenantId)))
          .limit(1);
        resolvedUom = it?.unit ?? null;

        if (customerId && priceResolver) {
          try {
            const price = await priceResolver.resolve({
              customerId,
              itemId: matched.itemId,
              quantity: line.quantity || 1,
            });
            resolvedRate = price.effectiveRate;
          } catch {
            // Price resolution failed (item or customer disappeared) — leave null
            resolvedRate = null;
          }
        }
      }

      matches.push({
        itemId: matched.itemId,
        source: matched.source,
        confidence: matched.confidence,
        resolvedRate,
        resolvedUom: resolvedUom ?? line.uom ?? null,
      });
    }

    return matches;
  }

  private async matchSingleLine(
    line: ExtractedItem,
    customerId: string | null,
  ): Promise<{
    itemId: string | null;
    source: 'alias' | 'name_fuzzy' | null;
    confidence: number | null;
  }> {
    const description = line.description.trim();
    if (!description) return { itemId: null, source: null, confidence: null };

    const lower = description.toLowerCase();

    // 1. Exact alias match (the moat) — only if we know the customer
    if (customerId) {
      const [aliasRow] = await this.db
        .select({ itemId: customerSkuAliases.itemId })
        .from(customerSkuAliases)
        .where(
          and(
            eq(customerSkuAliases.tenantId, this.tenantId),
            eq(customerSkuAliases.customerId, customerId),
            eq(customerSkuAliases.aliasText, lower),
          ),
        )
        .limit(1);
      if (aliasRow) return { itemId: aliasRow.itemId, source: 'alias', confidence: 1.0 };
    }

    // 2. Fuzzy match on items.name OR exact SKU code (case-insensitive)
    const [nameRow] = await this.db
      .select({ id: items.id })
      .from(items)
      .where(
        and(
          eq(items.tenantId, this.tenantId),
          eq(items.isActive, true),
          or(ilike(items.name, `%${description}%`), ilike(items.sku, description)),
        ),
      )
      .limit(1);
    if (nameRow) return { itemId: nameRow.id, source: 'name_fuzzy', confidence: 0.7 };

    return { itemId: null, source: null, confidence: null };
  }

  private computeReview(
    extracted: ExtractedPo,
    customerMatch: CustomerMatch | null,
    lineMatches: LineMatch[],
  ): { reviewStatus: 'ready' | 'needs_review'; reviewFlags: ReviewFlag[] } {
    const flags: ReviewFlag[] = [];

    if (!customerMatch) {
      flags.push({ type: 'no_customer' });
    }

    lineMatches.forEach((m, i) => {
      if (!m.itemId) flags.push({ type: 'unmatched_sku', lineIndex: i });
    });

    if (extracted.confidence < 0.6) {
      flags.push({
        type: 'low_confidence',
        message: `extraction confidence ${extracted.confidence.toFixed(2)}`,
      });
    }

    return {
      reviewStatus: flags.length > 0 ? 'needs_review' : 'ready',
      reviewFlags: flags,
    };
  }

  private async persistDraft(args: {
    upload: PoUploadRow;
    extracted: ExtractedPo;
    customerMatch: CustomerMatch | null;
    lineMatches: LineMatch[];
    reviewStatus: 'ready' | 'needs_review';
    reviewFlags: ReviewFlag[];
  }): Promise<void> {
    const { upload, extracted, customerMatch, lineMatches, reviewStatus, reviewFlags } = args;

    // Compute totals from RESOLVED rates only — we don't trust LLM-extracted
    // amounts for invoicing, even when present. Lines without a resolved rate
    // contribute 0 to the subtotal (the user fills them in during review).
    let subtotal = 0;
    const linesToInsert = extracted.items.map((line, i) => {
      const match = lineMatches[i]!;
      const qty = line.quantity || 0;
      const rate = match.resolvedRate ?? 0;
      const amount = qty * rate;
      if (match.resolvedRate != null) subtotal += amount;
      return { line, match, qty, amount, lineIndex: i };
    });

    await this.db.transaction(async (tx) => {
      const [draft] = await tx
        .insert(poDrafts)
        .values({
          tenantId: this.tenantId,
          poUploadId: upload.id,
          customerId: customerMatch?.id ?? null,
          customerMatchSource: customerMatch?.source ?? null,
          customerMatchConfidence:
            customerMatch != null ? String(customerMatch.confidence) : null,
          buyerGstinRaw: extracted.buyerGstin,
          buyerNameRaw: extracted.buyerName,
          poNumberExtracted: extracted.poNumber,
          poDate: extracted.poDate,
          deliveryDate: extracted.deliveryDate,
          subtotal: subtotal > 0 ? String(subtotal.toFixed(2)) : null,
          taxTotal: null,
          grandTotal: subtotal > 0 ? String(subtotal.toFixed(2)) : null,
          rawExtraction: extracted as unknown as object,
          llmModel: LLM_MODEL,
          reviewStatus,
          reviewFlags: reviewFlags as unknown as object,
        })
        .returning();

      if (linesToInsert.length > 0) {
        await tx.insert(poDraftLines).values(
          linesToInsert.map(({ line, match, amount, lineIndex }) => ({
            tenantId: this.tenantId,
            poDraftId: draft!.id,
            lineIndex,
            rawDescription: line.description,
            rawQty: line.quantity != null ? String(line.quantity) : null,
            rawUom: line.uom,
            rawRate: line.rate != null ? String(line.rate) : null,
            matchedItemId: match.itemId,
            matchSource: match.source,
            matchConfidence: match.confidence != null ? String(match.confidence) : null,
            resolvedRate: match.resolvedRate != null ? String(match.resolvedRate) : null,
            resolvedUom: match.resolvedUom,
            taxCategory: null,
            amount:
              match.itemId && match.resolvedRate != null ? String(amount.toFixed(2)) : null,
            reviewFlag: match.itemId == null ? 'unmatched' : null,
          })),
        );
      }

      await tx
        .update(poUploads)
        .set({
          status: 'parsed',
          parsedAt: new Date(),
          errorMessage: null,
          updatedAt: new Date(),
        })
        .where(and(eq(poUploads.id, upload.id), eq(poUploads.tenantId, this.tenantId)));
    });
  }
}

// ─── Pure helpers ──────────────────────────────────────────────────────────

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function parseLLMResponse(rawText: string): ExtractedPo {
  const cleaned = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('AI returned invalid JSON');
  }

  return {
    buyerName: stringOrNull(parsed.buyerName),
    buyerGstin: stringOrNull(parsed.buyerGstin),
    buyerPhone: stringOrNull(parsed.buyerPhone),
    poNumber: stringOrNull(parsed.poNumber),
    poDate: dateOrNull(parsed.poDate),
    deliveryDate: dateOrNull(parsed.deliveryDate),
    items: Array.isArray(parsed.items)
      ? (parsed.items as unknown[]).map((it) => {
          const item = (it ?? {}) as Record<string, unknown>;
          return {
            description: String(item.description ?? '').trim() || 'Unknown item',
            quantity: numberOrZero(item.quantity),
            uom: stringOrNull(item.uom),
            rate: numberOrNull(item.rate),
            amount: numberOrNull(item.amount),
          };
        })
      : [],
    subtotal: numberOrNull(parsed.subtotal),
    totalAmount: numberOrNull(parsed.totalAmount),
    confidence: clampConfidence(parsed.confidence),
  };
}

function stringOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return trimmed === '' ? null : trimmed;
}

function dateOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  return trimmed;
}

function numberOrZero(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function numberOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function clampConfidence(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}
