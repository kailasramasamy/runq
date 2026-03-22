import { z } from 'zod';

export const accountTypeSchema = z.enum(['asset', 'liability', 'equity', 'revenue', 'expense']);

export const createAccountSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(255),
  type: accountTypeSchema,
  parentId: z.string().uuid().nullish(),
  description: z.string().max(500).nullish(),
});

const journalLineSchema = z.object({
  accountCode: z.string().min(1).max(20),
  debit: z.number().min(0).optional(),
  credit: z.number().min(0).optional(),
  description: z.string().max(500).optional(),
});

export const createJournalEntrySchema = z.object({
  date: z.string().date(),
  description: z.string().min(1).max(1000),
  sourceType: z.string().max(50).optional(),
  sourceId: z.string().uuid().optional(),
  lines: z
    .array(journalLineSchema)
    .min(2, 'At least 2 lines required')
    .refine(
      (lines) => {
        const totalDebit = lines.reduce((s, l) => s + (l.debit ?? 0), 0);
        const totalCredit = lines.reduce((s, l) => s + (l.credit ?? 0), 0);
        return Math.abs(totalDebit - totalCredit) <= 0.001;
      },
      { message: 'Debits must equal credits' },
    ),
});

export const journalEntryFilterSchema = z.object({
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
  sourceType: z.string().max(50).optional(),
});

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type CreateJournalEntryInput = z.infer<typeof createJournalEntrySchema>;
export type JournalEntryFilter = z.infer<typeof journalEntryFilterSchema>;
