import { z } from 'zod';

const invoiceItemSchema = z.object({
  description: z.string().min(1).max(500),
  quantity: z.number().positive('Quantity must be positive'),
  unitPrice: z.number().nonnegative('Unit price must be non-negative'),
  amount: z.number().positive('Amount must be positive'),
});

export const createSalesInvoiceSchema = z.object({
  customerId: z.string().uuid(),
  invoiceDate: z.string().date(),
  dueDate: z.string().date(),
  items: z.array(invoiceItemSchema).min(1, 'At least one line item required'),
  subtotal: z.number().nonnegative(),
  taxAmount: z.number().nonnegative().default(0),
  totalAmount: z.number().positive('Total must be positive'),
  notes: z.string().nullish(),
});

export const updateSalesInvoiceSchema = createSalesInvoiceSchema.partial();

export const salesInvoiceFilterSchema = z.object({
  customerId: z.string().uuid().optional(),
  status: z.enum(['draft', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled']).optional(),
  overdue: z.coerce.boolean().optional(),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
});

export const sendInvoiceSchema = z.object({
  sendEmail: z.boolean().default(false),
  emailTo: z.string().email().nullish(),
});

export const markPaidSchema = z.object({
  paymentDate: z.string().date(),
  referenceNumber: z.string().nullish(),
  notes: z.string().nullish(),
});

export type CreateSalesInvoiceInput = z.infer<typeof createSalesInvoiceSchema>;
export type UpdateSalesInvoiceInput = z.infer<typeof updateSalesInvoiceSchema>;
export type SalesInvoiceFilter = z.infer<typeof salesInvoiceFilterSchema>;
export type SendInvoiceInput = z.infer<typeof sendInvoiceSchema>;
export type MarkPaidInput = z.infer<typeof markPaidSchema>;
