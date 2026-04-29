import { eq, and, ilike, isNull } from 'drizzle-orm';
import { vendors } from '@runq/db';
import type { Db } from '@runq/db';
import {
  extractFromPDF,
  extractFromImage,
  isAIEnabled,
} from '../../utils/ai/claude.service';
import {
  INVOICE_EXTRACTION_SYSTEM_PROMPT,
  INVOICE_EXTRACTION_USER_PROMPT,
} from '../../utils/ai/prompts/invoice-extraction';
import { extractPdfText } from '../ar/invoice-import/extractors/pdf-text';
import { extractImageText } from '../ar/invoice-import/extractors/image-ocr';
import { tryLocalExtraction } from './local-extract';
import { lookupItemAliases } from './vendor-item-aliases.service';
import {
  buildVendorContext,
  findVendorInText,
  renderVendorContextForPrompt,
} from './vendor-extraction-context.service';

interface ExtractedItem {
  itemName: string;
  hsnSacCode: string | null;
  quantity: number;
  unitPrice: number;
  amount: number;
  taxRate: number | null;
  taxCategory: string | null;
}

interface ExtractedInvoice {
  vendorName: string;
  vendorGstin: string | null;
  vendorPan: string | null;
  vendorPhone: string | null;
  vendorEmail: string | null;
  vendorAddress: string | null;
  vendorCity: string | null;
  vendorState: string | null;
  vendorPincode: string | null;
  vendorBankAccount: string | null;
  vendorBankIfsc: string | null;
  vendorBankName: string | null;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string | null;
  items: ExtractedItem[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  tdsSection: string | null;
  confidence: number;
}

interface VendorMatch {
  id: string;
  name: string;
  matchType: 'gstin' | 'name';
}

export interface ExtractionResult {
  confidence: number;
  extracted: ExtractedInvoice;
  vendorMatch: VendorMatch | null;
}

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp';

const PDF_MIME = 'application/pdf';
const IMAGE_MIMES: Record<string, ImageMediaType> = {
  'image/png': 'image/png',
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
};

export class ExtractService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  /**
   * Extract invoice data from a file. Tries local extraction first
   * (pdf-parse for text PDFs, tesseract OCR for images → regex-based
   * parser), then falls back to Claude AI Vision for scanned PDFs,
   * blurry images, and unrecognised layouts.
   *
   * The goal is to handle the common case (text-based vendor invoices)
   * without burning AI tokens — same cascade pattern as the AR import
   * flow.
   */
  async extractFromFile(
    buffer: Buffer,
    mimeType: string,
    _fileName: string,
  ): Promise<ExtractionResult> {
    // Always extract text up front. Used by the heuristic parser AND
    // (when we fall back to AI) to identify the vendor cheaply via GSTIN
    // before the LLM call so we can ground the prompt with vendor context.
    const text = await this.extractText(buffer, mimeType);

    // ── Layer 1: try heuristic parser on the extracted text ───────────
    const localResult = text ? tryLocalExtraction(text) : null;
    if (localResult) {
      const vendorMatch = await this.matchVendor(localResult);
      const enriched = await this.applyItemAliases(localResult, vendorMatch?.id);
      return { confidence: enriched.confidence, extracted: enriched, vendorMatch };
    }

    // ── Layer 2: fall back to Claude AI Vision ────────────────────────
    if (!isAIEnabled()) {
      throw new Error(
        'Could not extract invoice data locally (text too short or no recognisable layout). ' +
          'AI fallback requires ANTHROPIC_API_KEY to be set.',
      );
    }

    // Pre-identify vendor from the raw text (GSTIN regex). When found,
    // build a context block from past corrections + item aliases and
    // fold it into the user prompt. The LLM then has tenant-specific
    // grounding.
    let userPrompt = INVOICE_EXTRACTION_USER_PROMPT;
    let preIdentifiedVendorId: string | undefined;
    if (text) {
      const found = await findVendorInText(this.db, this.tenantId, text);
      if (found) {
        preIdentifiedVendorId = found.id;
        const ctx = await buildVendorContext(this.db, this.tenantId, found.id);
        if (ctx && (ctx.topItems.length > 0 || ctx.recentHeaders.length > 0)) {
          userPrompt = `${renderVendorContextForPrompt(ctx)}\n\n---\n\n${INVOICE_EXTRACTION_USER_PROMPT}`;
        }
      }
    }

    const base64 = buffer.toString('base64');
    const rawText = await this.callClaude(base64, mimeType, userPrompt);

    if (!rawText) {
      throw new Error('AI extraction returned empty response');
    }

    const extracted = this.parseResponse(rawText);
    const vendorMatch =
      (preIdentifiedVendorId
        ? { id: preIdentifiedVendorId, name: extracted.vendorName, matchType: 'gstin' as const }
        : null) ?? (await this.matchVendor(extracted));
    const enriched = await this.applyItemAliases(extracted, vendorMatch?.id);

    return { confidence: enriched.confidence, extracted: enriched, vendorMatch };
  }

  /** Extract raw text from PDF/image (pdf-parse / OCR). Returns null when nothing usable. */
  private async extractText(buffer: Buffer, mimeType: string): Promise<string | null> {
    if (mimeType === PDF_MIME) {
      const pdf = await extractPdfText(buffer);
      return pdf.hasUsableText ? pdf.text : null;
    }
    if (IMAGE_MIMES[mimeType]) {
      const ocr = await extractImageText(buffer);
      return ocr.hasUsableText ? ocr.text : null;
    }
    return null;
  }

  /**
   * Overlay vendor-scoped item aliases onto the extracted line items.
   * For each item, if AI didn't find an HSN/tax rate but we've seen this
   * exact description from this vendor before, fill it in. AI-provided
   * values are preserved — aliases only fill gaps, never overwrite.
   */
  private async applyItemAliases(
    extracted: ExtractedInvoice,
    vendorId: string | undefined,
  ): Promise<ExtractedInvoice> {
    if (!vendorId || extracted.items.length === 0) return extracted;

    const aliases = await lookupItemAliases(
      this.db,
      this.tenantId,
      vendorId,
      extracted.items.map((i) => i.itemName),
    );
    if (aliases.size === 0) return extracted;

    return {
      ...extracted,
      items: extracted.items.map((item) => {
        const hint = aliases.get(item.itemName);
        if (!hint) return item;
        return {
          ...item,
          hsnSacCode: item.hsnSacCode ?? hint.hsnSacCode,
          taxRate: item.taxRate ?? hint.taxRate,
          taxCategory: item.taxCategory ?? hint.taxCategory,
        };
      }),
    };
  }

  private async callClaude(
    base64: string,
    mimeType: string,
    userPrompt: string,
  ): Promise<string | null> {
    if (mimeType === PDF_MIME) {
      return extractFromPDF(base64, INVOICE_EXTRACTION_SYSTEM_PROMPT, userPrompt);
    }

    const mediaType = IMAGE_MIMES[mimeType];
    if (!mediaType) {
      throw new Error(`Unsupported file type: ${mimeType}`);
    }

    return extractFromImage(base64, mediaType, INVOICE_EXTRACTION_SYSTEM_PROMPT, userPrompt);
  }

  private parseResponse(rawText: string): ExtractedInvoice {
    const cleaned = rawText
      .replace(/^```json\s*/i, '')
      .replace(/```\s*$/, '')
      .trim();

    let parsed: ExtractedInvoice;
    try {
      parsed = JSON.parse(cleaned) as ExtractedInvoice;
    } catch {
      throw new Error('AI returned invalid JSON. Please try again.');
    }

    return this.sanitizeAmounts(parsed);
  }

  /**
   * Catch absurd amounts the AI sometimes hallucinates from fuel-pump
   * totalizer readings, OCR garbage, or transcribed metadata. We don't
   * try to "fix" the values — we null them out and lower confidence so
   * the user is forced to enter the correct amounts.
   */
  private sanitizeAmounts(extracted: ExtractedInvoice): ExtractedInvoice {
    const total = Number(extracted.totalAmount) || 0;
    const tax = Number(extracted.taxAmount) || 0;
    const sub = Number(extracted.subtotal) || 0;

    let confidence = extracted.confidence;
    let taxAmount = extracted.taxAmount;
    let subtotal = extracted.subtotal;
    let totalAmount = extracted.totalAmount;

    // Tax > 35% of total → almost certainly wrong (legal max GST is 28%).
    if (total > 0 && tax / total > 0.35) {
      taxAmount = 0;
      confidence = Math.min(confidence, 0.4);
    }

    // Tax bigger than total in absolute terms.
    if (tax > total && total > 0) {
      taxAmount = 0;
      confidence = Math.min(confidence, 0.4);
    }

    // Subtotal + tax wildly off from total (>₹2 mismatch on values < ₹1Cr).
    if (total > 0 && total < 10_000_000) {
      const computedTotal = sub + tax;
      if (computedTotal > 0 && Math.abs(computedTotal - total) > 2) {
        // Trust the printed total, blank the components.
        subtotal = 0;
        taxAmount = 0;
        confidence = Math.min(confidence, 0.5);
      }
    }

    // Insanely large totals on what looks like a retail receipt — likely
    // a fuel-pump meter misread. Cap confidence so the UI flags it.
    if (total > 5_000_000 && (extracted.items?.length ?? 0) <= 2) {
      confidence = Math.min(confidence, 0.3);
    }

    return { ...extracted, taxAmount, subtotal, totalAmount, confidence };
  }

  private async matchVendor(
    extracted: ExtractedInvoice,
  ): Promise<VendorMatch | null> {
    if (extracted.vendorGstin) {
      const match = await this.findByGstin(extracted.vendorGstin);
      if (match) return match;
    }

    if (extracted.vendorName) {
      return this.findByName(extracted.vendorName);
    }

    return null;
  }

  private async findByGstin(gstin: string): Promise<VendorMatch | null> {
    const [row] = await this.db
      .select({ id: vendors.id, name: vendors.name })
      .from(vendors)
      .where(
        and(
          eq(vendors.tenantId, this.tenantId),
          eq(vendors.gstin, gstin),
          isNull(vendors.deletedAt),
        ),
      )
      .limit(1);

    return row ? { id: row.id, name: row.name, matchType: 'gstin' } : null;
  }

  private async findByName(name: string): Promise<VendorMatch | null> {
    const [row] = await this.db
      .select({ id: vendors.id, name: vendors.name })
      .from(vendors)
      .where(
        and(
          eq(vendors.tenantId, this.tenantId),
          ilike(vendors.name, `%${name}%`),
          isNull(vendors.deletedAt),
        ),
      )
      .limit(1);

    return row ? { id: row.id, name: row.name, matchType: 'name' } : null;
  }
}
