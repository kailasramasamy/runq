import type { Readable } from 'node:stream';
import { eq, and, or, ilike, sql } from 'drizzle-orm';
import {
  poUploads,
  poDrafts,
  poDraftLines,
  customers,
  customerSkuAliases,
  customerBuyerAliases,
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
import { tryLocalPoParse } from './po-local-parser';
import {
  PoTemplateService,
  computePoFingerprint,
  hintsFromExtraction,
  type PoTemplateHints,
} from './po-template.service';

const LLM_MODEL = 'claude-haiku-4-5-20251001';

const PDF_MIME = 'application/pdf';
const IMAGE_MIMES: Record<string, 'image/jpeg' | 'image/png' | 'image/webp'> = {
  'image/png': 'image/png',
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/webp': 'image/webp',
};
const TEXT_MIMES: ReadonlySet<string> = new Set(['text/plain', 'text/csv']);
const XLSX_MIMES: ReadonlySet<string> = new Set([
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

type PoUploadRow = typeof poUploads.$inferSelect;

export interface ExtractedItem {
  description: string;
  customerSku: string | null;
  quantity: number;
  uom: string | null;
  rate: number | null;
  amount: number | null;
  taxRatePct: number | null;
  taxableAmount: number | null;
  taxAmount: number | null;
}

interface ExtractedPo {
  buyerName: string | null;
  buyerGstin: string | null;
  buyerPhone: string | null;
  poNumber: string | null;
  poDate: string | null;
  deliveryDate: string | null;
  pricesIncludeTax: boolean | null;
  items: ExtractedItem[];
  subtotal: number | null;
  taxTotal: number | null;
  totalAmount: number | null;
  confidence: number;
}

interface CustomerMatch {
  id: string;
  source: 'alias' | 'gstin' | 'phone' | 'name_fuzzy';
  confidence: number;
}

export interface LineMatch {
  itemId: string | null;
  source: 'alias' | 'name_fuzzy' | null;
  confidence: number | null;
  resolvedRate: number | null;
  resolvedUom: string | null;
  /** Master GST % from items.gstRate when matched, else null. */
  itemGstRate: number | null;
}

interface ReviewFlag {
  type: 'no_customer' | 'unmatched_sku' | 'low_confidence' | 'qty_unreconciled';
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
    const upload = await this.loadUpload(uploadId);
    if (!upload) return;

    await this.markParsing(uploadId);

    try {
      const templates = new PoTemplateService(this.db, this.tenantId);

      // ── Layer 1: try local parsing (zero AI tokens) ─────────────────
      // Also fingerprint the buffer in the same pass so we can both
      // (a) enrich a successful local-parse with template hints (skipping
      //     LLM for repeat templates that locally extracted line items but
      //     didn't know the GST style), and
      // (b) save hints learned from the LLM-fallback path below.
      const loaded = await this.loadBuffer(upload);
      let fingerprintInfo: Awaited<ReturnType<typeof computePoFingerprint>> = null;
      let hints: PoTemplateHints | null = null;
      if (loaded) {
        fingerprintInfo = await computePoFingerprint(loaded.buffer, loaded.mime);
        if (fingerprintInfo) {
          hints = await templates.lookup(fingerprintInfo.fingerprint);
        }
      }

      const localResult = loaded ? await tryLocalPoParse(loaded.buffer, loaded.mime) : null;
      if (localResult) {
        const enriched = hints ? applyTemplateHints(localResult, hints) : localResult;
        if (hints && fingerprintInfo) {
          // Record the cache hit so the per-template use_count reflects
          // reality (handy for ops dashboards / quality reviews later).
          await templates.recordUse(fingerprintInfo.fingerprint);
        }
        const customerMatch = await this.matchCustomer(enriched);
        const lineMatches = await this.matchLines(enriched.items, customerMatch?.id ?? null);
        const qty = reconcileQuantities(enriched.items, lineMatches, enriched.pricesIncludeTax);
        const reconciled = { ...enriched, items: qty.items };
        const { reviewStatus, reviewFlags } = this.computeReview(
          reconciled, customerMatch, lineMatches, qty.unreconciled,
        );
        await this.persistDraft({ upload, extracted: reconciled, customerMatch, lineMatches, reviewStatus, reviewFlags });
        return;
      }

      // ── Layer 2: AI extraction ──────────────────────────────────────
      if (!isAIEnabled()) {
        await this.markParseError(
          uploadId,
          'Could not parse locally (unrecognised layout or scanned PDF). AI fallback requires ANTHROPIC_API_KEY.',
        );
        return;
      }

      const content = await this.loadContent(upload);
      const raw = await this.extract(content);
      const customerMatch = await this.matchCustomer(raw);
      const lineMatches = await this.matchLines(raw.items, customerMatch?.id ?? null);
      const qty = reconcileQuantities(raw.items, lineMatches, raw.pricesIncludeTax);
      const extracted = { ...raw, items: qty.items };
      const { reviewStatus, reviewFlags } = this.computeReview(
        extracted, customerMatch, lineMatches, qty.unreconciled,
      );
      await this.persistDraft({ upload, extracted, customerMatch, lineMatches, reviewStatus, reviewFlags });

      // Learn the template so the next PO from this sender skips the LLM.
      // Only save when extraction was decisive — low-confidence parses
      // would teach us the wrong layout.
      if (fingerprintInfo && extracted.confidence >= 0.7 && extracted.items.length > 0) {
        await templates.upsert({
          fingerprint: fingerprintInfo.fingerprint,
          format: fingerprintInfo.format,
          hints: hintsFromExtraction(extracted),
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Parsing failed';
      await this.markParseError(uploadId, message);
    }
  }

  /**
   * Pull the upload's bytes (either rawText or storage object) into a
   * single buffer so the parse + fingerprint passes don't each read from
   * storage. Returns null when the upload has no file content the local
   * parser knows how to handle (images, exotic mimes, missing data).
   */
  private async loadBuffer(upload: PoUploadRow): Promise<{ buffer: Buffer; mime: string } | null> {
    if (upload.rawText) {
      return { buffer: Buffer.from(upload.rawText, 'utf8'), mime: 'text/plain' };
    }
    if (!upload.storageKey || !upload.fileMime) return null;
    const mime = upload.fileMime.toLowerCase();
    const localMimes = new Set([
      ...XLSX_MIMES,
      'application/pdf',
      'text/plain',
      'text/csv',
    ]);
    if (!localMimes.has(mime)) return null;
    try {
      const stream = await this.storage.getStream(upload.storageKey);
      const buffer = await streamToBuffer(stream);
      return { buffer, mime };
    } catch {
      return null;
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
    // Prefer the original file for the AI fallback — vision/PDF extraction is
    // more accurate than re-parsing on-device OCR text. rawText only becomes
    // the AI source for genuine text-only uploads (pasted POs with no file).
    if (upload.rawText && (!upload.storageKey || !upload.fileMime)) {
      return { kind: 'text', data: upload.rawText };
    }

    if (!upload.storageKey || !upload.fileMime) {
      throw new Error('Upload has no file content or text');
    }

    const mime = upload.fileMime.toLowerCase();

    const stream = await this.storage.getStream(upload.storageKey);
    const buffer = await streamToBuffer(stream);

    // xlsx/xls → convert to CSV text for the AI text path
    if (XLSX_MIMES.has(mime)) {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
      const sheets: string[] = [];
      for (const name of wb.SheetNames) {
        const sheet = wb.Sheets[name];
        if (!sheet) continue;
        const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
        if (csv.trim()) sheets.push(csv);
      }
      return { kind: 'text' as const, data: sheets.join('\n\n') };
    }

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

  /**
   * Look up a previously-corrected mapping from buyer fingerprint →
   * customerId. Tries the GSTIN first (exact match, highest confidence),
   * then the normalized buyer name. This is the moat: every customer pick
   * the user makes feeds this table, so the SaaS gets sharper per tenant.
   */
  private async matchByBuyerAlias(extracted: ExtractedPo): Promise<CustomerMatch | null> {
    const candidates: Array<{ kind: 'name' | 'gstin'; text: string; conf: number }> = [];
    if (extracted.buyerGstin?.trim()) {
      candidates.push({ kind: 'gstin', text: extracted.buyerGstin.trim().toUpperCase(), conf: 1.0 });
    }
    if (extracted.buyerName?.trim()) {
      candidates.push({ kind: 'name', text: extracted.buyerName.trim().toLowerCase(), conf: 0.95 });
    }
    for (const c of candidates) {
      const [row] = await this.db
        .select({ customerId: customerBuyerAliases.customerId })
        .from(customerBuyerAliases)
        .where(
          and(
            eq(customerBuyerAliases.tenantId, this.tenantId),
            eq(customerBuyerAliases.aliasKind, c.kind),
            eq(customerBuyerAliases.aliasText, c.text),
          ),
        )
        .limit(1);
      if (row) {
        // Bump usage stats so popular aliases stay fresh in any future analytics.
        await this.db
          .update(customerBuyerAliases)
          .set({ useCount: sql`${customerBuyerAliases.useCount} + 1`, lastUsedAt: new Date() })
          .where(
            and(
              eq(customerBuyerAliases.tenantId, this.tenantId),
              eq(customerBuyerAliases.aliasKind, c.kind),
              eq(customerBuyerAliases.aliasText, c.text),
            ),
          );
        return { id: row.customerId, source: 'alias', confidence: c.conf };
      }
    }
    return null;
  }

  private async matchCustomer(extracted: ExtractedPo): Promise<CustomerMatch | null> {
    // 0. Buyer alias hit — if a user previously corrected the customer for
    // this exact buyer GSTIN or buyer name, trust their decision and skip
    // re-discovery. Highest confidence.
    const aliasHit = await this.matchByBuyerAlias(extracted);
    if (aliasHit) return aliasHit;

    // 1. Exact GSTIN match — highest confidence. When multiple customers
    // share the same GSTIN (e.g., same company with different channel
    // arrangements), use buyer name to disambiguate.
    if (extracted.buyerGstin) {
      const gstinRows = await this.db
        .select({ id: customers.id, name: customers.name })
        .from(customers)
        .where(
          and(
            eq(customers.tenantId, this.tenantId),
            eq(customers.gstin, extracted.buyerGstin),
            eq(customers.isActive, true),
          ),
        );
      if (gstinRows.length === 1) {
        return { id: gstinRows[0].id, source: 'gstin', confidence: 1.0 };
      }
      if (gstinRows.length > 1 && extracted.buyerName) {
        // Pick the one whose name best matches the PO buyer name
        const buyerNorm = extracted.buyerName.toLowerCase();
        let bestId = gstinRows[0].id;
        let bestScore = 0;
        for (const r of gstinRows) {
          const nameNorm = r.name.toLowerCase();
          // Exact substring or full match gets highest score
          const score = nameNorm === buyerNorm ? 1.0
            : buyerNorm.includes(nameNorm) || nameNorm.includes(buyerNorm) ? 0.9
            : 0;
          if (score > bestScore) { bestScore = score; bestId = r.id; }
        }
        return { id: bestId, source: 'gstin', confidence: bestScore > 0 ? bestScore : 0.6 };
      }
      if (gstinRows.length > 1) {
        // No buyer name to disambiguate — pick first but lower confidence
        return { id: gstinRows[0].id, source: 'gstin', confidence: 0.6 };
      }
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
      let itemGstRate: number | null = null;

      if (matched.itemId) {
        const [it] = await this.db
          .select({ unit: items.unit, gstRate: items.gstRate })
          .from(items)
          .where(and(eq(items.id, matched.itemId), eq(items.tenantId, this.tenantId)))
          .limit(1);
        resolvedUom = it?.unit ?? null;
        itemGstRate = it?.gstRate != null ? Number(it.gstRate) : null;

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
        itemGstRate,
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
    const sku = line.customerSku?.trim() ?? '';
    if (!description && !sku) return { itemId: null, source: null, confidence: null };

    // 1. Alias match (the moat). Try the customer's SKU code first since it's
    //    a deterministic identifier; fall back to the description only if no
    //    SKU was extracted. Both forms are stored lowercase.
    if (customerId) {
      const aliasCandidates = [sku, description].map((s) => s.toLowerCase()).filter((s) => s);
      for (const alias of aliasCandidates) {
        const [aliasRow] = await this.db
          .select({ itemId: customerSkuAliases.itemId })
          .from(customerSkuAliases)
          .where(
            and(
              eq(customerSkuAliases.tenantId, this.tenantId),
              eq(customerSkuAliases.customerId, customerId),
              eq(customerSkuAliases.aliasText, alias),
            ),
          )
          .limit(1);
        if (aliasRow) return { itemId: aliasRow.itemId, source: 'alias', confidence: 1.0 };
      }
    }

    // 2. Master-SKU exact match (case-insensitive) when the customer's PO
    //    happens to use our own SKU codes.
    if (sku) {
      const [skuRow] = await this.db
        .select({ id: items.id })
        .from(items)
        .where(
          and(
            eq(items.tenantId, this.tenantId),
            eq(items.isActive, true),
            ilike(items.sku, sku),
          ),
        )
        .limit(1);
      if (skuRow) return { itemId: skuRow.id, source: 'name_fuzzy', confidence: 0.85 };
    }

    // 3. Fuzzy match on items.name. Two passes:
    //    a) PO description CONTAINS the item name — handles the very common
    //       case where the PO line has extra qualifiers (brand, pack size,
    //       grade) around the canonical item name. e.g. PO line "Vrindavan
    //       A2 Desi Cow Milk 500 ml" matches item "A2 Desi Cow Milk".
    //       Item name must be at least 5 chars to avoid junk hits like the
    //       master containing a word like "Milk" matching every milk line.
    //    b) Item name CONTAINS the PO description — the original direction,
    //       as a fallback when the master happens to be more verbose.
    //    When (a) finds multiple candidates we pick the longest match (most
    //    specific item name), so "A2 Desi Cow Milk" wins over a hypothetical
    //    shorter "Cow Milk".
    if (description) {
      const candidates = await this.db
        .select({ id: items.id, name: items.name })
        .from(items)
        .where(
          and(
            eq(items.tenantId, this.tenantId),
            eq(items.isActive, true),
            sql`length(${items.name}) >= 5`,
            sql`lower(${description}) like '%' || lower(${items.name}) || '%'`,
          ),
        )
        .limit(20);
      if (candidates.length > 0) {
        const best = candidates.reduce((a, b) => (b.name.length > a.name.length ? b : a));
        return { itemId: best.id, source: 'name_fuzzy', confidence: 0.75 };
      }

      const [nameRow] = await this.db
        .select({ id: items.id })
        .from(items)
        .where(
          and(
            eq(items.tenantId, this.tenantId),
            eq(items.isActive, true),
            ilike(items.name, `%${description}%`),
          ),
        )
        .limit(1);
      if (nameRow) return { itemId: nameRow.id, source: 'name_fuzzy', confidence: 0.7 };
    }

    return { itemId: null, source: null, confidence: null };
  }

  private computeReview(
    extracted: ExtractedPo,
    customerMatch: CustomerMatch | null,
    lineMatches: LineMatch[],
    qtyUnreconciled: number[] = [],
  ): { reviewStatus: 'ready' | 'needs_review'; reviewFlags: ReviewFlag[] } {
    const flags: ReviewFlag[] = [];

    if (!customerMatch) {
      flags.push({ type: 'no_customer' });
    }

    lineMatches.forEach((m, i) => {
      if (!m.itemId) flags.push({ type: 'unmatched_sku', lineIndex: i });
    });

    // The line total doesn't divide by our price into a whole quantity, so we
    // can't tell what was actually ordered. Never guess this one — a wrong
    // quantity ships the wrong stock and invoices the wrong amount.
    qtyUnreconciled.forEach((i) => {
      flags.push({
        type: 'qty_unreconciled',
        lineIndex: i,
        message: 'quantity does not reconcile with the line total — confirm before approving',
      });
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
    //
    // GST: we capture per-line tax_rate_pct from the LLM (and a doc-level
    // pricesIncludeTax flag) so the draft's tax_total / grand_total can be
    // reconstructed consistently for both PO styles (inclusive vs exclusive).
    // The line's `amount` stays pre-tax (qty × resolved rate) so the existing
    // invoice-creation contract is unchanged.
    let subtotal = 0;
    let taxTotal = 0;
    const docInclusive = extracted.pricesIncludeTax;
    const linesToInsert = extracted.items.map((line, i) => {
      const match = lineMatches[i]!;
      const qty = line.quantity || 0;
      const rate = match.resolvedRate ?? 0;
      const amount = qty * rate;
      const taxPct = pickTaxRatePct(line, match.itemGstRate ?? null);
      if (match.resolvedRate != null) {
        subtotal += amount;
        if (taxPct != null) taxTotal += amount * (taxPct / 100);
      }
      const inclusiveFlag = docInclusive == null ? null : docInclusive ? 1 : 0;
      return { line, match, qty, amount, taxPct, inclusiveFlag, lineIndex: i };
    });
    const grandTotal = subtotal + taxTotal;

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
          poNumberExtracted: cleanPoNumber(extracted.poNumber),
          poDate: extracted.poDate,
          deliveryDate: extracted.deliveryDate,
          subtotal: subtotal > 0 ? String(subtotal.toFixed(2)) : null,
          taxTotal: taxTotal > 0 ? String(taxTotal.toFixed(2)) : null,
          grandTotal: grandTotal > 0 ? String(grandTotal.toFixed(2)) : null,
          rawExtraction: extracted as unknown as object,
          llmModel: LLM_MODEL,
          reviewStatus,
          reviewFlags: reviewFlags as unknown as object,
        })
        .returning();

      if (linesToInsert.length > 0) {
        await tx.insert(poDraftLines).values(
          linesToInsert.map(({ line, match, amount, taxPct, inclusiveFlag, lineIndex }) => ({
            tenantId: this.tenantId,
            poDraftId: draft!.id,
            lineIndex,
            rawDescription: line.description,
            customerSkuRaw: line.customerSku,
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
            taxRatePct: taxPct != null ? String(taxPct) : null,
            priceIncludesTax: inclusiveFlag,
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
    pricesIncludeTax: typeof parsed.pricesIncludeTax === 'boolean' ? parsed.pricesIncludeTax : null,
    items: Array.isArray(parsed.items)
      ? (parsed.items as unknown[]).map((it) => {
          const item = (it ?? {}) as Record<string, unknown>;
          return {
            description: cleanDescription(item.description),
            customerSku: stringOrNull(item.customerSku),
            quantity: numberOrZero(item.quantity),
            uom: stringOrNull(item.uom),
            rate: numberOrNull(item.rate),
            amount: numberOrNull(item.amount),
            taxRatePct: numberOrNull(item.taxRatePct),
            taxableAmount: numberOrNull(item.taxableAmount),
            taxAmount: numberOrNull(item.taxAmount),
          };
        })
      : [],
    subtotal: numberOrNull(parsed.subtotal),
    taxTotal: numberOrNull(parsed.taxTotal),
    totalAmount: numberOrNull(parsed.totalAmount),
    confidence: clampConfidence(parsed.confidence),
  };
}

/**
 * Trim neighbouring columns out of an extracted description.
 *
 * When a PO table carries columns we don't model (vendor, warehouse, buyer
 * code), the extractor tends to fold them into the product name along with the
 * tab that separated them — "Cow Milk 500ml \tVRINDAVAN". Left alone that text
 * becomes the alias we store against the customer, so the same product from a
 * differently-shaped PO never matches it again.
 */
export function cleanDescription(v: unknown): string {
  const firstColumn = String(v ?? '').split('\t')[0] ?? '';
  return firstColumn.replace(/\s+/g, ' ').trim() || 'Unknown item';
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

/**
 * Apply learned template hints to a local-parser result so the downstream
 * persistence step has the same shape it would have had from a fresh LLM
 * extraction. Specifically:
 *   - Fill in pricesIncludeTax (the local parser can't infer GST style).
 *   - Fill missing per-line taxRatePct with the template's default rate
 *     when one was learned. Per-line values already extracted by the local
 *     parser take precedence.
 */
function applyTemplateHints(po: ExtractedPo, hints: PoTemplateHints): ExtractedPo {
  const items = po.items.map((it) => ({
    ...it,
    taxRatePct: it.taxRatePct ?? hints.defaultTaxRatePct,
  }));
  return {
    ...po,
    pricesIncludeTax: po.pricesIncludeTax ?? hints.pricesIncludeTax,
    items,
  };
}

/**
 * Pick the GST rate to attach to a draft line, in priority order:
 *   1. items.gstRate from the master (when the line is matched). This is the
 *      authoritative rate for invoicing — `approve` builds the invoice from
 *      it and nothing else — so the draft must agree with it or the review
 *      screen previews a total the saved invoice won't match.
 *   2. Per-line taxRatePct from the PO (when the customer's PO has a GST%
 *      column per line — most B2B SaaS POs). Only for unmatched lines, so the
 *      UI can still show "subtotal + GST = total" before an item is picked.
 *   3. Per-line taxAmount ÷ taxableAmount when both are printed and the rate
 *      isn't.
 *   4. null — leave for the user to fill in during review.
 *
 * The customer's printed rate is deliberately NOT trusted over our own master:
 * POs routinely carry the wrong GST treatment (e.g. a 5% good billed as
 * exempt), and honouring that would let their mistake set our output tax.
 */
/** How far an implied quantity may sit from a whole number and still count. */
const QTY_TOLERANCE = 0.02;

/**
 * Recover line quantities from the PO's printed line total and our own price.
 *
 * Quantity is the least reliable field the extractor produces. PO tables vary
 * in column order — some print qty before rate, some after, some omit the UOM
 * column entirely — and when the extractor transposes the two, the result is
 * still self-consistent: qty × rate = amount holds either way round. So the
 * PO's own numbers cannot detect a swap.
 *
 * What we can trust is the printed line `amount` (unambiguously the last money
 * value on the row) and the rate WE resolved for the matched item. Dividing
 * one by the other recovers the quantity the customer actually ordered,
 * whichever column the extractor read it from.
 *
 * Lines that refuse to divide cleanly are reported so review can flag them
 * rather than silently guessing.
 */
export function reconcileQuantities(
  items: ExtractedItem[],
  lineMatches: LineMatch[],
  pricesIncludeTax: boolean | null,
): { items: ExtractedItem[]; corrected: number[]; unreconciled: number[] } {
  const corrected: number[] = [];
  const unreconciled: number[] = [];

  const next = items.map((item, i) => {
    const match = lineMatches[i];
    // Only matched lines have a price of ours to check against.
    if (!match?.itemId || match.resolvedRate == null || match.resolvedRate <= 0) return item;
    if (item.amount == null || item.amount <= 0) return item;

    // `amount` is printed on the PO's tax basis; resolvedRate is always
    // pre-tax, so gross it up before comparing against a Type A total.
    const unitPrice =
      pricesIncludeTax === true
        ? match.resolvedRate * (1 + (match.itemGstRate ?? 0) / 100)
        : match.resolvedRate;
    if (unitPrice <= 0) return item;

    const implied = item.amount / unitPrice;
    if (!Number.isFinite(implied) || implied <= 0) {
      unreconciled.push(i);
      return item;
    }
    // Already consistent — covers legitimately fractional quantities (2.5 kg)
    // that the extractor read correctly.
    if (Math.abs(implied - item.quantity) <= QTY_TOLERANCE) return item;

    const nearest = Math.round(implied);
    if (nearest >= 1 && Math.abs(implied - nearest) <= QTY_TOLERANCE) {
      corrected.push(i);
      return { ...item, quantity: nearest };
    }
    unreconciled.push(i);
    return item;
  });

  return { items: next, corrected, unreconciled };
}

function pickTaxRatePct(line: ExtractedItem, itemGstRate: number | null): number | null {
  if (itemGstRate != null && Number.isFinite(itemGstRate) && itemGstRate >= 0) {
    return Number(itemGstRate.toFixed(2));
  }
  if (line.taxRatePct != null && Number.isFinite(line.taxRatePct) && line.taxRatePct >= 0) {
    return Number(line.taxRatePct.toFixed(2));
  }
  if (
    line.taxableAmount != null && line.taxableAmount > 0 &&
    line.taxAmount != null && line.taxAmount > 0
  ) {
    const pct = (line.taxAmount / line.taxableAmount) * 100;
    if (Number.isFinite(pct) && pct >= 0 && pct < 100) {
      return Number(pct.toFixed(2));
    }
  }
  return null;
}

// Some POs have the literal heading "PO" / "PO #" / "PO No." standing alone
// where a real number should be — the LLM occasionally returns those instead
// of null. Strip noise so the UI shows nothing rather than a misleading "PO".
function cleanPoNumber(v: string | null): string | null {
  if (v == null) return null;
  let trimmed = v.trim();
  // Strip a trailing label fragment (e.g. "PO Number") only when it is
  // separated from the actual value by whitespace — so "PO Number 12345"
  // becomes "12345" but "PO-20260509-014" (the actual number) is kept
  // intact.
  trimmed = trimmed.replace(/^(po|p\.o|po\s*#|po\s*no\.?|purchase\s*order(?:\s*(?:no\.?|number))?)[ \t]+(?=\S)/i, '').trim();
  if (!trimmed) return null;
  // Reject when the entire value was a heading or just punctuation/letters
  // with no digits (e.g. "PO", "Order", "—"). A real PO number has at
  // least one digit somewhere.
  if (!/\d/.test(trimmed)) return null;
  return trimmed;
}
