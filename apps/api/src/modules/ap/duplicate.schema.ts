import { z } from 'zod';

export const checkDuplicatesSchema = z.object({
  vendorId: z.string().uuid(),
  invoiceNumber: z.string().min(1),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  totalAmount: z.number().positive(),
});

export type CheckDuplicatesInput = z.infer<typeof checkDuplicatesSchema>;
