import { z } from 'zod';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

/**
 * One teardown line: a finished-goods batch is opened and the material inside
 * goes back to the raw-material pool.
 *
 * `recoveredQty` is entered rather than derived — 100 x 500ml packets rarely
 * give back a clean 50 L, and the operator is the only one who knows how much
 * actually made it into the tank.
 */
/**
 * Only `fgItemId` and `fgQty` are required. The mobile teardown screen sends
 * just those plus a destination — the technician counts packets and picks what
 * they are for; the server reads the FG's BOM backwards to work out which raw
 * material comes out and how much, and generates the batch and expiry.
 *
 * The detailed web form still sends everything explicitly, and anything it
 * supplies wins over the derived value.
 */
export const reclaimLineInputSchema = z.object({
  fgItemId: z.string().uuid(),
  fgBatchNo: z.string().max(60).nullish(),
  fgQty: z.number().positive(),
  recoveredItemId: z.string().uuid().optional(),
  recoveredBatchNo: z.string().max(60).nullish(),
  recoveredQty: z.number().positive().optional(),
  expiryDate: dateString.nullish(),
  /** What the recovered material is earmarked for. Intent only. */
  destinationItemId: z.string().uuid().nullish(),
  notes: z.string().max(500).nullish(),
}).refine((l) => l.recoveredItemId !== l.fgItemId, {
  message: 'Recovered item must differ from the finished good being opened',
  path: ['recoveredItemId'],
});

export const createReclaimSchema = z.object({
  warehouseId: z.string().uuid(),
  reclaimDate: dateString,
  notes: z.string().max(500).nullish(),
  idempotencyKey: z.string().max(64).nullish(),
  lines: z.array(reclaimLineInputSchema).min(1),
});

export const cancelReclaimSchema = z.object({
  reason: z.string().min(1).max(500),
});

export const reclaimFilterSchema = z.object({
  status: z.enum(['draft', 'posted', 'cancelled']).optional(),
  warehouseId: z.string().uuid().optional(),
  from: dateString.optional(),
  to: dateString.optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

export type ReclaimLineInput = z.infer<typeof reclaimLineInputSchema>;
export type CreateReclaimInput = z.infer<typeof createReclaimSchema>;
export type CancelReclaimInput = z.infer<typeof cancelReclaimSchema>;
export type ReclaimFilter = z.infer<typeof reclaimFilterSchema>;
