import { z } from 'zod';

/**
 * Dhenu milk-procurement — per-slot collection close validators.
 *
 * Closing a (node, date, shift) freezes pours/edits for it and gates dispatch.
 * `shift` is omitted by a pooled node (`day` / `overnight` dispatch mode) — the
 * service closes the mode's whole window; a `per_shift` node must name the
 * shift. The requirement depends on node state, so it is enforced in the
 * service, not here.
 */

export const closeShiftSchema = z.object({
  nodeId: z.string().uuid(),
  collectionDate: z.string().date(),
  shift: z.enum(['am', 'pm']).optional(),
});

export const reopenShiftSchema = closeShiftSchema;

export const shiftStatusQuerySchema = z.object({
  nodeId: z.string().uuid(),
  date: z.string().date(),
});

export type CloseShiftInput = z.infer<typeof closeShiftSchema>;
export type ReopenShiftInput = z.infer<typeof reopenShiftSchema>;
export type ShiftStatusQuery = z.infer<typeof shiftStatusQuerySchema>;
