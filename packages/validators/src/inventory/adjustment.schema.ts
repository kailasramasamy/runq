import { z } from 'zod';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

export const adjustmentReasonSchema = z.enum([
  'damage', 'expiry', 'theft', 'found', 'revaluation', 'correction', 'opening_balance',
]);

export const adjustmentLineInputSchema = z.object({
  itemId: z.string().uuid(),
  batchNo: z.string().max(60).nullish(),
  // Signed: positive = found / inbound, negative = damage / outbound.
  qtyDelta: z.number().refine((n) => n !== 0, { message: 'qtyDelta cannot be zero' }),
  // For revaluation, optionally override the unit cost; otherwise we use
  // the current on-hand WA.
  unitCost: z.number().nonnegative().optional(),
  notes: z.string().max(500).nullish(),
});

export const createAdjustmentSchema = z.object({
  warehouseId: z.string().uuid(),
  reason: adjustmentReasonSchema,
  adjustmentDate: dateString,
  notes: z.string().max(500).nullish(),
  requiresApproval: z.boolean().optional(),
  lines: z.array(adjustmentLineInputSchema).min(1),
});

export const updateAdjustmentSchema = z.object({
  warehouseId: z.string().uuid().optional(),
  reason: adjustmentReasonSchema.optional(),
  adjustmentDate: dateString.optional(),
  notes: z.string().max(500).nullish(),
  lines: z.array(adjustmentLineInputSchema).min(1).optional(),
});

export const cancelAdjustmentSchema = z.object({
  reason: z.string().min(1).max(500),
});

export const adjustmentFilterSchema = z.object({
  status: z.enum(['draft', 'pending_approval', 'posted', 'cancelled']).optional(),
  warehouseId: z.string().uuid().optional(),
  reason: adjustmentReasonSchema.optional(),
  from: dateString.optional(),
  to: dateString.optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

export type CreateAdjustmentInput = z.infer<typeof createAdjustmentSchema>;
export type UpdateAdjustmentInput = z.infer<typeof updateAdjustmentSchema>;
export type CancelAdjustmentInput = z.infer<typeof cancelAdjustmentSchema>;
export type AdjustmentLineInput = z.infer<typeof adjustmentLineInputSchema>;
export type AdjustmentReason = z.infer<typeof adjustmentReasonSchema>;
export type AdjustmentFilter = z.infer<typeof adjustmentFilterSchema>;
