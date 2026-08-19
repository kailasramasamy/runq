import { z } from 'zod';

/**
 * Dhenu milk-procurement — per-VMCC billing validators.
 * A bill settles one VMCC for one locked cycle: milk cost (net payable) + full
 * operator comp. Generate bills for the via_vmcc VMCCs under a CC, then pay each
 * (posting GL) and capture the transaction confirmation.
 */

/**
 * A billing period = one calendar half-month. `first` → 1st–15th, `second` →
 * 16th–end of month. The backend resolves this to a tenant-wide payout cycle,
 * auto-creating it if missing — no manual cycle management.
 */
export const billingPeriodSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  half: z.enum(['first', 'second']),
});

export type BillingPeriod = z.infer<typeof billingPeriodSchema>;

/** The day-by-day supply behind one VMCC's bill. `format=pdf` returns the
 *  official bill document instead of JSON. */
export const vmccBillDetailSchema = billingPeriodSchema.partial().extend({
  vmccNodeId: z.string().uuid(),
  format: z.enum(['json', 'pdf']).default('json'),
  // A bill's window is its payout cycle's, and cycle cadence is tenant-set —
  // a 10-day cycle has no half-month to name. Callers holding the real dates
  // (the app lists bills with their cycle period) pass them straight through;
  // the year/month/half form stays for callers picking a period to bill.
  from: z.string().date().optional(),
  to: z.string().date().optional(),
}).refine(
  (v) => (v.from != null && v.to != null) ||
    (v.year != null && v.month != null && v.half != null),
  { message: 'Pass from+to, or year+month+half' },
);
export type VmccBillDetailQuery = z.infer<typeof vmccBillDetailSchema>;

/** Generate bills for a half-month period: all via_vmcc VMCCs under a CC, or one. */
export const generateVmccBillsSchema = billingPeriodSchema.extend({
  ccNodeId: z.string().uuid(),
  vmccNodeId: z.string().uuid().optional(),
});

export type GenerateVmccBillsInput = z.infer<typeof generateVmccBillsSchema>;

/** Record a VMCC bill as paid, with the transaction confirmation. */
export const payVmccBillSchema = z.object({
  txnReference: z.string().trim().max(120).optional(),
  paymentMode: z.enum(['bank_transfer', 'upi', 'cash', 'cheque', 'other']),
  paymentDate: z.string().date(),
});

export type PayVmccBillInput = z.infer<typeof payVmccBillSchema>;

/** Settle one VMCC operator's comp for a period (posts GL + AP payment). */
export const settleOperatorSchema = payVmccBillSchema.extend({
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
});

export type SettleOperatorInput = z.infer<typeof settleOperatorSchema>;

/** List persisted bills, optionally scoped to a cycle / CC / status. */
export const vmccBillFilterSchema = z.object({
  cycleId: z.string().uuid().optional(),
  ccNodeId: z.string().uuid().optional(),
  // One VMCC's own bills — what its operator reads on the app's Payments tab.
  // Role scoping already limits an operator to their nodes, but an owner
  // operating a centre through the switcher is tenant-wide and needs the filter.
  vmccNodeId: z.string().uuid().optional(),
  status: z.enum(['generated', 'paid', 'reversed']).optional(),
});

export type VmccBillFilter = z.infer<typeof vmccBillFilterSchema>;

/** Query the compute-on-the-fly billable preview for a half-month period + CC. */
export const vmccBillablePreviewSchema = billingPeriodSchema.extend({
  ccNodeId: z.string().uuid(),
});

export type VmccBillablePreviewQuery = z.infer<typeof vmccBillablePreviewSchema>;

/** Filter the unified payment history (VMCC bills + farmer settlements + operator
 *  payouts). `search` matches payee / code / reference / cycle no / recorded-by. */
export const mpPaymentHistoryFilterSchema = z.object({
  type: z.enum(['vmcc_bill', 'farmer', 'operator']).optional(),
  paymentMode: z.enum(['bank_transfer', 'upi', 'cash', 'cheque', 'other']).optional(),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
  search: z.string().trim().max(120).optional(),
});

export type MpPaymentHistoryFilter = z.infer<typeof mpPaymentHistoryFilterSchema>;
