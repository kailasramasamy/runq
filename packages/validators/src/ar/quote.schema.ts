import { z } from 'zod';

const quoteItemSchema = z.object({
  description: z.string().min(1).max(500),
  quantity: z.number().positive('Quantity must be positive'),
  unitPrice: z.number().nonnegative('Unit price must be non-negative'),
  amount: z.number().positive('Amount must be positive'),
  hsnSacCode: z.string().max(8).nullish(),
  taxRate: z.number().min(0).max(100).nullish(),
  itemId: z.string().uuid().nullish(),
});

export const createQuoteSchema = z.object({
  customerId: z.string().uuid(),
  quoteDate: z.string().date(),
  expiryDate: z.string().date().nullish(),
  items: z.array(quoteItemSchema).min(1, 'At least one line item required'),
  subtotal: z.number().nonnegative(),
  taxAmount: z.number().nonnegative().default(0),
  totalAmount: z.number().positive('Total must be positive'),
  notes: z.string().nullish(),
  terms: z.string().nullish(),
});

export const updateQuoteSchema = createQuoteSchema.partial();

export const quoteFilterSchema = z.object({
  customerId: z.string().uuid().optional(),
  status: z.enum(['draft', 'sent', 'accepted', 'rejected', 'expired', 'converted']).optional(),
  search: z.string().optional(),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
});

export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;
export type UpdateQuoteInput = z.infer<typeof updateQuoteSchema>;
export type QuoteFilter = z.infer<typeof quoteFilterSchema>;
