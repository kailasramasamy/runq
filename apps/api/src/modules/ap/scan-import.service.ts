import { eq, and, ilike, isNull } from 'drizzle-orm';
import { vendors } from '@runq/db';
import type { Db } from '@runq/db';
import { ExtractService, type ExtractionResult } from './extract.service';
import { PurchaseInvoiceService } from './purchase-invoice.service';

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
  ): Promise<ScanImportResult> {
    const extractService = new ExtractService(this.db, this.tenantId);
    const extraction = await extractService.extractFromFile(buffer, mimeType, fileName);
    return this.commitExtracted(extraction.extracted, extraction.vendorMatch?.id, extraction);
  }

  /** Commit a previously extracted (and possibly edited) invoice */
  async commitExtracted(
    extracted: ExtractedInvoice,
    existingVendorId?: string,
    extraction?: ExtractionResult,
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

    // Auto-create vendor
    const gstin = extracted.vendorGstin;
    const stateCode = gstin ? gstin.slice(0, 2) : null;
    const stateName = stateCode ? STATE_CODES[stateCode] : null;

    const [newVendor] = await this.db.insert(vendors).values({
      tenantId: this.tenantId,
      name: extracted.vendorName || 'Unknown Vendor',
      gstin: gstin ?? null,
      state: stateName ?? null,
      category: 'other',
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

const STATE_CODES: Record<string, string> = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
  '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur',
  '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
  '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh',
  '24': 'Gujarat', '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa',
  '32': 'Kerala', '33': 'Tamil Nadu', '36': 'Telangana', '37': 'Andhra Pradesh',
};
