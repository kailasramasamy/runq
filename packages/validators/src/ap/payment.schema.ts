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

export const createDirectPaymentSchema = z.object({
  vendorId: z.string().uuid(),
  bankAccountId: z.string().uuid(),
  paymentMethod: z.literal('bank_transfer'),
  referenceNumber: z.string().max(50).nullish(),
  paymentDate: z.string().date(),
  amount: z.number().positive('Amount must be positive'),
  notes: z.string().nullish(),
  category: z.string().max(50).nullish(),
});

export const vendorPaymentFilterSchema = z.object({
  vendorId: z.string().uuid().optional(),
  bankAccountId: z.string().uuid().optional(),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
});

const batchPaymentItemSchema = z.object({
  vendorId: z.string().uuid(),
  amount: z.number().positive(),
  referenceNumber: z.string().max(50).nullish(),
  notes: z.string().nullish(),
});

export const createBatchPaymentSchema = z.object({
  bankAccountId: z.string().uuid(),
  paymentMethod: z.literal('bank_transfer'),
  paymentDate: z.string().date(),
  description: z.string().nullish(),
  payments: z.array(batchPaymentItemSchema).min(1, 'At least one payment required'),
});

export const importBatchPaymentSchema = z.object({
  bankAccountId: z.string().uuid(),
  paymentDate: z.string().date(),
  csvData: z.string().min(1, 'CSV data required'),
});

const paymentRunLineItemSchema = z.object({
  vendorName: z.string().min(1),
  vendorId: z.string().uuid().nullish(),
  amount: z.number().positive(),
  reference: z.string().max(100).nullish(),
  reason: z.string().nullish(),
  dueDate: z.string().date().nullish(),
  purchaseInvoiceId: z.string().uuid().nullish(),
});

export const createPaymentRunSchema = z.object({
  runId: z.string().min(1).max(100),
  source: z.string().min(1).max(100),
  description: z.string().nullish(),
  lines: z.array(paymentRunLineItemSchema).min(1),
});

export const createRunFromBillsSchema = z.object({
  billIds: z.array(z.string().uuid()).min(1, 'Select at least one bill'),
  description: z.string().nullish(),
});

export const approveLinesSchema = z.object({
  lineIds: z.array(z.string().uuid()).min(1),
});

export const rejectLinesSchema = z.object({
  lineIds: z.array(z.string().uuid()).min(1),
  reason: z.string().nullish(),
});

export const paymentRunFilterSchema = z.object({
  status: z.enum(['pending_approval', 'partially_approved', 'approved', 'rejected', 'executed']).optional(),
  source: z.string().optional(),
});

export type CreatePaymentRunInput = z.infer<typeof createPaymentRunSchema>;
export type CreateRunFromBillsInput = z.infer<typeof createRunFromBillsSchema>;
export type ApproveLinesInput = z.infer<typeof approveLinesSchema>;
export type RejectLinesInput = z.infer<typeof rejectLinesSchema>;
export type PaymentRunFilter = z.infer<typeof paymentRunFilterSchema>;

export type CreateVendorPaymentInput = z.infer<typeof createVendorPaymentSchema>;
export type CreateAdvancePaymentInput = z.infer<typeof createAdvancePaymentSchema>;
export type CreateDirectPaymentInput = z.infer<typeof createDirectPaymentSchema>;
export type AdjustAdvanceInput = z.infer<typeof adjustAdvanceSchema>;
export type VendorPaymentFilter = z.infer<typeof vendorPaymentFilterSchema>;
export type CreateBatchPaymentInput = z.infer<typeof createBatchPaymentSchema>;
export type ImportBatchPaymentInput = z.infer<typeof importBatchPaymentSchema>;
