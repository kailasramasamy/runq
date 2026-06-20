import { z } from 'zod';

/**
 * Dhenu milk-procurement — farmer pour (collection) validators.
 * Spec: docs/dhenu-schema-spec.md §5.1.
 *
 * Recording resolves the rate from the active chart, computes amounts, and
 * stamps a receipt number. Append-only: a repeat for the same
 * (farmer, date, shift, milkType) reverses the prior one (last-write-wins) —
 * unless `asNewLot` is set, which keeps both as separately-priced lots
 * (multiple cans, or cow + buffalo in one shift).
 */

export const recordPourSchema = z
  .object({
    nodeId: z.string().uuid(),
    farmerId: z.string().uuid(),
    collectionDate: z.string().date(),
    shift: z.enum(['am', 'pm']),
    milkType: z.enum(['cow', 'buffalo', 'mixed', 'cow_a1', 'cow_a2']),
    qtyLitres: z.number().positive(),
    // analyzer nodes send fat+snf; lactometer nodes send clr alone.
    fat: z.number().min(0).max(15).nullish(),
    snf: z.number().min(0).max(15).nullish(),
    clr: z.number().min(0).max(40).nullish(),
    tempC: z.number().min(-5).max(60).nullish(),
    captureSource: z.enum(['manual', 'device']).default('manual'),
    // mobile offline-queue replay dedupe (idempotency key)
    deviceLocalId: z.string().max(64).nullish(),
    // true → record an additional lot instead of replacing the prior same-slot pour
    asNewLot: z.boolean().default(false),
  })
  .refine((d) => d.clr != null || (d.fat != null && d.snf != null), {
    message: 'provide clr (lactometer) or fat+snf (analyzer)',
    path: ['clr'],
  });

export const pourFilterSchema = z.object({
  nodeId: z.string().uuid().optional(),
  farmerId: z.string().uuid().optional(),
  collectionDate: z.string().date().optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  shift: z.enum(['am', 'pm']).optional(),
  status: z.enum(['recorded', 'reversed']).optional(),
});

export type RecordPourInput = z.infer<typeof recordPourSchema>;
export type PourFilter = z.infer<typeof pourFilterSchema>;
