import { z } from 'zod';

export const createPettyCashAccountSchema = z.object({
  name: z.string().min(1).max(255),
  location: z.string().max(255).nullish(),
  cashLimit: z.number().positive('Cash limit must be positive'),
});

export const updatePettyCashAccountSchema = createPettyCashAccountSchema.partial();

export const pettyCashTransactionSchema = z.object({
  type: z.enum(['expense', 'replenishment']),
  amount: z.number().positive('Amount must be positive'),
  description: z.string().min(1, 'Description is required').max(500),
  category: z.enum(['office_supplies', 'travel', 'food', 'maintenance', 'other']).nullish(),
  transactionDate: z.string().date(),
  receiptUrl: z.string().url().nullish(),
});

export const approvePettyCashSchema = z.object({
  action: z.enum(['approve', 'reject']),
  notes: z.string().nullish(),
});

export type CreatePettyCashAccountInput = z.infer<typeof createPettyCashAccountSchema>;
export type UpdatePettyCashAccountInput = z.infer<typeof updatePettyCashAccountSchema>;
export type PettyCashTransactionInput = z.infer<typeof pettyCashTransactionSchema>;
export type ApprovePettyCashInput = z.infer<typeof approvePettyCashSchema>;
