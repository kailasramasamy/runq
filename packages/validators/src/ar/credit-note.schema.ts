import { z } from 'zod';

// GST line item — mirrors sales-invoice item structure so a CN can have
// multi-rate, multi-HSN breakdown that lands cleanly in GSTR-1 Table 9B.
export const creditNoteItemSchema = z.object({
  itemId: z.string().uuid().nullish(),
  description: z.string().min(1).max(500),
  uom: z.string().max(20).nullish(),
  packSizeValue: z.number().positive().default(1),
  packSizeUqc: z.string().max(10).nullish(),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  amount: z.number().nonnegative(),
  hsnSacCode: z.string().max(8).nullish(),
  taxCategory: z.enum(['taxable', 'exempt', 'nil_rated', 'zero_rated', 'reverse_charge']).nullish(),
  taxRate: z.number().nonnegative().nullish(),
  cgstRate: z.number().nonnegative().default(0),
  cgstAmount: z.number().nonnegative().default(0),
  sgstRate: z.number().nonnegative().default(0),
  sgstAmount: z.number().nonnegative().default(0),
  igstRate: z.number().nonnegative().default(0),
  igstAmount: z.number().nonnegative().default(0),
  cessRate: z.number().nonnegative().default(0),
  cessAmount: z.number().nonnegative().default(0),
});

export const createCreditNoteSchema = z.object({
  customerId: z.string().uuid(),
  invoiceId: z.string().uuid().nullish(),
  issueDate: z.string().date(),
  reason: z.string().min(1, 'Reason is required'),
  placeOfSupply: z.string().max(100).nullish(),
  placeOfSupplyCode: z.string().length(2).nullish(),
  isInterState: z.boolean().nullish(),
  reverseCharge: z.boolean().default(false),
  // Amendment metadata. If invoiceId is provided, these auto-populate from
  // the invoice on the server; supply explicitly only when the original
  // invoice doesn't exist in runq (e.g. correcting an off-system invoice).
  amendsInvoiceNumber: z.string().max(50).nullish(),
  amendsInvoiceDate: z.string().date().nullish(),
  items: z.array(creditNoteItemSchema).min(1, 'At least one line item is required'),
});

export const updateCreditNoteSchema = createCreditNoteSchema.partial();

export const creditNoteFilterSchema = z.object({
  customerId: z.string().uuid().optional(),
  invoiceId: z.string().uuid().optional(),
  status: z.enum(['draft', 'issued', 'adjusted', 'cancelled']).optional(),
});

export const applyCreditNoteToInvoiceSchema = z.object({
  invoiceId: z.string().uuid(),
});

export type CreditNoteItemInput = z.infer<typeof creditNoteItemSchema>;
export type CreateCreditNoteInput = z.infer<typeof createCreditNoteSchema>;
export type UpdateCreditNoteInput = z.infer<typeof updateCreditNoteSchema>;
export type CreditNoteFilter = z.infer<typeof creditNoteFilterSchema>;
export type ApplyCreditNoteToInvoiceInput = z.infer<typeof applyCreditNoteToInvoiceSchema>;
