import { z } from 'zod';

export const createPendingPaymentSchema = z.object({
  bankAccountId: z.string().uuid(),
  amount: z.number().positive('Amount must be positive'),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  glAccountId: z.string().uuid(),
  payeeName: z.string().max(255).nullish(),
  note: z.string().max(500).nullish(),
  upiRef: z.string().max(64).nullish(),
});

export type CreatePendingPaymentInput = z.infer<typeof createPendingPaymentSchema>;

export const updatePendingPaymentSchema = z.object({
  bankAccountId: z.string().uuid().optional(),
  amount: z.number().positive('Amount must be positive').optional(),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
  glAccountId: z.string().uuid().optional(),
  payeeName: z.string().max(255).nullish(),
  note: z.string().max(500).nullish(),
  upiRef: z.string().max(64).nullish(),
});

export type UpdatePendingPaymentInput = z.infer<typeof updatePendingPaymentSchema>;
