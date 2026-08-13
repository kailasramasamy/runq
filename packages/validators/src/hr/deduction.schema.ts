import { z } from 'zod';

export const employeeDeductionCategories = [
  'goods_purchase', 'canteen', 'damage', 'uniform', 'fine', 'other',
] as const;

/** Raise an amount owed by an employee, recovered from payroll. */
export const createEmployeeDeductionSchema = z.object({
  employeeId: z.string().uuid(),
  category: z.enum(employeeDeductionCategories).default('other'),
  description: z.string().max(300).nullish(),
  amount: z.number().positive(),
  /** Most a single run may recover. Omit to take the whole amount at once. */
  instalment: z.number().positive().nullish(),
  startMonth: z.number().int().min(1).max(12),
  startYear: z.number().int().min(2000).max(2100),
});

/** Only the un-recovered part is editable — recovered money is history. */
export const updateEmployeeDeductionSchema = z.object({
  category: z.enum(employeeDeductionCategories).optional(),
  description: z.string().max(300).nullish(),
  instalment: z.number().positive().optional(),
  startMonth: z.number().int().min(1).max(12).optional(),
  startYear: z.number().int().min(2000).max(2100).optional(),
});

export const listEmployeeDeductionsSchema = z.object({
  employeeId: z.string().uuid().optional(),
  status: z.enum(['active', 'recovered', 'cancelled']).optional(),
});

/**
 * Pay out an approved loan/advance. Cash payouts may omit the bank account —
 * they settle against petty cash instead.
 */
export const disburseLoanSchema = z.object({
  paymentDate: z.string().date(),
  bankAccountId: z.string().uuid().nullish(),
  paymentMethod: z.enum(['bank_transfer', 'cash', 'cheque']).default('bank_transfer'),
  reference: z.string().max(100).nullish(),
  notes: z.string().max(500).nullish(),
});

/**
 * One-shot "I just handed this employee an advance": creates the loan, marks
 * it active with its EMI schedule, and disburses it — the flow HR actually
 * performs at a counter, rather than draft → approve → disburse.
 */
export const quickAdvanceSchema = z.object({
  employeeId: z.string().uuid(),
  /**
   * Only changes what the payslip line and the app call it — a festival
   * advance and a 12-month education loan are recovered by identical
   * machinery. Defaults to a plain salary advance.
   */
  kind: z.enum(['advance', 'personal', 'festival', 'education', 'other']).default('advance'),
  amount: z.number().positive(),
  /** Defaults to 1 — recover the whole advance from the next payroll run. */
  totalInstalments: z.number().int().min(1).max(60).default(1),
  disbursedOn: z.string().date(),
  firstEmiMonth: z.number().int().min(1).max(12),
  firstEmiYear: z.number().int().min(2000).max(2100),
  reason: z.string().max(300).nullish(),
  paymentMethod: z.enum(['bank_transfer', 'cash', 'cheque']).default('cash'),
  bankAccountId: z.string().uuid().nullish(),
  reference: z.string().max(100).nullish(),
});

/**
 * Edit an advance / loan. Every field is optional — what's actually allowed
 * depends on how far the advance has got, which only the server can judge:
 * once payroll has recovered against it, the principal is no longer the
 * caller's to change.
 */
export const updateLoanSchema = z.object({
  principal: z.number().positive().optional(),
  /** Instalments for the REMAINING balance, not the original plan. */
  remainingInstalments: z.number().int().min(1).max(60).optional(),
  firstEmiMonth: z.number().int().min(1).max(12).optional(),
  firstEmiYear: z.number().int().min(2000).max(2100).optional(),
  reason: z.string().max(300).nullish(),
});

/** Stop recovering an advance that will never be repaid, keeping the trail. */
export const writeOffLoanSchema = z.object({
  reason: z.string().max(300).nullish(),
});

export type UpdateLoanInput = z.infer<typeof updateLoanSchema>;
export type WriteOffLoanInput = z.infer<typeof writeOffLoanSchema>;
export type CreateEmployeeDeductionInput = z.infer<typeof createEmployeeDeductionSchema>;
export type UpdateEmployeeDeductionInput = z.infer<typeof updateEmployeeDeductionSchema>;
export type ListEmployeeDeductionsInput = z.infer<typeof listEmployeeDeductionsSchema>;
export type DisburseLoanInput = z.infer<typeof disburseLoanSchema>;
export type QuickAdvanceInput = z.infer<typeof quickAdvanceSchema>;
