import { z } from 'zod';

/** First of a month, as YYYY-MM-01. */
const monthStart = z.string().regex(/^\d{4}-\d{2}-01$/, 'Use the 1st of the month (YYYY-MM-01)');

export const createRecurringBillSchema = z.object({
  vendorId: z.string().uuid(),
  title: z.string().trim().min(1).max(120),
  category: z.enum(['rent', 'transport', 'other']),
  /** Defaults by category (rent 5301, transport 5700) when omitted. */
  expenseAccountCode: z.string().trim().max(20).nullish(),
  /** Monthly total; twice-a-month agreements bill half of it on the 1st and the 16th. */
  amount: z.number().positive(),
  frequency: z.enum(['monthly', 'semi_monthly']).default('monthly'),
  billDay: z.number().int().min(1).max(28).default(1),
  startMonth: monthStart,
  endMonth: monthStart.nullish(),
});

/** Amount/day changes apply to bills raised from now on, never to past months. */
export const updateRecurringBillSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  expenseAccountCode: z.string().trim().max(20).optional(),
  amount: z.number().positive().optional(),
  billDay: z.number().int().min(1).max(28).optional(),
  endMonth: monthStart.nullish(),
  isActive: z.boolean().optional(),
});

/**
 * Pay against an agreement. Settles the chosen periods, or by default its
 * oldest open months first; anything
 * beyond what's due — or everything, when `asAdvance` — is held as an advance
 * that the next bills draw down automatically.
 */
export const recordRecurringPaymentSchema = z.object({
  amount: z.number().positive(),
  paymentDate: z.string().date(),
  bankAccountId: z.string().uuid(),
  referenceNumber: z.string().trim().max(50).nullish(),
  notes: z.string().max(500).nullish(),
  asAdvance: z.boolean().default(false),
  /**
   * Bills (periods) this payment is for, in the order to settle them. Omitted
   * = oldest due first. Whatever the chosen periods don't absorb is held as
   * an advance rather than spilling onto periods that weren't chosen.
   */
  billIds: z.array(z.string().uuid()).max(48).optional(),
});

export type CreateRecurringBillInput = z.infer<typeof createRecurringBillSchema>;
export type UpdateRecurringBillInput = z.infer<typeof updateRecurringBillSchema>;
export type RecordRecurringPaymentInput = z.infer<typeof recordRecurringPaymentSchema>;
