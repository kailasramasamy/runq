import { z } from 'zod';
import { hsnSacCodeSchema } from '../common/hsn.schema';

/**
 * PP Phase 1 — Purchase Order validators.
 * Spec: docs/purchase-procurement-plan.md §5.1 + §10.
 *
 * Lines are free-text per the AP Pattern-B principle (no FK to items
 * master). `catalogItemId` is optional and lets the picker carry the
 * vendor-catalog reuse linkage forward when the user picks from the
 * suggestion combobox.
 *
 * A PO is a QUANTITY commitment, not a price commitment — the price is
 * only known when the vendor's invoice arrives. So every money field is
 * optional and defaults to 0. A zero-valued PO is the normal case; the
 * legacy priced ones (created before this change) still round-trip.
 */

export const PURCHASE_ORDER_STATUS_VALUES = [
  'draft', 'sent', 'partially_received', 'received', 'closed', 'cancelled',
] as const;

const poLineSchema = z.object({
  description: z.string().min(1).max(255),
  catalogItemId: z.string().uuid().nullish(),
  uom: z.string().max(20).nullish(),
  hsnSacCode: hsnSacCodeSchema.nullish(),
  qtyOrdered: z.number().positive('Qty must be positive'),
  unitRate: z.number().nonnegative('Rate cannot be negative').default(0),
  amount: z.number().nonnegative('Amount cannot be negative').default(0),
  taxRate: z.number().min(0).max(100).nullish(),
  taxAmount: z.number().nonnegative().nullish(),
  notes: z.string().nullish(),
});

export const createPurchaseOrderSchema = z.object({
  vendorId: z.string().uuid(),
  poDate: z.string().date(),
  expectedDate: z.string().date().nullish(),
  deliveryAddress: z.string().nullish(),
  paymentTerms: z.string().max(100).nullish(),
  notes: z.string().nullish(),
  lines: z.array(poLineSchema).min(1, 'At least one line required'),
  subtotal: z.number().nonnegative().default(0),
  taxTotal: z.number().nonnegative().default(0),
  total: z.number().nonnegative().default(0),
});

export const updatePurchaseOrderSchema = createPurchaseOrderSchema.partial();

export const sendPurchaseOrderSchema = z.object({
  // Reserved for future fields (email recipient, CC list). Phase 1 = no-op body.
});

export const closePurchaseOrderSchema = z.object({
  reason: z.string().min(1, 'A short-close reason is required').max(500),
});

export const cancelPurchaseOrderSchema = z.object({
  reason: z.string().max(500).nullish(),
});

export const purchaseOrderFilterSchema = z.object({
  vendorId: z.string().uuid().optional(),
  // Single status or comma-separated (`draft,sent,partially_received`) so
  // the UI's "Open" tab can express a group.
  status: z.string()
    .refine(
      (s) => s.split(',').map((p) => p.trim()).filter(Boolean)
        .every((p) => (PURCHASE_ORDER_STATUS_VALUES as readonly string[]).includes(p)),
      { message: `status must be one or more of: ${PURCHASE_ORDER_STATUS_VALUES.join(', ')}` },
    )
    .optional(),
  search: z.string().optional(),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
});

export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;
export type UpdatePurchaseOrderInput = z.infer<typeof updatePurchaseOrderSchema>;
export type ClosePurchaseOrderInput = z.infer<typeof closePurchaseOrderSchema>;
export type CancelPurchaseOrderInput = z.infer<typeof cancelPurchaseOrderSchema>;
export type PurchaseOrderFilter = z.infer<typeof purchaseOrderFilterSchema>;
