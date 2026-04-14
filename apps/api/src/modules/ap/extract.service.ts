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
    // ── Layer 1: try local text extraction + heuristic parsing ────────
    const localResult = await this.tryLocalExtraction(buffer, mimeType);
    if (localResult) {
      const vendorMatch = await this.matchVendor(localResult);
      return { confidence: localResult.confidence, extracted: localResult, vendorMatch };
    }

    // ── Layer 2: fall back to Claude AI Vision ────────────────────────
    if (!isAIEnabled()) {
      throw new Error(
        'Could not extract invoice data locally (text too short or no recognisable layout). ' +
          'AI fallback requires ANTHROPIC_API_KEY to be set.',
      );
    }
    const base64 = buffer.toString('base64');
    const rawText = await this.callClaude(base64, mimeType);

    if (!rawText) {
      throw new Error('AI extraction returned empty response');
    }

    const extracted = this.parseResponse(rawText);
    const vendorMatch = await this.matchVendor(extracted);

    return { confidence: extracted.confidence, extracted, vendorMatch };
  }

  /**
   * Attempt local extraction: pdf-parse (text PDFs) or tesseract OCR
   * (images) → regex heuristic parser. Returns null when the extracted
   * text is too short or the parser can't find enough fields.
   */
  private async tryLocalExtraction(
    buffer: Buffer,
    mimeType: string,
  ): Promise<ExtractedInvoice | null> {
    let text: string | null = null;

    if (mimeType === PDF_MIME) {
      const pdf = await extractPdfText(buffer);
      if (pdf.hasUsableText) text = pdf.text;
    } else if (IMAGE_MIMES[mimeType]) {
      const ocr = await extractImageText(buffer);
      if (ocr.hasUsableText) text = ocr.text;
    }

    if (!text) return null;
    return tryLocalExtraction(text);
  }

  private async callClaude(
    base64: string,
    mimeType: string,
  ): Promise<string | null> {
    if (mimeType === PDF_MIME) {
      return extractFromPDF(
        base64,
        INVOICE_EXTRACTION_SYSTEM_PROMPT,
        INVOICE_EXTRACTION_USER_PROMPT,
      );
    }

    const mediaType = IMAGE_MIMES[mimeType];
    if (!mediaType) {
      throw new Error(`Unsupported file type: ${mimeType}`);
    }

    return extractFromImage(
      base64,
      mediaType,
      INVOICE_EXTRACTION_SYSTEM_PROMPT,
      INVOICE_EXTRACTION_USER_PROMPT,
    );
  }

  private parseResponse(rawText: string): ExtractedInvoice {
    const cleaned = rawText
      .replace(/^```json\s*/i, '')
      .replace(/```\s*$/, '')
      .trim();

    try {
      return JSON.parse(cleaned) as ExtractedInvoice;
    } catch {
      throw new Error('AI returned invalid JSON. Please try again.');
    }
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
