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

// Replace a receipt's allocation set explicitly (remittance-advice driven).
// Empty array is allowed — it moves the receipt fully on-account.
export const setReceiptAllocationsSchema = z.object({
  allocations: z.array(allocationSchema),
});

export const receiptFilterSchema = z.object({
  customerId: z.string().uuid().optional(),
  bankAccountId: z.string().uuid().optional(),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
  search: z.string().optional(),
});

export type CreateReceiptInput = z.infer<typeof createReceiptSchema>;
export type SetReceiptAllocationsInput = z.infer<typeof setReceiptAllocationsSchema>;
export type ReceiptFilter = z.infer<typeof receiptFilterSchema>;
