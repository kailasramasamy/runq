import { z } from 'zod';
import { hsnSacCodeSchema } from '../common/hsn.schema';

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

export const createItemSchema = z.object({
  name: z.string().min(1).max(255),
  sku: z.string().max(50).nullish(),
  type: z.enum(['product', 'service']),
  hsnSacCode: hsnSacCodeSchema.nullish(),
  unit: z.string().max(20).nullish(),
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
});

export const updateItemSchema = createItemSchema.partial();

export const itemFilterSchema = z.object({
  search: z.string().optional(),
  type: z.enum(['product', 'service']).optional(),
  category: z.string().optional(),
  subcategory: z.string().optional(),
});

export const bulkCreateItemsSchema = z.object({
  items: z.array(createItemSchema).min(1).max(500),
  mode: z.enum(['skip', 'overwrite']).default('skip'),
});

export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
export type ItemFilterInput = z.infer<typeof itemFilterSchema>;
export type BulkCreateItemsInput = z.infer<typeof bulkCreateItemsSchema>;
