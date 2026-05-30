import { z } from 'zod';

/**
 * Manufacturing Phase 3 — report query validators.
 * Spec: docs/manufacturing-plan.md §5.4 + §5.5.
 *
 * All reports accept the same date-window + warehouse filter shape so the
 * UI can share a single filter bar. `bomId` narrows yield-trend + bom-usage
 * + wo-summary to a single BOM.
 */

const dateWindowSchema = z.object({
  /** Inclusive lower bound; defaults to 30 days ago server-side. */
  from: z.string().date().optional(),
  /** Inclusive upper bound; defaults to today server-side. */
  to: z.string().date().optional(),
});

export const woSummaryFilterSchema = dateWindowSchema.extend({
  bomId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
  /** Comma-separated. Defaults to closed-only server-side; pass to widen. */
  status: z.string().optional(),
});

export const yieldTrendFilterSchema = dateWindowSchema.extend({
  bomId: z.string().uuid().optional(),
  /** Bucket size — day | week | month. Default 'day'. */
  bucket: z.enum(['day', 'week', 'month']).optional(),
});

export const bomUsageFilterSchema = dateWindowSchema.extend({
  isActive: z
    .union([z.boolean(), z.literal('true'), z.literal('false')])
    .transform((v) => (typeof v === 'boolean' ? v : v === 'true'))
    .optional(),
  search: z.string().optional(),
});

export const woPendingCloseFilterSchema = z.object({
  /** Show only WOs older than N days (SLA bucket). Defaults to 0 (all). */
  minAgeDays: z
    .union([z.number(), z.string()])
    .transform((v) => (typeof v === 'number' ? v : Number(v)))
    .pipe(z.number().int().nonnegative())
    .optional(),
});

export type WoSummaryFilter = z.infer<typeof woSummaryFilterSchema>;
export type YieldTrendFilter = z.infer<typeof yieldTrendFilterSchema>;
export type BomUsageFilter = z.infer<typeof bomUsageFilterSchema>;
export type WoPendingCloseFilter = z.infer<typeof woPendingCloseFilterSchema>;
