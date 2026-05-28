import { z } from 'zod';

/**
 * PP Phase 2 — Receive against PO validators.
 * Spec: docs/purchase-procurement-plan.md §5.2.
 *
 * The receive flow wraps the existing inventory GRN primitives with PO
 * linkage + denormalised counter updates + PO status transitions.
 */

const receiveLineSchema = z.object({
  /** PO line being fulfilled. Drives qty_received counter on the PO. */
  poLineId: z.string().uuid(),
  /**
   * Vendor catalog row being received. The catalog row is the unit of
   * procurement — items master is a downstream optional bridge for stock-
   * tracked goods (catalog.inventory_item_id). Server resolves both.
   */
  catalogItemId: z.string().uuid(),
  qty: z.number().positive('Received qty must be positive'),
  /** Use PO line's unit rate when omitted; the server defaults to it. */
  unitCost: z.number().nonnegative().nullish(),
  batchNo: z.string().max(60).nullish(),
  mfgDate: z.string().date().nullish(),
  expiryDate: z.string().date().nullish(),
  serialNos: z.array(z.string().min(1)).nullish(),
  notes: z.string().nullish(),
});

export const receiveAgainstPoSchema = z.object({
  warehouseId: z.string().uuid(),
  receivedDate: z.string().date(),
  vehicleNo: z.string().max(30).nullish(),
  lrNo: z.string().max(40).nullish(),
  notes: z.string().nullish(),
  lines: z.array(receiveLineSchema).min(1, 'At least one line required'),
});

export type ReceiveAgainstPoInput = z.infer<typeof receiveAgainstPoSchema>;
