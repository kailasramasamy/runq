import { z } from 'zod';

export const createChequeSchema = z.object({
  chequeNumber: z.string().min(1, 'Cheque number is required').max(20),
  bankAccountId: z.string().uuid(),
  type: z.enum(['received', 'issued']),
  partyType: z.enum(['vendor', 'customer']),
  partyId: z.string().uuid(),
  amount: z.number().positive('Amount must be positive'),
  chequeDate: z.string().date(),
  linkedInvoiceId: z.string().uuid().nullish(),
  notes: z.string().max(2000).nullish(),
});

export const updateChequeSchema = createChequeSchema.partial();

export const chequeFilterSchema = z.object({
  status: z.enum(['pending', 'deposited', 'cleared', 'bounced', 'cancelled']).optional(),
  type: z.enum(['received', 'issued']).optional(),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
});

export const depositChequeSchema = z.object({
  depositDate: z.string().date(),
});

export const bounceChequeSchema = z.object({
  reason: z.string().min(1, 'Bounce reason is required').max(2000),
});

export type CreateChequeInput = z.infer<typeof createChequeSchema>;
export type UpdateChequeInput = z.infer<typeof updateChequeSchema>;
export type ChequeFilterInput = z.infer<typeof chequeFilterSchema>;
export type DepositChequeInput = z.infer<typeof depositChequeSchema>;
export type BounceChequeInput = z.infer<typeof bounceChequeSchema>;
