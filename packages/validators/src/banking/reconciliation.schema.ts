import { z } from 'zod';

export const autoReconcileSchema = z.object({
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
});

export const manualMatchSchema = z.object({
  bankTransactionId: z.string().uuid(),
  matchType: z.enum(['vendor_payment', 'payment_receipt']),
  matchId: z.string().uuid(),
});

export const unmatchSchema = z.object({
  bankTransactionId: z.string().uuid(),
});

export type AutoReconcileInput = z.infer<typeof autoReconcileSchema>;
export type ManualMatchInput = z.infer<typeof manualMatchSchema>;
export type UnmatchInput = z.infer<typeof unmatchSchema>;
