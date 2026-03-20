import { z } from 'zod';

export const invoiceNumberingSchema = z.object({
  invoicePrefix: z.string().min(1).max(10).default('INV'),
  invoiceFormat: z.string().min(1).max(50).default('{prefix}-{fy}-{seq}'),
  invoiceStartSequence: z.number().int().min(1).default(1),
});

export type InvoiceNumberingInput = z.infer<typeof invoiceNumberingSchema>;
