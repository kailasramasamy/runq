import { z } from 'zod';

/**
 * Dhenu milk-procurement — payout validators.
 * Spec: docs/dhenu-schema-spec.md §6. Farmer ledger (advances/loans), payout
 * cycles generated from pours, deductions, lock, and pay (direct/via-VMCC).
 */

export const createLedgerEntrySchema = z.object({
  farmerId: z.string().uuid(),
  entryType: z.enum(['advance_given', 'feed_loan_given', 'repayment', 'adjustment']),
  amount: z.number().positive(),
  occurredOn: z.string().date(),
  // for repayment: which bucket it pays down
  refType: z.enum(['advance', 'cattle_feed_loan']).nullish(),
});

export const ledgerFilterSchema = z.object({
  // optional: a farmer persona reads their own ledger (server forces the id)
  farmerId: z.string().uuid().optional(),
});

export const farmerLinesFilterSchema = z.object({
  // optional: a farmer persona reads their own lines (server forces the id)
  farmerId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(24),
});

// `Payout`-prefixed to avoid clashing with HR review-cycle schemas in the barrel
export const createPayoutCycleSchema = z.object({
  scopeNodeId: z.string().uuid().nullish(),
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
});

export const payoutCycleFilterSchema = z.object({
  status: z.enum(['open', 'locked', 'paid', 'reversed']).optional(),
  scopeNodeId: z.string().uuid().optional(),
});

// Mark a single farmer line, or every line in a cycle, paid/unpaid (operational
// disbursement flag — see mp_payout_lines.paid_at).
export const markLinePaidSchema = z.object({ paid: z.boolean() });

export type CreateLedgerEntryInput = z.infer<typeof createLedgerEntrySchema>;
export type LedgerFilter = z.infer<typeof ledgerFilterSchema>;
export type FarmerLinesFilter = z.infer<typeof farmerLinesFilterSchema>;
export type CreatePayoutCycleInput = z.infer<typeof createPayoutCycleSchema>;
export type PayoutCycleFilter = z.infer<typeof payoutCycleFilterSchema>;
export type MarkLinePaidInput = z.infer<typeof markLinePaidSchema>;
