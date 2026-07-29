import { and, eq, desc, sql, ilike, isNull, inArray } from 'drizzle-orm';
import {
  vendorCatalogItems,
  vendorCatalogItemPriceHistory,
  vendors,
  purchaseInvoiceItems,
  purchaseInvoices,
  purchaseOrderLinesV2,
  inventoryGrnLines,
  normaliseCatalogDescription,
} from '@runq/db';
import type { Db } from '@runq/db';
import type {
  CreateVendorCatalogItemInput,
  UpdateVendorCatalogItemInput,
  CatalogSuggestionFilter,
} from '@runq/validators';
import { NotFoundError, ConflictError } from '../../utils/errors';

/**
 * AP Pattern-B vendor catalog. See `docs/ap-pattern-b-spec.md` §4.
 *
 * Catalog rows are vendor-scoped reuse aids — they hold the vendor's
 * free-text description, default rate/UOM/HSN/tax, and an optional FK to
 * the items master for tracked inventory items. The catalog never grows
 * silently; every entry requires explicit user action.
 *
 * Rate variance threshold (silent vs prompt): ±5% per spec §4.2.
 */
const RATE_VARIANCE_THRESHOLD = 0.05;

export type CatalogItem = typeof vendorCatalogItems.$inferSelect;

export interface CatalogResolveHit {
  description: string;
  catalogItem: CatalogItem | null;
}

export interface CatalogRateUpdate {
  catalogItemId: string;
  oldRate: number;
  newRate: number;
  /** True when delta exceeds the silent-update threshold; UI should prompt. */
  promptUser: boolean;
}

export interface CatalogSuggestion {
  description: string;
  normalizedDescription: string;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
  sampleHsnSac: string | null;
  sampleUnitPrice: string | null;
}

export class VendorCatalogService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
  ) {}

  // ─── Read ───────────────────────────────────────────────────────────────

  async list(vendorId: string, params: { q?: string; limit?: number } = {}): Promise<CatalogItem[]> {
    await this.assertVendor(vendorId);
    const limit = Math.min(params.limit ?? 50, 200);
    const filters = [
      eq(vendorCatalogItems.tenantId, this.tenantId),
      eq(vendorCatalogItems.vendorId, vendorId),
      eq(vendorCatalogItems.isActive, true),
    ];
    if (params.q && params.q.trim()) {
      filters.push(ilike(vendorCatalogItems.normalizedDescription, `%${normaliseCatalogDescription(params.q)}%`));
    }
    return this.db
      .select()
      .from(vendorCatalogItems)
      .where(and(...filters))
      .orderBy(desc(vendorCatalogItems.useCount), desc(vendorCatalogItems.lastUsedAt))
      .limit(limit);
  }

  async getById(vendorId: string, itemId: string): Promise<CatalogItem> {
    const [row] = await this.db
      .select()
      .from(vendorCatalogItems)
      .where(and(
        eq(vendorCatalogItems.tenantId, this.tenantId),
        eq(vendorCatalogItems.vendorId, vendorId),
        eq(vendorCatalogItems.id, itemId),
      ))
      .limit(1);
    if (!row) throw new NotFoundError('VendorCatalogItem');
    return row;
  }

  // ─── Write ──────────────────────────────────────────────────────────────

  async create(vendorId: string, input: CreateVendorCatalogItemInput): Promise<CatalogItem> {
    await this.assertVendor(vendorId);
    const normalized = normaliseCatalogDescription(input.description);

    // Active-row uniqueness mirrors the DB partial index. Catch up front
    // for a cleaner error than the DB violation.
    const [existing] = await this.db
      .select({ id: vendorCatalogItems.id })
      .from(vendorCatalogItems)
      .where(and(
        eq(vendorCatalogItems.vendorId, vendorId),
        eq(vendorCatalogItems.normalizedDescription, normalized),
        eq(vendorCatalogItems.isActive, true),
      ))
      .limit(1);
    if (existing) {
      throw new ConflictError(`Vendor already has a catalog entry for "${input.description}"`);
    }

    const [row] = await this.db
      .insert(vendorCatalogItems)
      .values({
        tenantId: this.tenantId,
        vendorId,
        description: input.description,
        normalizedDescription: normalized,
        defaultUom: input.defaultUom ?? null,
        defaultRate: input.defaultRate != null ? String(input.defaultRate) : null,
        hsnSacCode: input.hsnSacCode ?? null,
        defaultTaxRate: input.defaultTaxRate != null ? String(input.defaultTaxRate) : null,
        defaultTaxCategory: input.defaultTaxCategory ?? null,
        inventoryItemId: input.inventoryItemId ?? null,
      })
      .returning();
    return row!;
  }

  async update(vendorId: string, itemId: string, input: UpdateVendorCatalogItemInput): Promise<CatalogItem> {
    await this.getById(vendorId, itemId);   // 404 if missing

    const patch: Partial<typeof vendorCatalogItems.$inferInsert> = { updatedAt: new Date() };
    if (input.description !== undefined) {
      patch.description = input.description;
      patch.normalizedDescription = normaliseCatalogDescription(input.description);
    }
    if (input.defaultUom !== undefined)         patch.defaultUom = input.defaultUom;
    if (input.defaultRate !== undefined)        patch.defaultRate = input.defaultRate != null ? String(input.defaultRate) : null;
    if (input.hsnSacCode !== undefined)         patch.hsnSacCode = input.hsnSacCode;
    if (input.defaultTaxRate !== undefined)     patch.defaultTaxRate = input.defaultTaxRate != null ? String(input.defaultTaxRate) : null;
    if (input.defaultTaxCategory !== undefined) patch.defaultTaxCategory = input.defaultTaxCategory;
    if (input.inventoryItemId !== undefined)    patch.inventoryItemId = input.inventoryItemId;
    if (input.isActive !== undefined)           patch.isActive = input.isActive;

    const [row] = await this.db
      .update(vendorCatalogItems)
      .set(patch)
      .where(and(eq(vendorCatalogItems.id, itemId), eq(vendorCatalogItems.tenantId, this.tenantId)))
      .returning();
    return row!;
  }

  /**
   * Remove a catalog row. Purges it outright when nothing references it;
   * otherwise falls back to deactivating.
   *
   * PO lines and GRN lines carry a NO ACTION FK to this row, so a hard delete
   * of a used row would surface as a raw FK violation — and GRN lines can't be
   * nulled out either (a CHECK requires exactly one of item_id/catalog_item_id).
   * Deactivating hides the row from list()/resolve(), which is all the caller
   * wants, while keeping those documents readable.
   */
  async remove(vendorId: string, itemId: string): Promise<{ deleted: boolean; references: number }> {
    await this.getById(vendorId, itemId);   // 404 if missing

    const [poRefs] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(purchaseOrderLinesV2)
      .where(eq(purchaseOrderLinesV2.catalogItemId, itemId));
    const [grnRefs] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(inventoryGrnLines)
      .where(eq(inventoryGrnLines.catalogItemId, itemId));

    const references = (poRefs?.count ?? 0) + (grnRefs?.count ?? 0);
    if (references > 0) {
      await this.update(vendorId, itemId, { isActive: false });
      return { deleted: false, references };
    }

    // Unreferenced: the price-history cascade is the only collateral, and it's
    // meaningless once the row it describes is gone.
    await this.db
      .delete(vendorCatalogItems)
      .where(and(eq(vendorCatalogItems.id, itemId), eq(vendorCatalogItems.tenantId, this.tenantId)));
    return { deleted: true, references: 0 };
  }

  // ─── Bulk resolve for bill / PO review screens ──────────────────────────

  async resolve(vendorId: string, descriptions: string[]): Promise<CatalogResolveHit[]> {
    await this.assertVendor(vendorId);
    if (descriptions.length === 0) return [];

    const normalisedMap = new Map<string, string>();   // norm → first original
    for (const d of descriptions) {
      const n = normaliseCatalogDescription(d);
      if (!normalisedMap.has(n)) normalisedMap.set(n, d);
    }

    const rows = await this.db
      .select()
      .from(vendorCatalogItems)
      .where(and(
        eq(vendorCatalogItems.tenantId, this.tenantId),
        eq(vendorCatalogItems.vendorId, vendorId),
        eq(vendorCatalogItems.isActive, true),
        inArray(vendorCatalogItems.normalizedDescription, [...normalisedMap.keys()]),
      ));

    const byNorm = new Map(rows.map((r) => [r.normalizedDescription, r] as const));
    return descriptions.map((d) => ({
      description: d,
      catalogItem: byNorm.get(normaliseCatalogDescription(d)) ?? null,
    }));
  }

  // ─── Internal helpers used by bill / PO post flows ──────────────────────

  /**
   * Upsert from a "Save to vendor catalog" toggle on a bill/PO line save.
   * Reactivates a previously-deactivated entry if one matches, instead of
   * creating a duplicate. Returns the catalog item (existing or new).
   */
  async upsertFromDocLine(
    vendorId: string,
    line: {
      description: string;
      uom?: string | null;
      rate?: number | null;
      hsnSacCode?: string | null;
      taxRate?: number | null;
      taxCategory?: string | null;
      inventoryItemId?: string | null;
    },
  ): Promise<CatalogItem> {
    const normalized = normaliseCatalogDescription(line.description);

    const [existing] = await this.db
      .select()
      .from(vendorCatalogItems)
      .where(and(
        eq(vendorCatalogItems.tenantId, this.tenantId),
        eq(vendorCatalogItems.vendorId, vendorId),
        eq(vendorCatalogItems.normalizedDescription, normalized),
      ))
      .limit(1);

    if (existing) {
      // Reactivate + refresh — don't blindly overwrite a curated rate; let
      // `applyRateChange` do that with variance check.
      const patch: Partial<typeof vendorCatalogItems.$inferInsert> = {
        isActive: true,
        updatedAt: new Date(),
      };
      // Only fill missing metadata; never overwrite user-edited fields.
      if (existing.defaultUom == null && line.uom)           patch.defaultUom = line.uom;
      if (existing.hsnSacCode == null && line.hsnSacCode)    patch.hsnSacCode = line.hsnSacCode;
      if (existing.defaultTaxRate == null && line.taxRate != null) patch.defaultTaxRate = String(line.taxRate);
      if (existing.defaultTaxCategory == null && line.taxCategory) patch.defaultTaxCategory = line.taxCategory;
      if (existing.inventoryItemId == null && line.inventoryItemId) patch.inventoryItemId = line.inventoryItemId;

      const [updated] = await this.db
        .update(vendorCatalogItems)
        .set(patch)
        .where(eq(vendorCatalogItems.id, existing.id))
        .returning();
      return updated!;
    }

    const [created] = await this.db
      .insert(vendorCatalogItems)
      .values({
        tenantId: this.tenantId,
        vendorId,
        description: line.description,
        normalizedDescription: normalized,
        defaultUom: line.uom ?? null,
        defaultRate: line.rate != null ? String(line.rate) : null,
        hsnSacCode: line.hsnSacCode ?? null,
        defaultTaxRate: line.taxRate != null ? String(line.taxRate) : null,
        defaultTaxCategory: line.taxCategory ?? null,
        inventoryItemId: line.inventoryItemId ?? null,
      })
      .returning();
    return created!;
  }

  /**
   * Called by bill/PO save when a line resolved to a catalog entry but the
   * rate differs from the default. Within the silent threshold the rate
   * is updated and a price-history row written. Above the threshold the
   * update is returned with `promptUser=true` and NOT applied — caller is
   * expected to surface a confirm prompt and re-call `confirmRateChange`.
   */
  async applyRateChange(args: {
    catalogItemId: string;
    newRate: number;
    sourceDocType: 'po' | 'bill' | 'manual';
    sourceDocId?: string;
    changedBy?: string;
  }): Promise<CatalogRateUpdate | null> {
    const [row] = await this.db
      .select()
      .from(vendorCatalogItems)
      .where(and(
        eq(vendorCatalogItems.id, args.catalogItemId),
        eq(vendorCatalogItems.tenantId, this.tenantId),
      ))
      .limit(1);
    if (!row) throw new NotFoundError('VendorCatalogItem');
    if (row.defaultRate == null) {
      // No baseline yet — just adopt the new rate silently.
      await this.commitRateChange(args.catalogItemId, args.newRate, args);
      return { catalogItemId: row.id, oldRate: 0, newRate: args.newRate, promptUser: false };
    }
    const oldRate = Number(row.defaultRate);
    if (oldRate === 0) {
      await this.commitRateChange(args.catalogItemId, args.newRate, args);
      return { catalogItemId: row.id, oldRate: 0, newRate: args.newRate, promptUser: false };
    }
    const delta = Math.abs(args.newRate - oldRate) / oldRate;
    if (delta <= RATE_VARIANCE_THRESHOLD) {
      await this.commitRateChange(args.catalogItemId, args.newRate, args);
      return { catalogItemId: row.id, oldRate, newRate: args.newRate, promptUser: false };
    }
    return { catalogItemId: row.id, oldRate, newRate: args.newRate, promptUser: true };
  }

  /** Explicit confirmation path — user accepted the >5% drift prompt. */
  async confirmRateChange(args: {
    catalogItemId: string;
    newRate: number;
    sourceDocType: 'po' | 'bill' | 'manual';
    sourceDocId?: string | null;
    changedBy?: string;
  }): Promise<CatalogRateUpdate> {
    const [row] = await this.db
      .select({ defaultRate: vendorCatalogItems.defaultRate })
      .from(vendorCatalogItems)
      .where(and(
        eq(vendorCatalogItems.id, args.catalogItemId),
        eq(vendorCatalogItems.tenantId, this.tenantId),
      ))
      .limit(1);
    if (!row) throw new NotFoundError('VendorCatalogItem');
    const oldRate = row.defaultRate != null ? Number(row.defaultRate) : 0;
    await this.commitRateChange(args.catalogItemId, args.newRate, args);
    return { catalogItemId: args.catalogItemId, oldRate, newRate: args.newRate, promptUser: false };
  }

  async recordUse(catalogItemId: string): Promise<void> {
    await this.db
      .update(vendorCatalogItems)
      .set({
        useCount: sql`${vendorCatalogItems.useCount} + 1`,
        lastUsedAt: new Date(),
      })
      .where(and(
        eq(vendorCatalogItems.id, catalogItemId),
        eq(vendorCatalogItems.tenantId, this.tenantId),
      ));
  }

  // ─── Price history ──────────────────────────────────────────────────────

  async getPriceHistory(vendorId: string, itemId: string): Promise<typeof vendorCatalogItemPriceHistory.$inferSelect[]> {
    await this.getById(vendorId, itemId);
    return this.db
      .select()
      .from(vendorCatalogItemPriceHistory)
      .where(and(
        eq(vendorCatalogItemPriceHistory.tenantId, this.tenantId),
        eq(vendorCatalogItemPriceHistory.catalogItemId, itemId),
      ))
      .orderBy(desc(vendorCatalogItemPriceHistory.changedAt));
  }

  // ─── Suggestions: frequent uncatalogued lines from bill history ─────────

  async getSuggestions(vendorId: string, filter: CatalogSuggestionFilter): Promise<CatalogSuggestion[]> {
    await this.assertVendor(vendorId);
    const sinceIso = new Date(Date.now() - filter.lookbackDays * 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0]!;

    // Aggregate bill-line descriptions for this vendor, exclude descriptions
    // already in the active catalog, surface those with >= minOccurrences hits.
    const rows = await this.db.execute(sql`
      WITH normalised_lines AS (
        SELECT
          pii.item_name AS description,
          lower(regexp_replace(trim(pii.item_name), '\\s+', ' ', 'g')) AS normalized_description,
          pi.invoice_date,
          pii.hsn_sac_code,
          pii.unit_price
        FROM purchase_invoice_items pii
        JOIN purchase_invoices pi ON pi.id = pii.invoice_id
        WHERE pi.tenant_id = ${this.tenantId}
          AND pi.vendor_id = ${vendorId}
          AND pi.invoice_date >= ${sinceIso}::date
      ),
      grouped AS (
        SELECT
          MAX(description) AS description,
          normalized_description,
          COUNT(*) AS occurrences,
          MIN(invoice_date) AS first_seen,
          MAX(invoice_date) AS last_seen,
          MAX(hsn_sac_code) AS sample_hsn_sac,
          MAX(unit_price) AS sample_unit_price
        FROM normalised_lines
        GROUP BY normalized_description
        HAVING COUNT(*) >= ${filter.minOccurrences}
      )
      SELECT g.*
      FROM grouped g
      WHERE NOT EXISTS (
        SELECT 1 FROM vendor_catalog_items vci
        WHERE vci.tenant_id = ${this.tenantId}
          AND vci.vendor_id = ${vendorId}
          AND vci.is_active = true
          AND vci.normalized_description = g.normalized_description
      )
      ORDER BY g.occurrences DESC, g.last_seen DESC
      LIMIT 100
    `);

    return (rows.rows as Array<Record<string, unknown>>).map((r) => ({
      description: String(r.description ?? ''),
      normalizedDescription: String(r.normalized_description ?? ''),
      occurrences: Number(r.occurrences ?? 0),
      firstSeen: String(r.first_seen ?? ''),
      lastSeen: String(r.last_seen ?? ''),
      sampleHsnSac: r.sample_hsn_sac == null ? null : String(r.sample_hsn_sac),
      sampleUnitPrice: r.sample_unit_price == null ? null : String(r.sample_unit_price),
    }));
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  private async commitRateChange(
    catalogItemId: string,
    newRate: number,
    meta: { sourceDocType: 'po' | 'bill' | 'manual'; sourceDocId?: string | null; changedBy?: string },
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(vendorCatalogItems)
        .set({ defaultRate: String(newRate), updatedAt: new Date() })
        .where(eq(vendorCatalogItems.id, catalogItemId));
      await tx.insert(vendorCatalogItemPriceHistory).values({
        tenantId: this.tenantId,
        catalogItemId,
        rate: String(newRate),
        sourceDocType: meta.sourceDocType,
        sourceDocId: meta.sourceDocId ?? null,
        changedBy: meta.changedBy ?? null,
      });
    });
  }

  private async assertVendor(vendorId: string): Promise<void> {
    const [v] = await this.db
      .select({ id: vendors.id })
      .from(vendors)
      .where(and(eq(vendors.id, vendorId), eq(vendors.tenantId, this.tenantId), isNull(vendors.deletedAt)))
      .limit(1);
    if (!v) throw new NotFoundError('Vendor');
  }
}
