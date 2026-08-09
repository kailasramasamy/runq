import { z } from 'zod';
import { hsnSacCodeSchema } from '../common/hsn.schema';
import { queryBool } from '../common/query-bool.schema';

/**
 * Zod validator for a single catalogue attribute field. Mirrors the
 * ItemAttributeField type in @runq/types — kept in sync by hand.
 *
 * `key` uses camelCase / snake_case ASCII so JSONB keys stay portable.
 */
export const itemAttributeFieldSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'Key must start with a letter and contain only letters, digits, and underscores'),
  label: z.string().min(1).max(80),
  type: z.enum(['text', 'number', 'textarea', 'boolean', 'select']),
  placeholder: z.string().max(120).optional(),
  help: z.string().max(200).optional(),
  required: z.boolean().optional(),
  options: z
    .array(
      z.object({
        value: z.string().min(1).max(80),
        label: z.string().min(1).max(80),
      }),
    )
    .max(50)
    .optional(),
});

export const itemAttributeSchemaInput = z
  .array(itemAttributeFieldSchema)
  .max(20)
  .refine(
    (fields) => new Set(fields.map((f) => f.key)).size === fields.length,
    { message: 'Field keys must be unique' },
  );

export const updateItemAttributeSchemaInput = z.object({
  schema: itemAttributeSchemaInput,
});

export type UpdateItemAttributeSchemaInput = z.infer<typeof updateItemAttributeSchemaInput>;

// Axis-1 classification — required for products, must be NULL for services.
// The service layer defaults missing values for products to 'trading_good'
// so the existing item-create form keeps working until the UI ships.
export const itemClassValues = [
  'raw_material',
  'packaging',
  'finished_good',
  'semi_finished',
  'trading_good',
  'consumable',
  'spare_part',
] as const;
export const itemClassSchema = z.enum(itemClassValues);
export type ItemClass = z.infer<typeof itemClassSchema>;

export const createItemSchema = z.object({
  name: z.string().min(1).max(255),
  sku: z.string().max(50).nullish(),
  type: z.enum(['product', 'service']),
  itemClass: itemClassSchema.nullish(),
  // FK into the category tree (replaces category / subcategory strings).
  // Either form is accepted on create — the service resolves strings to
  // an id when both are present. Trigger keeps strings mirrored from id.
  categoryId: z.string().uuid().nullish(),
  hsnSacCode: hsnSacCodeSchema.nullish(),
  unit: z.string().max(20).nullish(),
  // Pack size used by GSTR-1 HSN summary to normalize variant SKUs to a
  // canonical UQC. e.g. "100 ML" → packSizeValue=100, packSizeUqc='ML'.
  packSizeValue: z.number().positive().nullish(),
  packSizeUqc: z.string().max(10).nullish(),
  defaultSellingPrice: z.number().min(0).nullish(),
  defaultPurchasePrice: z.number().min(0).nullish(),
  gstRate: z.number().min(0).max(100).nullish(),
  mrp: z.number().min(0).nullish(),
  costPrice: z.number().min(0).nullish(),
  category: z.string().max(50).nullish(),
  subcategory: z.string().max(50).nullish(),
  description: z.string().max(2000).nullish(),
  // Universal supplier-catalogue attributes.
  ean: z.string().max(20).nullish(),
  margin: z.number().min(0).max(100).nullish(),
  basicPrice: z.number().min(0).nullish(),
  gstValue: z.number().min(0).nullish(),
  // Industry-specific catalogue attributes keyed by the tenant's schema.
  // Shape is validated loosely here — the backend persists it verbatim
  // to items.attributes jsonb.
  attributes: z.record(z.unknown()).nullish(),
  cogmBreakdown: z
    .array(
      z.object({
        label: z.string().min(1).max(100),
        amount: z.number().min(0),
        note: z.string().max(200).optional(),
      }),
    )
    .max(50)
    .nullish(),
  // Tracking flags — driven by item nature, not module. Surfaced on the
  // item form so dairy / FMCG / perishables can be set up correctly at
  // creation time. DB defaults stay in place when omitted.
  trackInventory: z.boolean().optional(),
  trackBatches: z.boolean().optional(),
  trackExpiry: z.boolean().optional(),
  trackSerials: z.boolean().optional(),
  /** Per-item batch code template used by Direct Receipt to pre-fill a
   *  fresh batch code. Tokens: {SKU}, {YYYY}, {MM}, {DD}, {YYYYMMDD}. */
  batchCodeTemplate: z.string().max(80).nullish(),
});

export const updateItemSchema = createItemSchema.partial();

export const itemFilterSchema = z.object({
  search: z.string().optional(),
  type: z.enum(['product', 'service']).optional(),
  itemClass: itemClassSchema.optional(),
  /** Operational bucket — server expands to the matching item_class set.
   *  Mirrors stockOnHandFilterSchema.itemClassGroup. */
  itemClassGroup: z.enum(['finished', 'inputs', 'trading', 'other', 'all']).optional(),
  categoryId: z.string().uuid().optional(),
  category: z.string().optional(),
  subcategory: z.string().optional(),
  /** Attach each row's total on-hand qty. Opt-in — it costs an extra
   *  aggregate query, and only the inventory item screens display it. */
  withStock: queryBool.optional(),
  /** Row order within each class group. 'name' (default) is alphabetical;
   *  'recent' puts the most recently active items first — last stock
   *  movement, falling back to the item's own updated_at when it has never
   *  held stock. Opt-in so the finance / purchase catalogues stay A–Z.
   *  'category' drops the class rank entirely and orders by category →
   *  subcategory → name, so the item screens can section by category. */
  sort: z.enum(['name', 'recent', 'category']).optional(),
});

export const bulkCreateItemsSchema = z.object({
  items: z.array(createItemSchema).min(1).max(500),
  mode: z.enum(['skip', 'overwrite']).default('skip'),
});

/** Bulk reclassify endpoint payload. Cap at 500 ids to keep the IN list
 *  bounded and the response time predictable. */
export const bulkUpdateItemClassSchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1).max(500),
  itemClass: itemClassSchema,
});

export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
export type ItemFilterInput = z.infer<typeof itemFilterSchema>;
export type BulkCreateItemsInput = z.infer<typeof bulkCreateItemsSchema>;
export type BulkUpdateItemClassInput = z.infer<typeof bulkUpdateItemClassSchema>;
