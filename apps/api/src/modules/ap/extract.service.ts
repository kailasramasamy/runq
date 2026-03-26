import { eq, and, ilike, isNull } from 'drizzle-orm';
import { vendors } from '@runq/db';
import type { Db } from '@runq/db';
import {
  extractFromPDF,
  extractFromImage,
} from '../../utils/ai/claude.service';
import {
  INVOICE_EXTRACTION_SYSTEM_PROMPT,
  INVOICE_EXTRACTION_USER_PROMPT,
} from '../../utils/ai/prompts/invoice-extraction';

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

  async extractFromFile(
    buffer: Buffer,
    mimeType: string,
    _fileName: string,
  ): Promise<ExtractionResult> {
    const base64 = buffer.toString('base64');
    const rawText = await this.callClaude(base64, mimeType);

    if (!rawText) {
      throw new Error('AI extraction returned empty response');
    }

    const extracted = this.parseResponse(rawText);
    const vendorMatch = await this.matchVendor(extracted);

    return { confidence: extracted.confidence, extracted, vendorMatch };
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
