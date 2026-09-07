import { z } from 'zod';

/**
 * Manufacturing — draws. Milk taken now, the product recorded later.
 *
 * There is no FEFO here on purpose: the operator is standing at the tank and
 * names the lots they are pouring from. Every line is explicit, and the server
 * validates each against that batch's on-hand rather than sliding a shortfall
 * onto the next can.
 */

const drawLineSchema = z.object({
  inputItemId: z.string().uuid(),
  /** Null only for stock that is not batch-tracked. */
  batchNo: z.string().max(60).nullish(),
  qty: z.number().positive('Qty must be positive'),
  uom: z.string().min(1).max(20),
});

export const openDrawSchema = z.object({
  /** What the milk is being taken for — known at draw time, always. */
  outputItemId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  shift: z.string().max(20).nullish(),
  lines: z.array(drawLineSchema).min(1, 'Pick at least one batch'),
});

/** More milk into a draw that is already open — a kettle topped up. */
export const takeMoreSchema = z.object({
  lines: z.array(drawLineSchema).min(1, 'Pick at least one batch'),
});

export const closeDrawSchema = z.object({
  qty: z.number().positive('Enter what was made'),
  batchNo: z.string().max(60).nullish(),
  /** Required when the product tracks batches. */
  expiryDate: z.string().date().nullish(),
  notes: z.string().nullish(),
});

export const drawListQuerySchema = z.object({
  open: z.coerce.boolean().optional(),
});

export const yieldHintQuerySchema = z.object({
  outputItemId: z.string().uuid(),
});

export type DrawLineInput = z.infer<typeof drawLineSchema>;
export type OpenDrawInput = z.infer<typeof openDrawSchema>;
export type TakeMoreInput = z.infer<typeof takeMoreSchema>;
export type CloseDrawInput = z.infer<typeof closeDrawSchema>;
