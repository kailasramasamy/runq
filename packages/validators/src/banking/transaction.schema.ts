import { z } from 'zod';

export const transactionFilterSchema = z.object({
  type: z.enum(['credit', 'debit']).optional(),
  reconciled: z.coerce.boolean().optional(),
  reconStatus: z.enum(['unreconciled', 'matched', 'manually_matched', 'excluded']).optional(),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
  minAmount: z.coerce.number().optional(),
  search: z.string().optional(),
  // GL category to narrow by. The literal 'none' selects rows that have no
  // category yet, which a plain uuid filter can never express.
  glAccountId: z.union([z.literal('none'), z.string().uuid()]).optional(),
  inSuspense: z.coerce.boolean().optional(),
});

export type TransactionFilter = z.infer<typeof transactionFilterSchema>;

export const bankAccountReportQuerySchema = z
  .object({
    dateFrom: z.string().date(),
    dateTo: z.string().date(),
  })
  .refine((v) => v.dateTo >= v.dateFrom, {
    message: 'dateTo must be on or after dateFrom',
    path: ['dateTo'],
  });

export type BankAccountReportQuery = z.infer<typeof bankAccountReportQuerySchema>;

/** Filters for the cross-account spends ledger (bank debits + open captures). */
export const spendsFilterSchema = z.object({
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
  search: z.string().optional(),
});

export type SpendsFilter = z.infer<typeof spendsFilterSchema>;
