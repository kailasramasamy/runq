import { z } from 'zod';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

export const transferLineInputSchema = z.object({
  itemId: z.string().uuid(),
  batchNo: z.string().max(60).nullish(),
  qty: z.number().positive(),
});

export const createTransferSchema = z
  .object({
    fromWarehouseId: z.string().uuid(),
    toWarehouseId: z.string().uuid(),
    vehicleNo: z.string().max(30).nullish(),
    notes: z.string().max(500).nullish(),
    lines: z.array(transferLineInputSchema).min(1),
  })
  .refine((v) => v.fromWarehouseId !== v.toWarehouseId, {
    message: 'fromWarehouseId and toWarehouseId must differ',
    path: ['toWarehouseId'],
  });

export const updateTransferSchema = z.object({
  fromWarehouseId: z.string().uuid().optional(),
  toWarehouseId: z.string().uuid().optional(),
  vehicleNo: z.string().max(30).nullish(),
  notes: z.string().max(500).nullish(),
  lines: z.array(transferLineInputSchema).min(1).optional(),
});

export const receiveTransferSchema = z.object({
  // Per-line received qty. Omitted lines default to their dispatched qty.
  lineReceipts: z.array(z.object({
    lineId: z.string().uuid(),
    qtyReceived: z.number().nonnegative(),
  })).optional(),
});

export const cancelTransferSchema = z.object({
  reason: z.string().min(1).max(500),
});

export const transferFilterSchema = z.object({
  status: z.enum(['draft', 'in_transit', 'received', 'cancelled']).optional(),
  fromWarehouseId: z.string().uuid().optional(),
  toWarehouseId: z.string().uuid().optional(),
  from: dateString.optional(),
  to: dateString.optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

export type CreateTransferInput = z.infer<typeof createTransferSchema>;
export type UpdateTransferInput = z.infer<typeof updateTransferSchema>;
export type ReceiveTransferInput = z.infer<typeof receiveTransferSchema>;
export type CancelTransferInput = z.infer<typeof cancelTransferSchema>;
export type TransferLineInput = z.infer<typeof transferLineInputSchema>;
export type TransferFilter = z.infer<typeof transferFilterSchema>;
