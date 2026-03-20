import { z } from 'zod';

export const transactionFilterSchema = z.object({
  type: z.enum(['credit', 'debit']).optional(),
  reconciled: z.coerce.boolean().optional(),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
  minAmount: z.coerce.number().optional(),
});

export type TransactionFilter = z.infer<typeof transactionFilterSchema>;
