import { and, eq, sql, inArray } from 'drizzle-orm';
import { vendorBillItemAliases } from '@runq/db';
import type { Db } from '@runq/db';

export interface ItemAliasHint {
  rawDescription: string;
  hsnSacCode: string | null;
  taxRate: number | null;
  taxCategory: string | null;
}

/**
 * Stable normalization for alias lookup. Lowercase, collapse whitespace,
 * strip leading/trailing punctuation. Keeps internal punctuation so that
 * "12mm" and "12 mm" hash differently if the vendor distinguishes them
 * — we'd rather have two aliases than collide.
 */
export function normalizeItemKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^[\W_]+|[\W_]+$/g, '')
    .trim();
}

/**
 * Look up aliases for a list of raw item descriptions on a single vendor.
 * Returns a map keyed by raw description → suggested HSN/tax/category.
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
      normalizedKey: vendorBillItemAliases.normalizedKey,
      rawDescription: vendorBillItemAliases.rawDescription,
      hsn: vendorBillItemAliases.suggestedHsnSac,
      taxRate: vendorBillItemAliases.suggestedTaxRate,
      taxCategory: vendorBillItemAliases.suggestedTaxCategory,
    })
    .from(vendorBillItemAliases)
    .where(
      and(
        eq(vendorBillItemAliases.tenantId, tenantId),
        eq(vendorBillItemAliases.vendorId, vendorId),
        inArray(vendorBillItemAliases.normalizedKey, keys),
      ),
    );

  const byKey = new Map<string, ItemAliasHint>();
  for (const r of rows) {
    byKey.set(r.normalizedKey, {
      rawDescription: r.rawDescription,
      hsnSacCode: r.hsn,
      taxRate: r.taxRate != null ? Number(r.taxRate) : null,
      taxCategory: r.taxCategory,
    });
  }

  // Map back to original raw descriptions.
  const result = new Map<string, ItemAliasHint>();
  for (const raw of rawDescriptions) {
    const k = normalizeItemKey(raw);
    if (k && byKey.has(k)) result.set(raw, byKey.get(k)!);
  }
  return result;
}

/**
 * Upsert aliases from a saved bill's line items. Bumps use_count on
 * existing rows so we can track popularity, and refreshes
 * suggested_hsn/tax to whatever the user just saved (the "freshest
 * correction wins").
 */
export async function recordItemAliasesFromBill(
  db: Db,
  tenantId: string,
  vendorId: string,
  items: Array<{
    itemName: string;
    hsnSacCode?: string | null;
    taxRate?: number | null;
    taxCategory?: string | null;
  }>,
): Promise<void> {
  if (items.length === 0) return;

  for (const item of items) {
    if (!item.itemName || !item.itemName.trim()) continue;
    const normalized = normalizeItemKey(item.itemName);
    if (!normalized) continue;

    try {
      await db
        .insert(vendorBillItemAliases)
        .values({
          tenantId,
          vendorId,
          rawDescription: item.itemName,
          normalizedKey: normalized,
          suggestedHsnSac: item.hsnSacCode ?? null,
          suggestedTaxRate: item.taxRate != null ? String(item.taxRate) : null,
          suggestedTaxCategory: item.taxCategory ?? null,
        })
        .onConflictDoUpdate({
          target: [vendorBillItemAliases.tenantId, vendorBillItemAliases.vendorId, vendorBillItemAliases.normalizedKey],
          set: {
            rawDescription: item.itemName,
            suggestedHsnSac: item.hsnSacCode ?? null,
            suggestedTaxRate: item.taxRate != null ? String(item.taxRate) : null,
            suggestedTaxCategory: item.taxCategory ?? null,
            useCount: sql`${vendorBillItemAliases.useCount} + 1`,
            lastUsedAt: new Date(),
          },
        });
    } catch (err) {
      // Non-fatal — alias mining should never block a bill save.
      // eslint-disable-next-line no-console
      console.error('[vendor-item-aliases] failed to upsert', err);
    }
  }
}
