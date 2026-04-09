import { z } from 'zod';

export const createItemSchema = z.object({
  name: z.string().min(1).max(255),
  sku: z.string().max(50).nullish(),
  type: z.enum(['product', 'service']),
  hsnSacCode: z.string().max(8).nullish(),
  unit: z.string().max(20).nullish(),
  defaultSellingPrice: z.number().min(0).nullish(),
  defaultPurchasePrice: z.number().min(0).nullish(),
  gstRate: z.number().min(0).max(100).nullish(),
  mrp: z.number().min(0).nullish(),
  costPrice: z.number().min(0).nullish(),
  category: z.string().max(50).nullish(),
  subcategory: z.string().max(50).nullish(),
  description: z.string().max(2000).nullish(),
  // Extended supplier-catalogue attributes
  ean: z.string().max(20).nullish(),
  margin: z.number().min(0).max(100).nullish(),
  brand: z.string().max(100).nullish(),
  grammage: z.string().max(50).nullish(),
  packingType: z.string().max(50).nullish(),
  basicPrice: z.number().min(0).nullish(),
  gstValue: z.number().min(0).nullish(),
  shelfLifeDays: z.number().int().min(0).nullish(),
  rtvAllowed: z.boolean().nullish(),
  vendorPackSize: z.string().max(50).nullish(),
  packagingDimension: z.string().max(100).nullish(),
  temperature: z.string().max(20).nullish(),
  cutoffTime: z.string().max(20).nullish(),
  productType: z.string().max(50).nullish(),
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
