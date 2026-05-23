import { z } from 'zod';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

export const dnLineInputSchema = z.object({
  itemId: z.string().uuid(),
  // batchNo optional — empty means FEFO suggestion or non-batch item
  batchNo: z.string().max(60).nullish(),
  qty: z.number().positive(),
  uom: z.string().max(20).nullish(),
  notes: z.string().max(500).nullish(),
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

export const cancelDeliveryNoteSchema = z.object({
  reason: z.string().min(1).max(500),
});

export const deliveryNoteFilterSchema = z.object({
  status: z.enum(['draft', 'dispatched', 'cancelled']).optional(),
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
