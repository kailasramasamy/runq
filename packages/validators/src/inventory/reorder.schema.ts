import { z } from 'zod';

export const upsertReorderRuleSchema = z.object({
  itemId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  reorderLevel: z.number().nonnegative(),
  reorderQty: z.number().nonnegative(),
  leadTimeDays: z.number().int().nonnegative().max(365).nullish(),
});

export const expiryFilterSchema = z.object({
  withinDays: z.coerce.number().int().positive().max(365).default(30),
  warehouseId: z.string().uuid().optional(),
  includeExpired: z.coerce.boolean().optional(),
});

export type UpsertReorderRuleInput = z.infer<typeof upsertReorderRuleSchema>;
export type ExpiryFilter = z.infer<typeof expiryFilterSchema>;
