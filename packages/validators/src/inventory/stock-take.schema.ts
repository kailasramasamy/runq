import { z } from 'zod';

export const stockTakeScopeSchema = z.enum(['full', 'partial', 'cycle']);

export const startStockTakeSchema = z.object({
  warehouseId: z.string().uuid(),
  scope: stockTakeScopeSchema.default('full'),
  categoryId: z.string().uuid().nullish(),
  notes: z.string().max(500).nullish(),
  freeze: z.boolean().optional(),
});

export const upsertCountLinesSchema = z.object({
  lines: z.array(z.object({
    itemId: z.string().uuid(),
    batchNo: z.string().max(60).nullish(),
    countedQty: z.number().nonnegative(),
  })).min(1).max(500),
});

export const updateCountLineSchema = z.object({
  countedQty: z.number().nonnegative(),
  recountFlag: z.boolean().optional(),
});

export const recountStockTakeSchema = z.object({
  // Mark lines as needing recount: either explicit IDs or a variance threshold.
  lineIds: z.array(z.string().uuid()).optional(),
  varianceThresholdPct: z.number().nonnegative().max(100).optional(),
});

export const stockTakeFilterSchema = z.object({
  status: z.enum(['in_progress', 'reviewed', 'posted', 'cancelled']).optional(),
  warehouseId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

export type StartStockTakeInput = z.infer<typeof startStockTakeSchema>;
export type UpsertCountLinesInput = z.infer<typeof upsertCountLinesSchema>;
export type UpdateCountLineInput = z.infer<typeof updateCountLineSchema>;
export type RecountStockTakeInput = z.infer<typeof recountStockTakeSchema>;
export type StockTakeFilter = z.infer<typeof stockTakeFilterSchema>;
export type StockTakeScope = z.infer<typeof stockTakeScopeSchema>;
