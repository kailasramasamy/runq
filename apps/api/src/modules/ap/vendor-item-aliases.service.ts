import { and, eq, inArray } from 'drizzle-orm';
import { vendorCatalogItems } from '@runq/db';
import type { Db } from '@runq/db';

/**
 * Compatibility shim — pre-extraction HSN/tax hints for a vendor's line
 * items now live in `vendor_catalog_items` (the legacy
 * `vendor_bill_item_aliases` table was retired by migration 0116).
 *
 * The function signatures are unchanged so the AI extract pipeline keeps
 * working without further refactoring. The silent-learn write path
 * (`recordItemAliasesFromBill`) was removed entirely; catalog growth is
 * now suggest-only per AP Pattern-B spec §4.1.
 */

export interface ItemAliasHint {
  rawDescription: string;
  hsnSacCode: string | null;
  taxRate: number | null;
  taxCategory: string | null;
}

/**
 * Stable normalization for alias lookup. Matches the catalog table's
 * normalised_description rule (lowercase + whitespace-collapse + trim).
 * Leading/trailing punctuation is dropped to be lenient on extractor
 * variance; internal punctuation is preserved so "12mm" and "12 mm" don't
 * collide if the vendor distinguishes them.
 */
export function normalizeItemKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^[\W_]+|[\W_]+$/g, '')
    .trim();
}

/**
 * Look up hints for a list of raw item descriptions on a single vendor.
 * Reads active rows from `vendor_catalog_items`. Returns a map keyed by
 * the original raw description for caller convenience.
 */
export async function lookupItemAliases(
  db: Db,
  tenantId: string,
  vendorId: string,
  rawDescriptions: string[],
): Promise<Map<string, ItemAliasHint>> {
  if (rawDescriptions.length === 0) return new Map();

  const keys = Array.from(new Set(rawDescriptions.map(normalizeItemKey).filter(Boolean)));
  if (keys.length === 0) return new Map();

  const rows = await db
    .select({
      normalized: vendorCatalogItems.normalizedDescription,
      description: vendorCatalogItems.description,
      hsn: vendorCatalogItems.hsnSacCode,
      taxRate: vendorCatalogItems.defaultTaxRate,
      taxCategory: vendorCatalogItems.defaultTaxCategory,
    })
    .from(vendorCatalogItems)
    .where(and(
      eq(vendorCatalogItems.tenantId, tenantId),
      eq(vendorCatalogItems.vendorId, vendorId),
      eq(vendorCatalogItems.isActive, true),
      inArray(vendorCatalogItems.normalizedDescription, keys),
    ));

  const byKey = new Map<string, ItemAliasHint>();
  for (const r of rows) {
    byKey.set(r.normalized, {
      rawDescription: r.description,
      hsnSacCode: r.hsn,
      taxRate: r.taxRate != null ? Number(r.taxRate) : null,
      taxCategory: r.taxCategory,
    });
  }

  const result = new Map<string, ItemAliasHint>();
  for (const raw of rawDescriptions) {
    const k = normalizeItemKey(raw);
    if (k && byKey.has(k)) result.set(raw, byKey.get(k)!);
  }
  return result;
}
