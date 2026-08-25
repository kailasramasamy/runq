import { z } from 'zod';
import { wastageSchema } from './run.schema';

/**
 * Manufacturing — unplanned production entry validators.
 * Spec: docs/manufacturing-plan.md §5.6.
 */

/**
 * A technician override of the backflushed allocation for one input.
 *
 * Supplying any override for an item replaces the server's FEFO allocation for
 * that item entirely — so a partial override must list every batch actually
 * used, not just the changed one.
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

export type ProductionLineOverride = z.infer<typeof productionLineOverrideSchema>;
export type ProductionPreviewInput = z.infer<typeof productionPreviewSchema>;
export type RecordProductionInput = z.infer<typeof recordProductionSchema>;
