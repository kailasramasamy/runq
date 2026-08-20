import { z } from 'zod';

/**
 * Dhenu milk-procurement — goods sold TO a farmer (the trader who supplies us
 * and also buys from us). Recovered as a `farmer_sale` deduction on the next
 * payout cycle, ahead of advances.
 *
 * Two kinds: `raw_milk` off the centre's own pool (whose litres also count as
 * an outflow at the node), and `product` — ghee, curd, paneer — from the item
 * master. A line is one or the other, never both; the check constraint on
 * mp_farmer_sales enforces the same rule in the database.
 */

const milkTypeEnum = z.enum(['cow', 'buffalo', 'mixed', 'cow_a1', 'cow_a2']);

export const createFarmerSaleSchema = z.object({
  farmerId: z.string().uuid(),
  nodeId: z.string().uuid(),
  saleDate: z.string().date(),
  kind: z.enum(['raw_milk', 'product']).default('raw_milk'),
  // raw_milk only. Shift is required at a per-shift centre and ignored at a
  // pooled one — the service resolves it from the node's dispatch mode.
  shift: z.enum(['am', 'pm']).nullish(),
  milkType: milkTypeEnum.nullish(),
  // product only.
  itemId: z.string().uuid().nullish(),
  qty: z.number().positive(),
  ratePerUnit: z.number().positive(),
  note: z.string().max(255).nullish(),
}).superRefine((v, ctx) => {
  if (v.kind === 'raw_milk' && !v.milkType) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['milkType'], message: 'milkType is required for a raw-milk sale' });
  }
  if (v.kind === 'product' && !v.itemId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['itemId'], message: 'itemId is required for a product sale' });
  }
});

/** Same fields as a create, minus the farmer and centre — a correction fixes
 *  what was sold, not who bought it. Sent whole, not patched field by field. */
export const updateFarmerSaleSchema = z.object({
  saleDate: z.string().date(),
  kind: z.enum(['raw_milk', 'product']),
  shift: z.enum(['am', 'pm']).nullish(),
  milkType: milkTypeEnum.nullish(),
  itemId: z.string().uuid().nullish(),
  qty: z.number().positive(),
  ratePerUnit: z.number().positive(),
  note: z.string().max(255).nullish(),
}).superRefine((v, ctx) => {
  if (v.kind === 'raw_milk' && !v.milkType) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['milkType'], message: 'milkType is required for a raw-milk sale' });
  }
  if (v.kind === 'product' && !v.itemId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['itemId'], message: 'itemId is required for a product sale' });
  }
});

export const farmerSaleFilterSchema = z.object({
  farmerId: z.string().uuid().optional(),
  nodeId: z.string().uuid().optional(),
  kind: z.enum(['raw_milk', 'product']).optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  includeReversed: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export type CreateFarmerSaleInput = z.infer<typeof createFarmerSaleSchema>;
export type UpdateFarmerSaleInput = z.infer<typeof updateFarmerSaleSchema>;
export type FarmerSaleFilter = z.infer<typeof farmerSaleFilterSchema>;
