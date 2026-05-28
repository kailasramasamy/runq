import { and, eq, sql, inArray } from 'drizzle-orm';
import {
  purchaseInvoices, purchaseInvoiceItems,
  inventoryGrns, inventoryGrnLines,
  purchaseOrdersV2, purchaseOrderLinesV2,
  vendorCatalogItems, vendors, tenants,
  items as itemsTable,
  inventorySerials,
  normaliseCatalogDescription,
} from '@runq/db';
import type { Db } from '@runq/db';
import type { Redis } from 'ioredis';
import { ExtractService, type ExtractionResult } from '../ap/extract.service';
import { ExtractionStagingService, type StagedExtraction } from '../ap/extraction-staging.service';
import { GLService } from '../gl/gl.service';
import { StockLedgerService } from '../inventory/stock-ledger.service';
import { AttachmentService } from '../common/attachment.service';
import { getStorageProvider } from '../../utils/storage';
import { nextDocNo } from '../inventory/sequence';
import {
  calculateLineItemTax, calculateInvoiceTax,
  determinePlaceOfSupply, resolveStateCode,
} from '../../utils/gst-calculator';
import type { TaxBreakdown, TaxCategory } from '@runq/types';
import { NotFoundError, ConflictError } from '../../utils/errors';
import type { ScanReceiveAgainstPoInput } from '@runq/validators';

/**
 * PP Phase 5 — Scan vendor invoice while receiving against a PO.
 *
 * Why this exists:
 *   PO carries the buyer's commitment (negotiated qty/rate). Reality at the
 *   gate is whatever the vendor delivered + invoiced — often different qty,
 *   different rate, sometimes extra lines. The PO numbers should NOT drive
 *   the JE; the vendor's invoice should. This service runs the scan, maps
 *   extracted lines to the open PO, and posts one combined transaction:
 *
 *     - purchase_invoices row (vendor's totals, matched_po_id = poId)
 *     - inventory_grns row (source='po_with_bill', BOTH po_id + bill_id)
 *     - stock ledger movements
 *     - PO line counters (qty_received AND qty_billed) + status transition
 *     - Single JE: Dr Inventory / Cr AP-Vendor (via GLService bill path)
 *
 *   No GRNI clearing. No 3-way match required (this IS the match).
 *
 * Off-PO lines (vendor delivered a substitution / extra) are accepted,
 * flagged is_off_po=true on the GRN line, and post into bill + inventory
 * normally. Variance reports can mine these later.
 */

export interface SuggestedLine {
  poLineId: string | null;
  catalogItemId: string | null;
  catalogDescription: string;
  vendorQty: number;
  vendorRate: number;
  vendorTaxRate: number | null;
  vendorHsnSacCode: string | null;
  poQty: number | null;
  poRate: number | null;
  isOffPo: boolean;
}

export interface ScanPreviewResult {
  extractionId: string;
  extracted: ExtractionResult['extracted'];
  vendorMatch: ExtractionResult['vendorMatch'];
  vendorMismatch: boolean;
  suggestedLines: SuggestedLine[];
}

export interface ScanCommitResult {
  billId: string;
  billNumber: string;
  grnId: string;
  grnNo: string;
  newPoStatus: string;
  offPoLineCount: number;
}

export class ScanReceiveService {
  constructor(
    private readonly db: Db,
    private readonly redis: Redis,
    private readonly tenantId: string,
    private readonly userId: string,
  ) {}

  async previewScan(
    poId: string, buffer: Buffer, mimeType: string, fileName: string,
  ): Promise<ScanPreviewResult> {
    const po = await this.fetchPoOrThrow(poId);
    const extractService = new ExtractService(this.db, this.tenantId);
    const extraction = await extractService.extractFromFile(buffer, mimeType, fileName);

    const staging = new ExtractionStagingService(this.redis, getStorageProvider());
    const { extractionId } = await staging.stage({
      tenantId: this.tenantId, fileName, mimeType, data: buffer,
    });

    const suggestedLines = await this.mapLinesToCatalog(poId, extraction.extracted.items);
    const vendorMismatch = !!extraction.vendorMatch && extraction.vendorMatch.id !== po.vendorId;

    return { extractionId, extracted: extraction.extracted, vendorMatch: extraction.vendorMatch, vendorMismatch, suggestedLines };
  }

  async commitScan(poId: string, input: ScanReceiveAgainstPoInput): Promise<ScanCommitResult> {
    const po = await this.fetchPoOrThrow(poId);

    // Validate every poLineId belongs to this PO. Existing catalog rows are
    // loaded eagerly; off-PO lines without a catalog match get a fresh row
    // minted inside the transaction below (see `resolveOrCreateCatalog`).
    const poLineIds = input.lines.map((l) => l.poLineId).filter((id): id is string => !!id);
    const poLineMap = await this.loadPoLineMap(poId, poLineIds);
    const existingCatalogIds = input.lines
      .map((l) => l.catalogItemId)
      .filter((id): id is string => !!id);
    const catalogMap = await this.loadCatalogMap(po.vendorId, existingCatalogIds);

    const result = await this.db.transaction(async (tx) => {
      const billNumber = input.vendorInvoice.invoiceNumber;

      // For off-PO lines without an existing catalog row, mint one now so
      // the GRN line has the FK it needs (the `inv_grn_lines_item_or_catalog`
      // CHECK constraint requires either item_id or catalog_item_id) and
      // future receipts of the same description auto-match.
      const resolvedCatalogIds = await Promise.all(input.lines.map(async (l) => {
        if (l.catalogItemId) return l.catalogItemId;
        return this.resolveOrCreateCatalog(tx as unknown as Db, po.vendorId, l, catalogMap);
      }));
      const gst = await this.computeGst(tx as unknown as Db, po.vendorId, input);

      // ── 1. Bill row ──────────────────────────────────────────────────
      const [bill] = await tx
        .insert(purchaseInvoices)
        .values({
          tenantId: this.tenantId,
          vendorId: po.vendorId,
          invoiceNumber: billNumber,
          invoiceDate: input.vendorInvoice.invoiceDate,
          dueDate: input.vendorInvoice.dueDate ?? input.vendorInvoice.invoiceDate,
          subtotal: String(input.vendorInvoice.subtotal),
          taxAmount: String(input.vendorInvoice.taxAmount),
          totalAmount: String(input.vendorInvoice.totalAmount),
          amountPaid: '0',
          balanceDue: String(input.vendorInvoice.totalAmount),
          status: 'approved',
          placeOfSupply: input.vendorInvoice.placeOfSupply ?? gst.placeOfSupply?.placeOfSupplyCode ?? null,
          isInterState: input.vendorInvoice.isInterState ?? gst.placeOfSupply?.isInterState ?? false,
          cgstAmount: String(gst.summary.cgstAmount),
          sgstAmount: String(gst.summary.sgstAmount),
          igstAmount: String(gst.summary.igstAmount),
          cessAmount: String(gst.summary.cessAmount),
          reverseCharge: input.vendorInvoice.reverseCharge ?? false,
          tdsSection: input.vendorInvoice.tdsSection ?? null,
          tdsAmount: String(input.vendorInvoice.tdsAmount ?? 0),
          warehouseId: input.warehouseId,
          goodsReceived: true,
          matchedPoId: poId,
        })
        .returning();

      const billId = bill!.id;
      await tx.insert(purchaseInvoiceItems).values(input.lines.map((l, i) => {
        const catalogId = resolvedCatalogIds[i]!;
        const cat = catalogMap.get(catalogId)!;
        const tax = gst.itemTaxes[i]!;
        const amount = l.qty * l.unitRate;
        return {
          tenantId: this.tenantId,
          invoiceId: billId,
          itemName: l.description ?? cat.description,
          quantity: String(l.qty),
          unitPrice: String(l.unitRate),
          amount: String(Math.round(amount * 100) / 100),
          hsnSacCode: l.hsnSacCode ?? cat.hsnSacCode ?? null,
          taxRate: l.taxRate != null ? String(l.taxRate) : null,
          cgstRate: String(tax.cgstRate), cgstAmount: String(tax.cgstAmount),
          sgstRate: String(tax.sgstRate), sgstAmount: String(tax.sgstAmount),
          igstRate: String(tax.igstRate), igstAmount: String(tax.igstAmount),
          cessRate: String(tax.cessRate), cessAmount: String(tax.cessAmount),
        };
      }));

      // ── 2. GRN + lines (source='po_with_bill', both po_id + bill_id) ─
      const grnNo = await nextDocNo(tx, this.tenantId, 'GRN');
      const totalValue = input.lines.reduce((s, l) => s + l.qty * l.unitRate, 0);

      const [grn] = await tx.insert(inventoryGrns).values({
        tenantId: this.tenantId, grnNo, warehouseId: input.warehouseId,
        vendorId: po.vendorId, poId, billId,
        source: 'po_with_bill', receivedDate: input.receivedDate,
        vehicleNo: input.vehicleNo ?? null, lrNo: input.lrNo ?? null,
        notes: input.notes ?? null, status: 'posted', postedAt: new Date(),
        totalValue: String(Math.round(totalValue * 100) / 100),
        createdBy: this.userId,
      }).returning();

      const grnId = grn!.id;
      let offPoLineCount = 0;
      const insertedGrnLines = await tx.insert(inventoryGrnLines).values(input.lines.map((l, i) => {
        const poLine = l.poLineId ? poLineMap.get(l.poLineId) : null;
        const catalogId = resolvedCatalogIds[i]!;
        const cat = catalogMap.get(catalogId)!;
        const isOffPo = !poLine;
        if (isOffPo) offPoLineCount++;
        return {
          tenantId: this.tenantId, grnId,
          itemId: cat.inventoryItemId ?? null,
          catalogItemId: cat.inventoryItemId ? null : catalogId,
          batchNo: l.batchNo ?? null, mfgDate: l.mfgDate ?? null, expiryDate: l.expiryDate ?? null,
          qty: String(l.qty),
          uom: poLine?.uom ?? cat.defaultUom ?? null,
          unitRate: String(l.unitRate), landedCostPerUnit: '0',
          lineTotal: String(Math.round(l.qty * l.unitRate * 100) / 100),
          notes: l.notes ?? null,
          serialNos: l.serialNos && l.serialNos.length > 0 ? l.serialNos : null,
          poLineId: l.poLineId ?? null,
          isOffPo,
          poUnitRate: poLine ? String(poLine.unitRate) : null,
          poQtyOrdered: poLine ? String(poLine.qtyOrdered) : null,
        };
      })).returning();

      // ── 3. Stock ledger movements for inventory-tracked catalog rows ─
      const ledger = new StockLedgerService(this.tenantId);
      const receivedDateObj = new Date(input.receivedDate);
      for (let i = 0; i < input.lines.length; i++) {
        const line = input.lines[i]!;
        const cat = catalogMap.get(resolvedCatalogIds[i]!)!;
        if (!cat.inventoryItemId) continue;
        await ledger.recordMovement(tx as unknown as Db, {
          itemId: cat.inventoryItemId, warehouseId: input.warehouseId,
          batchNo: line.batchNo ?? null,
          movementType: 'grn', sourceType: 'inventory_grn',
          sourceId: grnId, sourceLineId: insertedGrnLines[i]!.id,
          qtyDelta: line.qty, unitCost: line.unitRate,
          movedAt: receivedDateObj, postedBy: this.userId,
        });
        const sn = line.serialNos ?? [];
        if (sn.length > 0) {
          await tx.insert(inventorySerials).values(sn.map((s) => ({
            tenantId: this.tenantId, itemId: cat.inventoryItemId!,
            serialNo: s, currentWarehouseId: input.warehouseId,
            currentStatus: 'in_stock' as const, batchNo: line.batchNo ?? null, grnId,
          })));
        }
      }

      // ── 4. PO line counters: BOTH qty_received and qty_billed ────────
      for (const l of input.lines) {
        if (!l.poLineId) continue;
        await tx
          .update(purchaseOrderLinesV2)
          .set({
            qtyReceived: sql`${purchaseOrderLinesV2.qtyReceived}::numeric + ${l.qty}`,
            qtyBilled:   sql`${purchaseOrderLinesV2.qtyBilled}::numeric + ${l.qty}`,
          })
          .where(eq(purchaseOrderLinesV2.id, l.poLineId));
      }

      // ── 5. PO status transition (same logic as receive.service) ──────
      const refreshed = await tx
        .select({ qtyOrdered: purchaseOrderLinesV2.qtyOrdered, qtyReceived: purchaseOrderLinesV2.qtyReceived })
        .from(purchaseOrderLinesV2)
        .where(eq(purchaseOrderLinesV2.poId, poId));
      const allFull = refreshed.every((l) => Number(l.qtyReceived) >= Number(l.qtyOrdered));
      const anyReceived = refreshed.some((l) => Number(l.qtyReceived) > 0);
      const newStatus = allFull ? 'received' : (anyReceived ? 'partially_received' : po.status);
      if (newStatus !== po.status) {
        await tx.update(purchaseOrdersV2)
          .set({ status: newStatus, updatedAt: new Date() })
          .where(eq(purchaseOrdersV2.id, poId));
      }

      // ── 6. Link bill_id on GRN was already set; backlink invoice → GRN
      await tx.update(purchaseInvoices)
        .set({ linkedInventoryGrnId: grnId, updatedAt: new Date() })
        .where(eq(purchaseInvoices.id, billId));

      return { billId, billNumber, grnId, grnNo: grn!.grnNo, newStatus, offPoLineCount };
    });

    // ── 7. Combined JE: Dr Inventory / Cr AP-Vendor ────────────────────
    //   Pass linkedInventoryGrnId to drive the Pattern-B path. NULL out
    //   matchedPoId so the JE poster doesn't take the GRNI-clearing branch
    //   (we never posted GRNI in the first place).
    const [vendorRow] = await this.db.select({ name: vendors.name })
      .from(vendors).where(eq(vendors.id, po.vendorId)).limit(1);
    const gl = new GLService(this.db, this.tenantId);
    await gl.postPurchaseInvoice({
      id: result.billId,
      date: input.vendorInvoice.invoiceDate,
      totalAmount: input.vendorInvoice.totalAmount,
      vendorName: vendorRow?.name ?? '',
      invoiceNumber: result.billNumber,
      linkedInventoryGrnId: result.grnId,
      matchedPoId: null,
    });

    // ── 8. Bind staged scan file to the new bill as attachment ─────────
    if (input.extractionId) {
      const staging = new ExtractionStagingService(this.redis, getStorageProvider());
      await this.attachStagedFile(staging, input.extractionId, result.billId);
    }

    return {
      billId: result.billId, billNumber: result.billNumber,
      grnId: result.grnId, grnNo: result.grnNo,
      newPoStatus: result.newStatus, offPoLineCount: result.offPoLineCount,
    };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

  private async fetchPoOrThrow(poId: string) {
    const [po] = await this.db.select().from(purchaseOrdersV2)
      .where(and(eq(purchaseOrdersV2.id, poId), eq(purchaseOrdersV2.tenantId, this.tenantId)))
      .limit(1);
    if (!po) throw new NotFoundError('PurchaseOrder');
    if (!['sent', 'partially_received'].includes(po.status)) {
      throw new ConflictError(`PO is ${po.status}; cannot scan-receive against it`);
    }
    return po;
  }

  private async loadPoLineMap(poId: string, poLineIds: string[]) {
    if (poLineIds.length === 0) return new Map();
    const rows = await this.db.select().from(purchaseOrderLinesV2)
      .where(and(eq(purchaseOrderLinesV2.poId, poId), inArray(purchaseOrderLinesV2.id, poLineIds)));
    return new Map(rows.map((r) => [r.id, r] as const));
  }

  private async loadCatalogMap(vendorId: string, catalogIds: string[]) {
    if (catalogIds.length === 0) return new Map<string, typeof vendorCatalogItems.$inferSelect>();
    const rows = await this.db.select().from(vendorCatalogItems)
      .where(and(
        eq(vendorCatalogItems.tenantId, this.tenantId),
        eq(vendorCatalogItems.vendorId, vendorId),
        eq(vendorCatalogItems.isActive, true),
        inArray(vendorCatalogItems.id, catalogIds),
      ));
    const map = new Map(rows.map((r) => [r.id, r] as const));
    for (const id of catalogIds) {
      if (!map.has(id)) throw new NotFoundError(`VendorCatalogItem ${id}`);
    }
    return map;
  }

  /**
   * Resolve-or-create a catalog row inside the commit transaction for an
   * off-PO line that didn't match an existing catalog entry. First checks
   * by normalised description (so two scans of the same substitution don't
   * mint duplicates), then inserts. Mutates the shared `catalogMap` so
   * downstream code (bill items, GRN lines, stock ledger) can look up the
   * row uniformly. Mirrors the suggest-and-grow pattern used by AP scan
   * import — catalogs grow from real receipts, not bulk uploads.
   */
  private async resolveOrCreateCatalog(
    tx: Db, vendorId: string,
    line: ScanReceiveAgainstPoInput['lines'][number],
    catalogMap: Map<string, typeof vendorCatalogItems.$inferSelect>,
  ): Promise<string> {
    const description = line.description?.trim();
    if (!description) {
      throw new ConflictError('Off-PO line is missing a description; cannot auto-create catalog row');
    }
    const normalised = normaliseCatalogDescription(description);
    const [existing] = await tx.select().from(vendorCatalogItems)
      .where(and(
        eq(vendorCatalogItems.tenantId, this.tenantId),
        eq(vendorCatalogItems.vendorId, vendorId),
        eq(vendorCatalogItems.isActive, true),
        eq(vendorCatalogItems.normalizedDescription, normalised),
      )).limit(1);
    if (existing) {
      catalogMap.set(existing.id, existing);
      return existing.id;
    }
    const [created] = await tx.insert(vendorCatalogItems).values({
      tenantId: this.tenantId,
      vendorId,
      description,
      normalizedDescription: normalised,
      defaultUom: null,
      defaultRate: String(line.unitRate),
      hsnSacCode: line.hsnSacCode ?? null,
      defaultTaxRate: line.taxRate != null ? String(line.taxRate) : null,
      defaultTaxCategory: 'taxable',
      inventoryItemId: null,
      useCount: 1,
      lastUsedAt: new Date(),
      isActive: true,
    }).returning();
    catalogMap.set(created!.id, created!);
    return created!.id;
  }

  /**
   * Map AI-extracted items to PO lines via vendor-catalog normalised
   * description match. Items with no match are flagged off-PO with
   * catalogItemId null — the user must pick a catalog row before commit.
   */
  private async mapLinesToCatalog(
    poId: string,
    extractedItems: ExtractionResult['extracted']['items'],
  ): Promise<SuggestedLine[]> {
    const [po] = await this.db.select().from(purchaseOrdersV2)
      .where(eq(purchaseOrdersV2.id, poId)).limit(1);
    const poLines = await this.db.select().from(purchaseOrderLinesV2)
      .where(eq(purchaseOrderLinesV2.poId, poId));
    const catalogRows = await this.db.select().from(vendorCatalogItems)
      .where(and(
        eq(vendorCatalogItems.tenantId, this.tenantId),
        eq(vendorCatalogItems.vendorId, po!.vendorId),
        eq(vendorCatalogItems.isActive, true),
      ));

    const catByNormalised = new Map(catalogRows.map((c) => [c.normalizedDescription, c] as const));
    const poLineByCatalogId = new Map(poLines.filter((l) => l.catalogItemId).map((l) => [l.catalogItemId!, l] as const));

    return extractedItems.map((item) => {
      const normalised = normaliseCatalogDescription(item.itemName);
      const cat = catByNormalised.get(normalised);
      const poLine = cat ? poLineByCatalogId.get(cat.id) : undefined;
      return {
        poLineId: poLine?.id ?? null,
        catalogItemId: cat?.id ?? null,
        catalogDescription: cat?.description ?? item.itemName,
        vendorQty: item.quantity,
        vendorRate: item.unitPrice,
        vendorTaxRate: item.taxRate,
        vendorHsnSacCode: item.hsnSacCode,
        poQty: poLine ? Number(poLine.qtyOrdered) : null,
        poRate: poLine ? Number(poLine.unitRate) : null,
        isOffPo: !poLine,
      };
    });
  }

  /**
   * Compute per-line CGST/SGST/IGST splits from vendor's taxRate + the
   * tenant-vs-vendor interstate determination. Falls back to vendor's
   * explicit isInterState flag from the extraction when provided.
   */
  private async computeGst(tx: Db, vendorId: string, input: ScanReceiveAgainstPoInput) {
    const [tenantRow] = await tx.select({ settings: tenants.settings })
      .from(tenants).where(eq(tenants.id, this.tenantId)).limit(1);
    const settings = (tenantRow?.settings ?? {}) as { stateCode?: string };
    const [vendorRow] = await tx.select({ state: vendors.state, gstin: vendors.gstin })
      .from(vendors).where(eq(vendors.id, vendorId)).limit(1);

    const buyerState = settings.stateCode ?? '';
    const sellerGstin = vendorRow?.gstin;
    const sellerState = sellerGstin ? sellerGstin.slice(0, 2) : resolveStateCode(vendorRow?.state ?? buyerState);
    const placeOfSupply = buyerState && sellerState ? determinePlaceOfSupply(sellerState, buyerState) : null;
    const isInterState = input.vendorInvoice.isInterState ?? placeOfSupply?.isInterState ?? false;

    const itemTaxes: TaxBreakdown[] = input.lines.map((l) => {
      const taxCategory: TaxCategory = input.vendorInvoice.reverseCharge ? 'reverse_charge' : 'taxable';
      return calculateLineItemTax({
        amount: l.qty * l.unitRate,
        taxRate: l.taxRate ?? 0,
        isInterState, taxCategory, cessRate: 0,
      });
    });
    const summary = calculateInvoiceTax(
      input.lines.map((l, i) => ({ amount: l.qty * l.unitRate, tax: itemTaxes[i]! })),
    );
    return { placeOfSupply, itemTaxes, summary };
  }

  private async attachStagedFile(
    staging: ExtractionStagingService, extractionId: string, billId: string,
  ): Promise<void> {
    const staged = await staging.claim(extractionId, this.tenantId);
    if (!staged) return; // expired or already claimed — non-fatal
    const data = await this.fetchStagedData(staged);
    if (!data) return;
    const attachments = new AttachmentService(this.db, this.tenantId, getStorageProvider());
    await attachments.upload({
      entityType: 'purchase_invoice', entityId: billId,
      fileName: staged.fileName, fileSize: data.length,
      mimeType: staged.mimeType, data, uploadedBy: this.userId,
    });
  }

  private async fetchStagedData(staged: StagedExtraction): Promise<Buffer | null> {
    try {
      const storage = getStorageProvider();
      const stream = await storage.getStream(staged.storageKey);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
      }
      return Buffer.concat(chunks);
    } catch {
      return null;
    }
  }
}
