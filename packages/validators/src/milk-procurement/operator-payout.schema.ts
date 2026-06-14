import { z } from 'zod';

/**
 * Dhenu — lightweight operator-payout tracking. `compute` derives what each
 * active operator is owed for a period (commission from node volume + salary +
 * rent); the create call records that an operator was paid for that period —
 * the server recomputes the amounts, so the client only sends the key + ref.
 */

export const operatorPayoutComputeSchema = z.object({
  from: z.string().date(),
  to: z.string().date(),
  nodeId: z.string().uuid().optional(),
});

export const createOperatorPayoutSchema = z.object({
  operatorId: z.string().uuid(),
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
  paidOn: z.string().date().optional(),
  reference: z.string().max(120).optional(),
});

export const operatorPayoutFilterSchema = z.object({
  nodeId: z.string().uuid().optional(),
  operatorId: z.string().uuid().optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
});

export type OperatorPayoutComputeQuery = z.infer<typeof operatorPayoutComputeSchema>;
export type CreateOperatorPayoutInput = z.infer<typeof createOperatorPayoutSchema>;
export type OperatorPayoutFilter = z.infer<typeof operatorPayoutFilterSchema>;
