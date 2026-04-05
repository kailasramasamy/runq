import { z } from 'zod';

const expenseClaimItemSchema = z.object({
  expenseDate: z.string().date(),
  category: z.string().min(1).max(50),
  description: z.string().min(1).max(500),
  amount: z.number().positive('Amount must be positive'),
  accountCode: z.string().max(20).nullish(),
});

export const createExpenseClaimSchema = z.object({
  claimDate: z.string().date(),
  description: z.string().nullish(),
  items: z.array(expenseClaimItemSchema).min(1, 'At least one expense item required'),
});

export const submitClaimSchema = z.object({
  id: z.string().uuid(),
});

export const approveClaimSchema = z.object({
  approved: z.boolean(),
  rejectionReason: z.string().max(500).nullish(),
});

export const expenseClaimFilterSchema = z.object({
  status: z.enum(['draft', 'submitted', 'approved', 'rejected', 'reimbursed']).optional(),
  claimantId: z.string().uuid().optional(),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
});
