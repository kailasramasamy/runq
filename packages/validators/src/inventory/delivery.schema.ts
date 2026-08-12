import { z } from 'zod';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

export const dnLineInputSchema = z.object({
  itemId: z.string().uuid(),
  // batchNo optional — empty means FEFO suggestion or non-batch item
  batchNo: z.string().max(60).nullish(),
  qty: z.number().positive(),
  uom: z.string().max(20).nullish(),
  notes: z.string().max(500).nullish(),
  // Set only when the line originated from an AR invoice line.
  invoiceLineId: z.string().uuid().nullish(),
});

export const createDeliveryNoteSchema = z.object({
  warehouseId: z.string().uuid(),
  customerId: z.string().uuid().nullish(),
  dispatchDate: dateString,
  vehicleNo: z.string().max(30).nullish(),
  lrNo: z.string().max(40).nullish(),
  eWayBillNo: z.string().max(30).nullish(),
  notes: z.string().max(500).nullish(),
  lines: z.array(dnLineInputSchema).min(1, 'At least one line is required'),
});

export const updateDeliveryNoteSchema = createDeliveryNoteSchema.partial().extend({
  lines: z.array(dnLineInputSchema).min(1).optional(),
});

/**
 * Confirming a row off the "Awaiting dispatch" queue. Lines are echoed back
 * from the preview so the operator can trim quantities or override the
 * FEFO-suggested batch before stock moves.
 */
export const dispatchFromInvoiceSchema = z.object({
  warehouseId: z.string().uuid(),
  dispatchDate: dateString,
  vehicleNo: z.string().max(30).nullish(),
  lrNo: z.string().max(40).nullish(),
  notes: z.string().max(500).nullish(),
  lines: z.array(dnLineInputSchema.extend({
    invoiceLineId: z.string().uuid(),
  })).min(1, 'At least one line is required'),
});

export const pendingDispatchFilterSchema = z.object({
  customerId: z.string().uuid().optional(),
  from: dateString.optional(),
  to: dateString.optional(),
  q: z.string().max(120).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

/**
 * Clearing a backlog off the "Awaiting dispatch" queue in one action.
 *
 * Capped at 25 ids because the server ships them strictly one after another
 * — concurrent dispatches race for the same batches — so an unbounded list
 * would hold a request open past any sane proxy timeout. Clients chunk and
 * show progress instead.
 */
export const bulkDispatchSchema = z.object({
  invoiceIds: z.array(z.string().uuid()).min(1).max(25),
  /** `invoice` backdates each DN to its invoice date; `today` posts now. */
  dateMode: z.enum(['invoice', 'today']).default('invoice'),
  warehouseId: z.string().uuid().nullish(),
});

/**
 * The inventory cut-over: everything invoiced on or before [upto] leaves the
 * dispatch queue without moving stock. For a tenant whose invoicing predates
 * its warehouse, these goods went out before inventory existed to record it.
 *
 * [upto] is required and has no default — silently waiving "everything" is
 * not something a caller should be able to do by omission.
 */
export const waiveDispatchSchema = z.object({
  upto: dateString,
  /** Narrows the sweep to specific invoices; omit to take the whole window. */
  invoiceIds: z.array(z.string().uuid()).max(1000).optional(),
});

/** Records goods coming back against a dispatched DN, at its original cost. */
export const salesReturnSchema = z.object({
  returnDate: dateString,
  reason: z.string().min(1).max(500),
  creditNoteId: z.string().uuid().nullish(),
  lines: z.array(z.object({
    dnLineId: z.string().uuid(),
    qty: z.number().positive(),
  })).min(1, 'At least one line is required'),
});

export const cancelDeliveryNoteSchema = z.object({
  reason: z.string().min(1).max(500),
});

export const deliveryNoteFilterSchema = z.object({
  status: z.enum(['draft', 'dispatched', 'cancelled']).optional(),
  direction: z.enum(['out', 'in']).optional(),
  // 'linked' = raised from an invoice, 'unlinked' = keyed in by hand.
  source: z.enum(['linked', 'unlinked']).optional(),
  warehouseId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  from: dateString.optional(),
  to: dateString.optional(),
  q: z.string().max(120).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

export type CreateDeliveryNoteInput = z.infer<typeof createDeliveryNoteSchema>;
export type UpdateDeliveryNoteInput = z.infer<typeof updateDeliveryNoteSchema>;
export type DnLineInput = z.infer<typeof dnLineInputSchema>;
export type DeliveryNoteFilter = z.infer<typeof deliveryNoteFilterSchema>;
export type CancelDeliveryNoteInput = z.infer<typeof cancelDeliveryNoteSchema>;
export type DispatchFromInvoiceInput = z.infer<typeof dispatchFromInvoiceSchema>;
export type PendingDispatchFilter = z.infer<typeof pendingDispatchFilterSchema>;
export type SalesReturnInput = z.infer<typeof salesReturnSchema>;
export type BulkDispatchInput = z.infer<typeof bulkDispatchSchema>;
export type WaiveDispatchInput = z.infer<typeof waiveDispatchSchema>;
