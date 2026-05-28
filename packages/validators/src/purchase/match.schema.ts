import { z } from 'zod';

/**
 * PP Phase 3 — 3-way match validators.
 * Spec: docs/purchase-procurement-plan.md §8 + §5.3.
 *
 * Default match is amount-level (PO total ≈ Bill total within tolerance).
 * Line-level match is opt-in: the user supplies `lineMappings` linking
 * specific bill lines to specific PO lines.
 */

const lineMappingSchema = z.object({
  billLineId: z.string().uuid(),
  poLineId: z.string().uuid(),
  /**
   * Caller-supplied qty/amount snapshots so the server can run the
   * delta check without re-fetching the bill lines. Optional — server
   * falls back to reading the bill line when these are null.
   */
  qty: z.number().positive().nullish(),
  amount: z.number().nullish(),
});

export const previewMatchSchema = z.object({
  billId: z.string().uuid(),
});

export const commitMatchSchema = z.object({
  billId: z.string().uuid(),
  matchedPoId: z.string().uuid(),
  lineMappings: z.array(lineMappingSchema).optional(),
  /**
   * Required when the preview returned status='mismatch'. The user is
   * acknowledging the diff and committing the bill anyway; we record
   * the reason on `purchase_invoices.match_override_reason`.
   */
  overrideReason: z.string().max(500).nullish(),
});

export type PreviewMatchInput = z.infer<typeof previewMatchSchema>;
export type CommitMatchInput = z.infer<typeof commitMatchSchema>;
