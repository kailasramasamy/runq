import { eq, and, ilike, isNull } from 'drizzle-orm';
import { vendors } from '@runq/db';
import type { Db } from '@runq/db';
import { ExtractService, type ExtractionResult } from './extract.service';
import { PurchaseInvoiceService } from './purchase-invoice.service';
import { recordExtractionCorrection } from '../common/extraction-corrections.service';
import { recordItemAliasesFromBill } from './vendor-item-aliases.service';

interface ScanImportResult {
  extraction: ExtractionResult;
  vendorCreated: boolean;
  vendorId: string;
  vendorName: string;
  billId: string;
  billNumber: string;
}

interface ExtractedInvoice {
  vendorName: string;
  vendorGstin: string | null;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string | null;
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
  items: {
    itemName: string;
    hsnSacCode: string | null;
    quantity: number;
    unitPrice: number;
    amount: number;
    taxRate: number | null;
    taxCategory: string | null;
  }[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  tdsSection: string | null;
  confidence: number;
}

export class ScanImportService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  /** One-shot: extract from file → resolve/create vendor → create bill */
  async scanAndImport(
    buffer: Buffer,
    mimeType: string,
    fileName: string,
    createdBy?: string | null,
  ): Promise<ScanImportResult> {
    const extractService = new ExtractService(this.db, this.tenantId);
    const extraction = await extractService.extractFromFile(buffer, mimeType, fileName);
    // No user edits in one-shot path; aiOutput == userOutput. Still log so
    // we can track AI baseline accuracy and template usage per vendor.
    return this.commitExtracted(extraction.extracted, extraction.vendorMatch?.id, extraction, createdBy);
  }

  /** Commit a previously extracted (and possibly edited) invoice */
  async commitExtracted(
    extracted: ExtractedInvoice,
    existingVendorId?: string,
    extraction?: ExtractionResult,
    createdBy?: string | null,
  ): Promise<ScanImportResult> {
    // Resolve or create vendor
    const { vendorId, vendorCreated, vendorName } = existingVendorId
      ? { vendorId: existingVendorId, vendorCreated: false, vendorName: extracted.vendorName }
      : await this.resolveOrCreateVendor(extracted);

    // Create the bill
    const invoiceService = new PurchaseInvoiceService(this.db, this.tenantId);
    const today = new Date().toISOString().split('T')[0]!;

    const bill = await invoiceService.create({
      vendorId,
      invoiceNumber: extracted.invoiceNumber,
      invoiceDate: extracted.invoiceDate || today,
      dueDate: extracted.dueDate || today,
      items: extracted.items.map((item) => ({
        itemName: item.itemName,
        hsnSacCode: item.hsnSacCode ?? undefined,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        amount: item.amount,
        taxRate: item.taxRate ?? undefined,
        taxCategory: (item.taxCategory as any) ?? undefined,
      })),
      subtotal: extracted.subtotal,
      taxAmount: extracted.taxAmount,
      totalAmount: extracted.totalAmount,
      reverseCharge: false,
      tdsSection: extracted.tdsSection ?? undefined,
    });

    // Capture the user's diff for analytics + future template/alias mining.
    // When the caller passes the AI's raw output via `extraction`, we diff
    // against the (possibly edited) `extracted`. If no AI output was passed
    // we still log a row with both blobs equal — useful as a baseline.
    const aiOutput = (extraction?.extracted ?? extracted) as unknown as Record<string, unknown>;
    const userOutput = extracted as unknown as Record<string, unknown>;
    await recordExtractionCorrection(this.db, {
      tenantId: this.tenantId,
      documentType: 'ap_bill',
      sourceEntityType: 'purchase_invoice',
      sourceEntityId: bill.id,
      vendorId,
      aiOutput,
      userOutput,
      aiConfidence: extracted.confidence ?? null,
      extractionMethod: 'ai',
      createdBy: createdBy ?? null,
    });

    // Mine per-vendor item aliases from the saved line items. Next time
    // this vendor sends an invoice with the same item description, we
    // pre-fill the user-confirmed HSN/tax instead of relying on AI alone.
    await recordItemAliasesFromBill(this.db, this.tenantId, vendorId, extracted.items);

    return {
      extraction: extraction ?? { confidence: extracted.confidence, extracted, vendorMatch: null },
      vendorCreated,
      vendorId,
      vendorName,
      billId: bill.id,
      billNumber: bill.invoiceNumber,
    };
  }

  private async resolveOrCreateVendor(extracted: ExtractedInvoice): Promise<{
    vendorId: string;
    vendorCreated: boolean;
    vendorName: string;
  }> {
    // Try GSTIN match first
    if (extracted.vendorGstin) {
      const [row] = await this.db.select({ id: vendors.id, name: vendors.name })
        .from(vendors)
        .where(and(eq(vendors.tenantId, this.tenantId), eq(vendors.gstin, extracted.vendorGstin), isNull(vendors.deletedAt)))
        .limit(1);
      if (row) return { vendorId: row.id, vendorCreated: false, vendorName: row.name };
    }

    // Try name match
    if (extracted.vendorName) {
      const [row] = await this.db.select({ id: vendors.id, name: vendors.name })
        .from(vendors)
        .where(and(eq(vendors.tenantId, this.tenantId), ilike(vendors.name, extracted.vendorName), isNull(vendors.deletedAt)))
        .limit(1);
      if (row) return { vendorId: row.id, vendorCreated: false, vendorName: row.name };
    }

    // Auto-create vendor with all extracted details
    const gstin = extracted.vendorGstin;
    const stateCode = gstin ? gstin.slice(0, 2) : null;
    const stateName = extracted.vendorState || (stateCode ? STATE_CODES[stateCode] : null);

    const [newVendor] = await this.db.insert(vendors).values({
      tenantId: this.tenantId,
      name: extracted.vendorName || 'Unknown Vendor',
      gstin: gstin ?? null,
      pan: extracted.vendorPan ?? null,
      email: extracted.vendorEmail ?? null,
      phone: extracted.vendorPhone ?? null,
      addressLine1: extracted.vendorAddress ?? null,
      city: extracted.vendorCity ?? null,
      state: stateName ?? null,
      pincode: extracted.vendorPincode ?? null,
      bankAccountNumber: extracted.vendorBankAccount ?? null,
      bankIfsc: extracted.vendorBankIfsc ?? null,
      bankName: extracted.vendorBankName ?? null,
      category: inferVendorCategory(extracted),
      paymentTermsDays: 30,
      isActive: true,
    }).returning();

    return {
      vendorId: newVendor!.id,
      vendorCreated: true,
      vendorName: newVendor!.name,
    };
  }
}

/**
 * Heuristic categorization for auto-created vendors. Lets the UI group
 * dealer-level vendors under a recognisable label ("Indian Oil pump on
 * MG Road" → category: 'fuel') while still keeping each GSTIN as its
 * own vendor record (mandatory for ITC). Defaults to 'other' on no match.
 */
function inferVendorCategory(extracted: ExtractedInvoice): string {
  const haystack = [
    extracted.vendorName,
    extracted.vendorAddress,
    ...(extracted.items?.map((i) => i.itemName) ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const hsns = (extracted.items ?? []).map((i) => (i.hsnSacCode ?? '').replace(/\D/g, ''));

  // Petroleum HSN family — 2710 covers petrol, diesel, kerosene, ATF.
  if (hsns.some((h) => h.startsWith('2710'))) return 'fuel';

  if (
    /\b(petrol(eum)?|diesel|hsd|petrol pump|filling station|fuel station|petro|gas station)\b/.test(haystack) ||
    /\b(iocl|hpcl|bpcl|reliance petroleum|nayara|shell)\b/.test(haystack)
  ) {
    return 'fuel';
  }

  if (/\b(courier|logistics|cargo|transport|freight|shipping|fedex|dtdc|bluedart|delhivery)\b/.test(haystack)) {
    return 'logistics';
  }

  if (/\b(electricity|power|kseb|bescom|tata power|adani electric|reliance energy)\b/.test(haystack)) {
    return 'utilities';
  }

  if (/\b(telecom|airtel|jio|vodafone|bsnl|broadband|internet)\b/.test(haystack)) {
    return 'utilities';
  }

  return 'other';
}

const STATE_CODES: Record<string, string> = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
  '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur',
  '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
  '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh',
  '24': 'Gujarat', '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa',
  '32': 'Kerala', '33': 'Tamil Nadu', '36': 'Telangana', '37': 'Andhra Pradesh',
};
