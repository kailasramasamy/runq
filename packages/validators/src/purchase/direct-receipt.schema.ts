import { z } from 'zod';

/**
 * PP Phase 4 — Direct Receipt validators.
 * Spec: docs/purchase-procurement-plan.md §9.
 *
 * Memo path for "qty in without bill". Vrindavan use case: daily milk
 * arrivals while Milk Procurement module is still pending. Generic
 * enough for any SME — bulk grain at a flour mill, scrap intake at
 * a fabricator, vegetable produce at a restaurant.
 *
 * One direct-receipt = one inventory_grns row (source='direct'). No JE
 * posted (financial side handled by separate AP bill flow / future
 * Milk Procurement module).
 */

export const createDirectReceiptSchema = z.object({
  warehouseId: z.string().uuid(),
  inventoryItemId: z.string().uuid(),
  receivedAt: z.string().date(),
  qty: z.number().positive('Qty must be positive'),
  unitRate: z.number().nonnegative('Rate cannot be negative'),
  /** Free-text label for the source (e.g. farmer name, "Plant A morning shift"). */
  sourceLabel: z.string().max(120).nullish(),
  batchNo: z.string().max(60).nullish(),
  mfgDate: z.string().date().nullish(),
  expiryDate: z.string().date().nullish(),
  vehicleNo: z.string().max(30).nullish(),
  lrNo: z.string().max(40).nullish(),
  notes: z.string().nullish(),
});

export const directReceiptFilterSchema = z.object({
  warehouseId: z.string().uuid().optional(),
  inventoryItemId: z.string().uuid().optional(),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
});

export type CreateDirectReceiptInput = z.infer<typeof createDirectReceiptSchema>;
export type DirectReceiptFilter = z.infer<typeof directReceiptFilterSchema>;
