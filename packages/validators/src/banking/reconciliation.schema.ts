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

export const closePeriodSchema = z.object({
  bankAccountId: z.string().uuid(),
  periodEnd: z.string().date(),
  bankClosingBalance: z.number(),
});

export const postAsExpenseSchema = z.object({
  bankTransactionId: z.string().uuid(),
  expenseAccountCode: z.string().min(1).max(20),
  narration: z.string().max(500).optional(),
});

export type AutoReconcileInput = z.infer<typeof autoReconcileSchema>;
export type ManualMatchInput = z.infer<typeof manualMatchSchema>;
export type UnmatchInput = z.infer<typeof unmatchSchema>;
export type ClosePeriodInput = z.infer<typeof closePeriodSchema>;
export type PostAsExpenseInput = z.infer<typeof postAsExpenseSchema>;
