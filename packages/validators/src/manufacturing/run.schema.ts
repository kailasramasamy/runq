import { z } from 'zod';

/**
 * Manufacturing Phase 2 — Run + costing validators.
 * Spec: docs/manufacturing-plan.md §5.3 + §8 + §9.
 */

export const recordConsumptionSchema = z.object({
  bomLineId: z.string().uuid().nullish(),
  inputItemId: z.string().uuid(),
  batchNo: z.string().max(60).nullish(),
  warehouseId: z.string().uuid(),
  qty: z.number().positive('Qty must be positive'),
  uom: z.string().min(1).max(20),
  notes: z.string().nullish(),
  /** Client-generated dedupe key (mobile offline-queue replay). Optional;
   * server returns the existing row when this key has already been used
   * for this tenant. UUIDv4 recommended. */
  idempotencyKey: z.string().max(64).nullish(),
});

export const recordOutputSchema = z.object({
  outputItemId: z.string().uuid(),
  /**
   * Optional — service auto-generates `<bom_code>-<YYYYMMDD>-<seq>` if omitted.
   * Caller can supply (e.g. operator wants to print a custom batch sticker).
   */
  batchNo: z.string().max(60).nullish(),
  warehouseId: z.string().uuid(),
  qty: z.number().positive('Qty must be positive'),
  uom: z.string().min(1).max(20),
  expiryDate: z.string().date().nullish(),
  notes: z.string().nullish(),
  /** Client-generated dedupe key (mobile offline-queue replay). */
  idempotencyKey: z.string().max(64).nullish(),
});

export const closeWorkOrderSchema = z.object({
  /** Confirms operator has reviewed variance; required if variance > 20% of expected. */
  varianceAcknowledged: z.boolean().default(false),
});

export const suggestBatchesQuerySchema = z.object({
  inputItemId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  requiredQty: z
    .union([z.number(), z.string()])
    .transform((v) => (typeof v === 'number' ? v : Number(v)))
    .pipe(z.number().nonnegative())
    .optional(),
});

export type RecordConsumptionInput = z.infer<typeof recordConsumptionSchema>;
export type RecordOutputInput = z.infer<typeof recordOutputSchema>;
export type CloseWorkOrderInput = z.infer<typeof closeWorkOrderSchema>;
export type SuggestBatchesQuery = z.infer<typeof suggestBatchesQuerySchema>;
