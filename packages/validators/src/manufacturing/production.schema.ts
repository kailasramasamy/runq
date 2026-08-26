import { z } from 'zod';
import { wastageSchema } from './run.schema';

/**
 * Manufacturing — unplanned production entry validators.
 * Spec: docs/manufacturing-plan.md §5.6.
 */

/**
 * A technician override of the backflushed allocation for one input.
 *
 * Overrides describe the WHOLE input line, not a patch on it: as soon as one
 * is supplied for any item the line accepts, the server's own allocation for
 * that line is dropped. So the caller must list every batch actually used —
 * anything left out is not drawn.
 */
export const productionLineOverrideSchema = z.object({
  inputItemId: z.string().uuid(),
  batchNo: z.string().max(60).nullish(),
  qty: z.number().positive('Qty must be positive'),
});

const productionBaseSchema = z.object({
  /** Either bomId or outputItemId — the latter resolves to the active BOM. */
  bomId: z.string().uuid().nullish(),
  outputItemId: z.string().uuid().nullish(),
  producedQty: z.number().positive('Produced qty must be positive'),
  warehouseId: z.string().uuid(),
  lines: z.array(productionLineOverrideSchema).optional(),
});

const requireBomRef = <T extends { bomId?: string | null; outputItemId?: string | null }>(
  value: T,
  ctx: z.RefinementCtx,
): void => {
  if (!value.bomId && !value.outputItemId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Provide either bomId or outputItemId',
      path: ['bomId'],
    });
  }
};

export const productionPreviewSchema = productionBaseSchema.superRefine(requireBomRef);

export const recordProductionSchema = productionBaseSchema
  .extend({
    /** Auto-generated as `<bom_code>-<YYYYMMDD>-<seq>` when omitted. */
    batchNo: z.string().max(60).nullish(),
    /** Required when the output item tracks batches. */
    expiryDate: z.string().date().nullish(),
    shift: z.string().max(20).nullish(),
    /** Defaults to today. Lets the floor log a run recorded the next morning. */
    producedOn: z.string().date().nullish(),
    notes: z.string().nullish(),
    /** Client-generated dedupe key (mobile offline-queue replay). */
    idempotencyKey: z.string().max(64).nullish(),
    /** Input material lost in the run — written off, not absorbed into cost. */
    wastage: wastageSchema.optional(),
  })
  .superRefine(requireBomRef);

/** Read-only pool lookup — a BOM and the warehouse to read stock in. */
export const inputPoolQuerySchema = z.object({
  bomId: z.string().uuid(),
  warehouseId: z.string().uuid(),
});

export type InputPoolQuery = z.infer<typeof inputPoolQuerySchema>;
export type ProductionLineOverride = z.infer<typeof productionLineOverrideSchema>;
export type ProductionPreviewInput = z.infer<typeof productionPreviewSchema>;
export type RecordProductionInput = z.infer<typeof recordProductionSchema>;
