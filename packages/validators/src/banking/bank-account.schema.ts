import { z } from 'zod';

const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export const createBankAccountSchema = z.object({
  name: z.string().min(1, 'Account name is required').max(255),
  bankName: z.string().min(1).max(255),
  accountNumber: z.string().min(1).max(30),
  ifscCode: z.string().regex(ifscRegex, 'Invalid IFSC code'),
  accountType: z.enum(['current', 'savings', 'overdraft', 'cash_credit']).default('current'),
  openingBalance: z.number().default(0),
});

export const updateBankAccountSchema = createBankAccountSchema.partial();

export type CreateBankAccountInput = z.infer<typeof createBankAccountSchema>;
export type UpdateBankAccountInput = z.infer<typeof updateBankAccountSchema>;
