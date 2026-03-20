import { z } from 'zod';

const allocationSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: z.number().positive('Allocation amount must be positive'),
});

export const createVendorPaymentSchema = z.object({
  vendorId: z.string().uuid(),
  bankAccountId: z.string().uuid(),
  paymentMethod: z.literal('bank_transfer'),
  referenceNumber: z.string().max(50).nullish(),
  paymentDate: z.string().date(),
  totalAmount: z.number().positive('Amount must be positive'),
  allocations: z.array(allocationSchema).min(1, 'At least one allocation required'),
  notes: z.string().nullish(),
});

export const createAdvancePaymentSchema = z.object({
  vendorId: z.string().uuid(),
  bankAccountId: z.string().uuid(),
  paymentMethod: z.literal('bank_transfer'),
  referenceNumber: z.string().max(50).nullish(),
  paymentDate: z.string().date(),
  amount: z.number().positive('Amount must be positive'),
  notes: z.string().nullish(),
});

export const adjustAdvanceSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: z.number().positive('Adjustment amount must be positive'),
});

export const vendorPaymentFilterSchema = z.object({
  vendorId: z.string().uuid().optional(),
  bankAccountId: z.string().uuid().optional(),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
});

export type CreateVendorPaymentInput = z.infer<typeof createVendorPaymentSchema>;
export type CreateAdvancePaymentInput = z.infer<typeof createAdvancePaymentSchema>;
export type AdjustAdvanceInput = z.infer<typeof adjustAdvanceSchema>;
export type VendorPaymentFilter = z.infer<typeof vendorPaymentFilterSchema>;
