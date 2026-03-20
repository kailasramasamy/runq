import { z } from 'zod';

const allocationSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: z.number().positive('Allocation amount must be positive'),
});

export const createReceiptSchema = z.object({
  customerId: z.string().uuid(),
  bankAccountId: z.string().uuid(),
  paymentMethod: z.literal('bank_transfer'),
  referenceNumber: z.string().max(100).nullish(),
  receiptDate: z.string().date(),
  totalAmount: z.number().positive('Amount must be positive'),
  allocations: z.array(allocationSchema).min(1, 'At least one allocation required'),
  notes: z.string().nullish(),
});

export const receiptFilterSchema = z.object({
  customerId: z.string().uuid().optional(),
  bankAccountId: z.string().uuid().optional(),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
});

export type CreateReceiptInput = z.infer<typeof createReceiptSchema>;
export type ReceiptFilter = z.infer<typeof receiptFilterSchema>;
