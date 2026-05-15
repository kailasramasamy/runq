import { z } from 'zod';

/** Record a salary disbursement (net pay) against an approved payroll run. */
export const recordSalaryPaymentSchema = z.object({
  payrollRunId: z.string().uuid(),
  paymentDate: z.string().date(),
  bankAccountId: z.string().uuid(),
  paymentMethod: z.enum(['bank_transfer', 'cash', 'cheque']).default('bank_transfer'),
  reference: z.string().max(100).nullish(),
  notes: z.string().max(500).nullish(),
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

export type RecordSalaryPaymentInput = z.infer<typeof recordSalaryPaymentSchema>;
export type RecordReimbursementPaymentInput = z.infer<typeof recordReimbursementPaymentSchema>;
