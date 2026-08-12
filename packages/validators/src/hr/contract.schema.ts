import { z } from 'zod';

/**
 * Labour contracts. Three shapes, and none of them requires an employee
 * record — most of these workers are never on the rolls:
 *
 *   solo_daily    one worker on a daily rate
 *   task_lumpsum  an agreed price for a job; we deal with the crew lead
 *   crew_daily    a named crew, each on their own rate
 *
 * `endDate` is optional throughout: work frequently runs until it is done.
 */

export const contractTypeSchema = z.enum(['solo_daily', 'task_lumpsum', 'crew_daily']);

export const contractMemberInputSchema = z.object({
  name: z.string().min(1).max(150),
  role: z.string().max(80).nullish(),
  dailyRate: z.number().positive(),
  joinedOn: z.string().date().nullish(),
  leftOn: z.string().date().nullish(),
});
export type CreateMemberInput = z.infer<typeof contractMemberInputSchema>;
export const updateMemberSchema = contractMemberInputSchema;
export type UpdateMemberInput = CreateMemberInput;

const contractBase = z.object({
  name: z.string().min(1).max(200),
  leadPersonName: z.string().min(1).max(150),
  leadPersonPhone: z.string().max(20).nullish(),
  contractType: contractTypeSchema,
  startDate: z.string().date(),
  /** Omit for open-ended work. */
  endDate: z.string().date().nullish(),
  /** task_lumpsum only. */
  fixedAmount: z.number().positive().nullish(),
  /** solo_daily only — the lead person becomes the single crew member. */
  dailyRate: z.number().positive().nullish(),
  /** crew_daily only. */
  members: z.array(contractMemberInputSchema).nullish(),
  notes: z.string().max(2000).nullish(),
});

/**
 * Mirrors the `ck_labour_contract_amount` CHECK plus the per-type rate
 * rules, so a bad payload fails at the edge with a field-level message
 * rather than as a database error.
 */
function applyTypeRules(v: z.infer<typeof contractBase>, ctx: z.RefinementCtx) {
  const fail = (path: string, message: string) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

  if (v.endDate && v.endDate < v.startDate) {
    fail('endDate', 'End date cannot be before the start date');
  }
  if (v.contractType === 'task_lumpsum') {
    if (v.fixedAmount == null) fail('fixedAmount', 'A task contract needs an agreed amount');
    if (v.dailyRate != null) fail('dailyRate', 'A task contract is not priced per day');
  } else {
    if (v.fixedAmount != null) {
      fail('fixedAmount', 'A day-rate contract is priced through its crew, not a lump sum');
    }
  }
  if (v.contractType === 'solo_daily' && v.dailyRate == null) {
    fail('dailyRate', 'A solo contract needs a daily rate');
  }
  if (v.contractType === 'crew_daily' && !(v.members?.length)) {
    fail('members', 'Add at least one person to the crew');
  }
}

export const createContractSchema = contractBase.superRefine(applyTypeRules);
export type CreateContractInput = z.infer<typeof contractBase>;

/**
 * Editing the terms. The type is fixed once created — switching a solo
 * contract to a crew mid-flight would leave its day log pointing at a
 * member that no longer prices anything. Crew changes go through the
 * member endpoints instead.
 */
export const updateContractSchema = contractBase
  .omit({ contractType: true, dailyRate: true, members: true })
  .superRefine((v, ctx) => {
    if (v.endDate && v.endDate < v.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endDate'],
        message: 'End date cannot be before the start date',
      });
    }
  });
export type UpdateContractInput =
  Omit<CreateContractInput, 'contractType' | 'dailyRate' | 'members'>;

export const contractFilterSchema = z.object({
  status: z.enum(['active', 'completed', 'cancelled']).optional(),
  type: contractTypeSchema.optional(),
});

/**
 * Mark a span of days for some or all of the crew.
 *
 * `worked` is meaningful as an input — it clears whatever exception was
 * there. It is never stored, since the absence of a row already means the
 * day was worked.
 */
export const markDaysSchema = z.object({
  fromDate: z.string().date(),
  toDate: z.string().date(),
  status: z.enum(['worked', 'leave', 'half_day']),
  /** Omit to apply to everyone on the contract. */
  memberIds: z.array(z.string().uuid()).nullish(),
  note: z.string().max(500).nullish(),
});
export type MarkDaysInput = z.infer<typeof markDaysSchema>;

/**
 * An advance. `memberId` attributes it to one person so their settlement
 * line nets it off; omit it on a task contract, where the cash goes to the
 * crew lead.
 */
export const createAdvanceSchema = z.object({
  amount: z.number().positive(),
  paidOn: z.string().date(),
  memberId: z.string().uuid().nullish(),
  paymentMethod: z.enum(['cash', 'bank_transfer', 'upi', 'cheque']).default('cash'),
  bankAccountId: z.string().uuid().nullish(),
  reference: z.string().max(100).nullish(),
  notes: z.string().max(1000).nullish(),
});
export type CreateAdvanceInput = z.infer<typeof createAdvanceSchema>;

/**
 * Settlement. Earnings are computed server-side from the day log and are
 * never accepted from the client — letting the caller post their own figure
 * would free the calendar and the payout to disagree.
 */
export const createSettlementSchema = z.object({
  /** Defaults to today; on an open-ended contract this becomes the end date. */
  throughDate: z.string().date().nullish(),
  otherDeductions: z.number().nonnegative().default(0),
  notes: z.string().max(2000).nullish(),
});
export type CreateSettlementInput = z.infer<typeof createSettlementSchema>;

export const paySettlementSchema = z.object({
  paymentDate: z.string().date(),
  bankAccountId: z.string().uuid(),
  paymentMethod: z.enum(['bank_transfer', 'cash', 'upi', 'cheque']).default('bank_transfer'),
  reference: z.string().max(100).nullish(),
});
export type PaySettlementInput = z.infer<typeof paySettlementSchema>;
