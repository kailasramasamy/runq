import { z } from 'zod';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

// `free_issue` — stock handed over without an invoice (extra cases to the
// logistics team to cover their breakages, trade samples). Separate from
// `damage` because the goods are intact: the cost is distribution, not
// write-off, and GST §17(5)(h) requires the input tax on it to be reversed.
export const adjustmentReasonSchema = z.enum([
  'damage', 'expiry', 'theft', 'found', 'revaluation', 'correction', 'opening_balance',
  'free_issue',
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
  // Input tax to reverse under GST §17(5)(h). Recorded for the GSTR-3B Table
  // 4(B) wiring; no journal line is posted against it.
  itcReversalValue: z.number().nonnegative().optional(),
  // False = write the ledger movements but no journal entry, for stock the GL
  // never capitalised (MP raw milk). Defaults true.
  postGl: z.boolean().optional(),
  lines: z.array(adjustmentLineInputSchema).min(1),
});

export const updateAdjustmentSchema = z.object({
  warehouseId: z.string().uuid().optional(),
  reason: adjustmentReasonSchema.optional(),
  adjustmentDate: dateString.optional(),
  notes: z.string().max(500).nullish(),
  itcReversalValue: z.number().nonnegative().optional(),
  postGl: z.boolean().optional(),
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

/**
 * Zero-out preview filter. Warehouse is required — on-hand is only meaningful
 * per warehouse, and a tenant-wide flatten is never what anyone wants.
 */
export const zeroOutPreviewSchema = z.object({
  warehouseId: z.string().uuid(),
  itemClass: z.enum([
    'raw_material', 'packaging', 'finished_good', 'semi_finished',
    'trading_good', 'consumable', 'spare_part',
  ]).optional(),
  itemIds: z
    .union([z.string().uuid(), z.array(z.string().uuid())])
    .transform((v) => (Array.isArray(v) ? v : [v]))
    .optional(),
});

export type ZeroOutPreviewQuery = z.infer<typeof zeroOutPreviewSchema>;
export type CreateAdjustmentInput = z.infer<typeof createAdjustmentSchema>;
export type UpdateAdjustmentInput = z.infer<typeof updateAdjustmentSchema>;
export type CancelAdjustmentInput = z.infer<typeof cancelAdjustmentSchema>;
export type AdjustmentLineInput = z.infer<typeof adjustmentLineInputSchema>;
export type AdjustmentReason = z.infer<typeof adjustmentReasonSchema>;
export type AdjustmentFilter = z.infer<typeof adjustmentFilterSchema>;
