import { z } from 'zod';

export const createDebitNoteSchema = z.object({
  vendorId: z.string().uuid(),
  invoiceId: z.string().uuid().nullish(),
  issueDate: z.string().date(),
  amount: z.number().positive('Amount must be positive'),
  reason: z.string().min(1, 'Reason is required'),
  notes: z.string().nullish(),
});

export const updateDebitNoteSchema = createDebitNoteSchema.partial();

export const debitNoteFilterSchema = z.object({
  vendorId: z.string().uuid().optional(),
  invoiceId: z.string().uuid().optional(),
  status: z.enum(['draft', 'issued', 'adjusted', 'cancelled']).optional(),
});

export type CreateDebitNoteInput = z.infer<typeof createDebitNoteSchema>;
export type UpdateDebitNoteInput = z.infer<typeof updateDebitNoteSchema>;
export type DebitNoteFilter = z.infer<typeof debitNoteFilterSchema>;
