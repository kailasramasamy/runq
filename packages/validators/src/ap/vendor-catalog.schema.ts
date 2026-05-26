import { z } from 'zod';
import { hsnSacCodeSchema } from '../common/hsn.schema';

const taxCategorySchema = z.enum(['taxable', 'exempt', 'nil_rated', 'zero_rated', 'reverse_charge']);

/**
 * Schemas for vendor catalog CRUD endpoints introduced by AP Pattern-B.
 * Spec: `docs/ap-pattern-b-spec.md` §4 + §10.
 *
 * The catalog is vendor-scoped and never grows silently — every entry is
 * created by explicit user action (manual add, "Save to catalog" toggle on
 * a bill/PO line, or batched "frequent items" prompt).
 */

const baseCatalogItemSchema = z.object({
  description: z.string().min(1).max(255),
  defaultUom: z.string().max(20).nullish(),
  defaultRate: z.number().nonnegative().nullish(),
  hsnSacCode: hsnSacCodeSchema.nullish(),
  defaultTaxRate: z.number().min(0).max(100).nullish(),
  defaultTaxCategory: taxCategorySchema.nullish(),
  inventoryItemId: z.string().uuid().nullish(),
});

export const createVendorCatalogItemSchema = baseCatalogItemSchema;

export const updateVendorCatalogItemSchema = baseCatalogItemSchema.partial().extend({
  isActive: z.boolean().optional(),
});

/**
 * Bulk-resolve descriptions to catalog entries. Called by the bill review
 * screen after extraction, and by the PO create screen when the user pastes
 * lines. Server normalises each input before matching against
 * `vendor_catalog_items.normalized_description`.
 */
export const resolveCatalogDescriptionsSchema = z.object({
  descriptions: z.array(z.string().min(1).max(255)).min(1).max(200),
});

/**
 * Returned by the catalog suggestions endpoint and the daily job.
 * Used by the vendor detail page to surface "frequent uncatalogued lines"
 * for batched promotion.
 */
export const catalogSuggestionFilterSchema = z.object({
  /** Minimum occurrences in the last `lookbackDays` to surface as a suggestion. */
  minOccurrences: z.coerce.number().int().min(2).default(3),
  /** Days of bill/PO history to scan. */
  lookbackDays: z.coerce.number().int().min(7).max(365).default(60),
});

/**
 * Pricing variance prompt body — sent by the client when user has accepted
 * a >5% rate change suggested by the bill-post flow.
 */
export const confirmCatalogRateChangeSchema = z.object({
  catalogItemId: z.string().uuid(),
  newRate: z.number().nonnegative(),
  sourceDocType: z.enum(['po', 'bill', 'manual']),
  sourceDocId: z.string().uuid().nullish(),
});

export type CreateVendorCatalogItemInput = z.infer<typeof createVendorCatalogItemSchema>;
export type UpdateVendorCatalogItemInput = z.infer<typeof updateVendorCatalogItemSchema>;
export type ResolveCatalogDescriptionsInput = z.infer<typeof resolveCatalogDescriptionsSchema>;
export type CatalogSuggestionFilter = z.infer<typeof catalogSuggestionFilterSchema>;
export type ConfirmCatalogRateChangeInput = z.infer<typeof confirmCatalogRateChangeSchema>;
