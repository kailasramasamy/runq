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

/**
 * An item the vendor sent that isn't on the PO yet (agreed on the spot). It
 * joins the PO as a new line ordered at exactly the received qty, and is
 * received in the same GRN.
 */
const extraItemSchema = receiveLineSchema.omit({ poLineId: true });

/**
 * A PO line typed as free text has no catalog row yet; the server finds or
 * creates one from its description before receiving, so the client may omit it.
 */
const poReceiveLineSchema = receiveLineSchema.extend({ catalogItemId: z.string().uuid().nullish() });

export const receiveAgainstPoSchema = z.object({
  warehouseId: z.string().uuid(),
  receivedDate: z.string().date(),
  vehicleNo: z.string().max(30).nullish(),
  lrNo: z.string().max(40).nullish(),
  notes: z.string().nullish(),
  lines: z.array(poReceiveLineSchema).default([]),
  extraItems: z.array(extraItemSchema).default([]),
  /**
   * Rates were entered at the gate, so no vendor invoice will follow — post
   * the receipt and an approved bill (qty × rate, GST from each catalog item)
   * together. Off = receipt only; the bill comes later from the invoice.
   */
  createBill: z.boolean().default(false),
}).refine((d) => d.lines.length + d.extraItems.length > 0, {
  message: 'At least one line required', path: ['lines'],
});

export type ReceiveAgainstPoInput = z.infer<typeof receiveAgainstPoSchema>;
export type ReceiveExtraItem = ReceiveAgainstPoInput['extraItems'][number];
