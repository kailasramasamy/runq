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

/** The day-by-day supply behind one VMCC's bill. */
export const vmccBillDetailSchema = billingPeriodSchema.extend({
  vmccNodeId: z.string().uuid(),
});
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
  status: z.enum(['generated', 'paid', 'reversed']).optional(),
});

export type VmccBillFilter = z.infer<typeof vmccBillFilterSchema>;

/** Query the compute-on-the-fly billable preview for a half-month period + CC. */
export const vmccBillablePreviewSchema = billingPeriodSchema.extend({
  ccNodeId: z.string().uuid(),
});

export type VmccBillablePreviewQuery = z.infer<typeof vmccBillablePreviewSchema>;
