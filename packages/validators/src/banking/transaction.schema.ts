import { z } from 'zod';

export const transactionFilterSchema = z.object({
  type: z.enum(['credit', 'debit']).optional(),
  reconciled: z.coerce.boolean().optional(),
  reconStatus: z.enum(['unreconciled', 'matched', 'manually_matched', 'excluded']).optional(),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
  minAmount: z.coerce.number().optional(),
  search: z.string().optional(),
});

export type TransactionFilter = z.infer<typeof transactionFilterSchema>;
