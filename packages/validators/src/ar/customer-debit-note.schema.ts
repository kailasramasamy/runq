import { z } from 'zod';
import { creditNoteItemSchema } from './credit-note.schema';

// Customer-side debit note — mirrors createCreditNoteSchema. Reuses the same
// item shape (credit-note items and customer-DN items have identical columns).
export const createCustomerDebitNoteSchema = z.object({
  customerId: z.string().uuid(),
  invoiceId: z.string().uuid().nullish(),
  issueDate: z.string().date(),
  reason: z.string().min(1, 'Reason is required'),
  placeOfSupply: z.string().max(100).nullish(),
  placeOfSupplyCode: z.string().length(2).nullish(),
  isInterState: z.boolean().nullish(),
  reverseCharge: z.boolean().default(false),
  amendsInvoiceNumber: z.string().max(50).nullish(),
  amendsInvoiceDate: z.string().date().nullish(),
  items: z.array(creditNoteItemSchema).min(1, 'At least one line item is required'),
});

export const updateCustomerDebitNoteSchema = createCustomerDebitNoteSchema.partial();

export const customerDebitNoteFilterSchema = z.object({
  customerId: z.string().uuid().optional(),
  invoiceId: z.string().uuid().optional(),
  status: z.enum(['draft', 'issued', 'adjusted', 'cancelled']).optional(),
});

export type CreateCustomerDebitNoteInput = z.infer<typeof createCustomerDebitNoteSchema>;
export type UpdateCustomerDebitNoteInput = z.infer<typeof updateCustomerDebitNoteSchema>;
export type CustomerDebitNoteFilter = z.infer<typeof customerDebitNoteFilterSchema>;
