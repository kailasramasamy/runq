import { z } from 'zod';

/**
 * Manufacturing Phase 1 — Work Order validators.
 * Spec: docs/manufacturing-plan.md §5.2 + §4.3.
 *
 * Phase 1 covers the planning surface only: create / edit / cancel.
 * start / complete / close land in Phase 2 alongside consumption + output.
 */

export const WO_STATUS_VALUES = [
  'draft',
  'in_progress',
  'completed',
  'closed',
  'cancelled',
] as const;

export const QC_STATUS_VALUES = [
  'pending',
  'passed',
  'failed',
  'conditional',
] as const;

export const createWorkOrderSchema = z.object({
  bomId: z.string().uuid(),
  plannedQty: z.number().positive('Planned qty must be positive'),
  warehouseId: z.string().uuid(),
  shift: z.string().max(20).nullish(),
  scheduledFor: z.string().date(),
});

export const updateWorkOrderSchema = createWorkOrderSchema.partial();

export const cancelWorkOrderSchema = z.object({
  reason: z.string().max(500).nullish(),
});

export const workOrderFilterSchema = z.object({
  status: z.string().optional(), // comma-separated allowed
  bomId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
  scheduledFrom: z.string().date().optional(),
  scheduledTo: z.string().date().optional(),
  search: z.string().optional(),
});

export type CreateWorkOrderInput = z.infer<typeof createWorkOrderSchema>;
export type UpdateWorkOrderInput = z.infer<typeof updateWorkOrderSchema>;
export type CancelWorkOrderInput = z.infer<typeof cancelWorkOrderSchema>;
export type WorkOrderFilter = z.infer<typeof workOrderFilterSchema>;
