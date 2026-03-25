import { z } from 'zod';

const recurringLineItemSchema = z.object({
  description: z.string().min(1).max(500),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  amount: z.number().positive(),
  hsnSacCode: z.string().max(8).nullish(),
  taxRate: z.number().min(0).max(100).nullish(),
  taxCategory: z.enum(['taxable', 'exempt', 'nil_rated', 'zero_rated']).nullish(),
});

export const createRecurringInvoiceSchema = z.object({
  customerId: z.string().uuid(),
  frequency: z.enum(['monthly', 'quarterly', 'yearly', 'custom']),
  intervalDays: z.number().int().min(1).max(365).nullish(),
  dayOfMonth: z.number().int().min(1).max(28),
  startDate: z.string().date(),
  endDate: z.string().date().nullish(),
  items: z.array(recurringLineItemSchema).min(1),
  notes: z.string().nullish(),
  autoSend: z.boolean().default(false),
});

export const updateRecurringInvoiceSchema = createRecurringInvoiceSchema.partial();

export const recurringFilterSchema = z.object({
  status: z.enum(['active', 'paused', 'completed']).optional(),
  customerId: z.string().uuid().optional(),
});

export type CreateRecurringInvoiceInput = z.infer<typeof createRecurringInvoiceSchema>;
export type UpdateRecurringInvoiceInput = z.infer<typeof updateRecurringInvoiceSchema>;
export type RecurringFilter = z.infer<typeof recurringFilterSchema>;
