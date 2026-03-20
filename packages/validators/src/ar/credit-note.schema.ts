import { z } from 'zod';

export const createCreditNoteSchema = z.object({
  customerId: z.string().uuid(),
  invoiceId: z.string().uuid().nullish(),
  issueDate: z.string().date(),
  amount: z.number().positive('Amount must be positive'),
  reason: z.string().min(1, 'Reason is required'),
  notes: z.string().nullish(),
});

export const updateCreditNoteSchema = createCreditNoteSchema.partial();

export const creditNoteFilterSchema = z.object({
  customerId: z.string().uuid().optional(),
  invoiceId: z.string().uuid().optional(),
  status: z.enum(['draft', 'issued', 'adjusted', 'cancelled']).optional(),
});

export type CreateCreditNoteInput = z.infer<typeof createCreditNoteSchema>;
export type UpdateCreditNoteInput = z.infer<typeof updateCreditNoteSchema>;
export type CreditNoteFilter = z.infer<typeof creditNoteFilterSchema>;
