import { z } from 'zod';

/** Reward type catalogue — HR-configured. `monetary` types sync to Finance;
 *  `recognition` types are a non-cash thank-you with no GL impact;
 *  `points` types credit the employee a redeemable balance (1 pt = ₹1). */
export const createRewardTypeSchema = z.object({
  name: z.string().min(1).max(60),
  code: z.string().min(1).max(20),
  kind: z.enum(['monetary', 'recognition', 'points']).default('monetary'),
  /** Expense account a monetary reward of this type debits. Ignored for
   *  recognition and points (which hit the GL only at redemption time). */
  glAccountCode: z.string().max(20).default('5205'),
  displayOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export const updateRewardTypeSchema = createRewardTypeSchema.partial();

/** A manager initiates a reward for one of their reports. `amount` must be
 *  positive for a monetary type and is forced to 0 for recognition — the
 *  service enforces that against the reward type's `kind`. */
export const createRewardSchema = z.object({
  employeeId: z.string().uuid(),
  rewardTypeId: z.string().uuid(),
  amount: z.number().nonnegative().default(0),
  title: z.string().min(1).max(120),
  citation: z.string().max(2000).nullish(),
  awardDate: z.string().date(),
});

/** Same shape as create — full replace of a draft reward. */
export const updateRewardSchema = createRewardSchema;
export type UpdateRewardInput = z.infer<typeof updateRewardSchema>;

/** HR decision on a submitted reward. */
export const approveRewardSchema = z.object({
  approved: z.boolean(),
  rejectionReason: z.string().max(500).nullish(),
});

export const rewardFilterSchema = z.object({
  status: z.enum(['draft', 'submitted', 'approved', 'rejected', 'posted', 'paid']).optional(),
  employeeId: z.string().uuid().optional(),
});

/** Disburse an approved + posted monetary reward. Settles 2114 Employee
 *  Rewards Payable against the bank via the employee_payments subledger. */
export const payRewardSchema = z.object({
  bankAccountId: z.string().uuid(),
  paymentDate: z.string().date(),
  paymentMethod: z.enum(['bank_transfer', 'cash', 'cheque']).default('bank_transfer'),
  reference: z.string().max(100).nullish(),
  notes: z.string().max(500).nullish(),
});

/** Employee self-service: redeem accumulated reward points for cash.
 *  Creates a kind='monetary' reward with `pointsUsed` set, initiated by the
 *  employee themselves; the redemption then follows the normal monetary
 *  payout path (HR approves, owner/accountant posts and pays). */
export const redeemPointsSchema = z.object({
  pointsUsed: z.number().int().min(500, 'You need at least 500 points to redeem'),
});

/** Ask the AI to draft a citation from the reward's title. */
export const suggestRewardCitationSchema = z.object({
  title: z.string().min(1).max(120),
  employeeName: z.string().max(120).nullish(),
  typeName: z.string().max(60).nullish(),
});

export type SuggestRewardCitationInput = z.infer<typeof suggestRewardCitationSchema>;
export type CreateRewardTypeInput = z.infer<typeof createRewardTypeSchema>;
export type UpdateRewardTypeInput = z.infer<typeof updateRewardTypeSchema>;
export type CreateRewardInput = z.infer<typeof createRewardSchema>;
export type ApproveRewardInput = z.infer<typeof approveRewardSchema>;
export type PayRewardInput = z.infer<typeof payRewardSchema>;
export type RedeemPointsInput = z.infer<typeof redeemPointsSchema>;
