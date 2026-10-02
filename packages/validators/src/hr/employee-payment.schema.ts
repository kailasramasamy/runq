import { z } from 'zod';

/**
 * Mark one or more of a run's per-employee salary transfers as done. Date,
 * bank and method are shared by the batch; each transfer carries its own
 * confirmation / UTR number, since every bank transfer gets one.
 */
export const markSalaryTransfersSchema = z.object({
  paymentDate: z.string().date(),
  bankAccountId: z.string().uuid(),
  paymentMethod: z.enum(['bank_transfer', 'cash', 'cheque']).default('bank_transfer'),
  items: z.array(z.object({
    paymentId: z.string().uuid(),
    reference: z.string().trim().max(100).nullish(),
  })).min(1),
});

/** Record a reimbursement payment against a posted expense claim. Settles
 *  2111 Employee Reimbursements Payable against the bank. */
export const recordReimbursementPaymentSchema = z.object({
  expenseClaimId: z.string().uuid(),
  paymentDate: z.string().date(),
  bankAccountId: z.string().uuid(),
  paymentMethod: z.enum(['bank_transfer', 'cash', 'cheque']).default('bank_transfer'),
  reference: z.string().max(100).nullish(),
  notes: z.string().max(500).nullish(),
});

export type MarkSalaryTransfersInput = z.infer<typeof markSalaryTransfersSchema>;
export type RecordReimbursementPaymentInput = z.infer<typeof recordReimbursementPaymentSchema>;
