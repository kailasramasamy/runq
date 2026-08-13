import { z } from 'zod';

export const leaveRequestStatusSchema = z.enum(['pending', 'approved', 'rejected', 'cancelled']);

export const createLeaveTypeSchema = z.object({
  name: z.string().min(1).max(50),
  code: z.string().min(1).max(10),
  daysPerYear: z.number().nonnegative().default(0),
  // 'upfront' credits the year's quota at provisioning; 'monthly' lets the
  // accrual scheduler drip daysPerYear/12 each month.
  accrualMode: z.enum(['upfront', 'monthly', 'quarterly']).optional(),
  carryForward: z.boolean().default(false),
  maxCarryForward: z.number().nonnegative().nullish(),
  // Ceiling on the available balance for monthly accrual — accrual pauses
  // here and resumes as leave is taken. Null/omitted = uncapped.
  maxBalance: z.number().nonnegative().nullish(),
  // Hard cap on paid days in a calendar month, independent of the balance.
  maxPaidDaysPerMonth: z.number().nonnegative().nullish(),
  // Approve past the balance as a paid/unpaid split instead of letting the
  // balance go negative.
  overflowUnpaid: z.boolean().optional(),
  encashable: z.boolean().default(false),
  isPaid: z.boolean().default(true),
  isActive: z.boolean().optional(),
});

export const updateLeaveTypeSchema = createLeaveTypeSchema.partial();

export const createLeaveRequestSchema = z.object({
  employeeId: z.string().uuid(),
  leaveTypeId: z.string().uuid(),
  fromDate: z.string().date(),
  toDate: z.string().date(),
  halfDay: z.boolean().default(false),
  reason: z.string().max(500).nullish(),
}).refine((v) => v.fromDate <= v.toDate, { message: 'fromDate must be on or before toDate' });

// Edit a pending leave request. Only the requester can hit this from
// mobile; the server also gates on `status = 'pending'` so once a
// manager has acted (approved/rejected/cancelled) the row freezes.
// All fields optional — clients may patch just the dates.
export const updateLeaveRequestSchema = z.object({
  leaveTypeId: z.string().uuid().optional(),
  fromDate: z.string().date().optional(),
  toDate: z.string().date().optional(),
  halfDay: z.boolean().optional(),
  reason: z.string().max(500).nullish(),
}).refine(
  (v) => v.fromDate == null || v.toDate == null || v.fromDate <= v.toDate,
  { message: 'fromDate must be on or before toDate' },
);

export const reviewLeaveRequestSchema = z.object({
  approved: z.boolean(),
  rejectionReason: z.string().max(500).nullish(),
});

export const leaveRequestFilterSchema = z.object({
  employeeId: z.string().uuid().optional(),
  status: leaveRequestStatusSchema.optional(),
  leaveTypeId: z.string().uuid().optional(),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
});

export const leaveBalanceQuerySchema = z.object({
  employeeId: z.string().uuid().optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

export const adjustLeaveBalanceSchema = z.object({
  employeeId: z.string().uuid(),
  leaveTypeId: z.string().uuid(),
  year: z.number().int(),
  opening: z.number().nonnegative().optional(),
  accrued: z.number().nonnegative().optional(),
  // Normally maintained from approved/cancelled leave requests; editable here
  // so admins can correct it for leave taken outside the system.
  used: z.number().nonnegative().optional(),
});

export type CreateLeaveTypeInput = z.infer<typeof createLeaveTypeSchema>;
export type UpdateLeaveTypeInput = z.infer<typeof updateLeaveTypeSchema>;
export type CreateLeaveRequestInput = z.infer<typeof createLeaveRequestSchema>;
export type UpdateLeaveRequestInput = z.infer<typeof updateLeaveRequestSchema>;
export type ReviewLeaveRequestInput = z.infer<typeof reviewLeaveRequestSchema>;
export type LeaveRequestFilter = z.infer<typeof leaveRequestFilterSchema>;
export type AdjustLeaveBalanceInput = z.infer<typeof adjustLeaveBalanceSchema>;
