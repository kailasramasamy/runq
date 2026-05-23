import { z } from 'zod';

// ISO date (YYYY-MM-DD) — accepted by Postgres `date` columns directly.
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

export const grnLineInputSchema = z.object({
  itemId: z.string().uuid(),
  batchNo: z.string().max(60).nullish(),
  mfgDate: dateString.nullish(),
  expiryDate: dateString.nullish(),
  qty: z.number().positive(),
  uom: z.string().max(20).nullish(),
  unitRate: z.number().nonnegative(),
  landedCostPerUnit: z.number().nonnegative().optional(),
  notes: z.string().max(500).nullish(),
});

export const createGrnSchema = z.object({
  warehouseId: z.string().uuid(),
  vendorId: z.string().uuid().nullish(),
  receivedDate: dateString,
  vehicleNo: z.string().max(30).nullish(),
  lrNo: z.string().max(40).nullish(),
  notes: z.string().max(500).nullish(),
  lines: z.array(grnLineInputSchema).min(1, 'At least one line is required'),
});

export const updateGrnSchema = createGrnSchema.partial().extend({
  // lines, if present, fully replace existing draft lines
  lines: z.array(grnLineInputSchema).min(1).optional(),
});

export const cancelGrnSchema = z.object({
  reason: z.string().min(1).max(500),
});

export const grnFilterSchema = z.object({
  status: z.enum(['draft', 'posted', 'cancelled']).optional(),
  warehouseId: z.string().uuid().optional(),
  vendorId: z.string().uuid().optional(),
  from: dateString.optional(),
  to: dateString.optional(),
  q: z.string().max(120).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

export type CreateGrnInput = z.infer<typeof createGrnSchema>;
export type UpdateGrnInput = z.infer<typeof updateGrnSchema>;
export type GrnLineInput = z.infer<typeof grnLineInputSchema>;
export type GrnFilter = z.infer<typeof grnFilterSchema>;
export type CancelGrnInput = z.infer<typeof cancelGrnSchema>;
