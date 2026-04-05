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
  category: z.string().max(50).nullish(),
  description: z.string().max(2000).nullish(),
});

export const updateItemSchema = createItemSchema.partial();

export const itemFilterSchema = z.object({
  search: z.string().optional(),
  type: z.enum(['product', 'service']).optional(),
  category: z.string().optional(),
});

export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
export type ItemFilterInput = z.infer<typeof itemFilterSchema>;
