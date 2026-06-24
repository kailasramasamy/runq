import { z } from 'zod';

/**
 * Dhenu milk-procurement — report query validators.
 * Spec: docs/dhenu-tracker.md A9. Collection rollups by node + period.
 */

export const collectionReportSchema = z.object({
  nodeId: z.string().uuid().optional(),
  from: z.string().date(),
  to: z.string().date(),
});

export type CollectionReportQuery = z.infer<typeof collectionReportSchema>;

/** Per-day rollup of received vmcc→cc consignments at a single CC node. */
export const receivedDailySchema = z.object({
  nodeId: z.string().uuid(),
  from: z.string().date(),
  to: z.string().date(),
});

export type ReceivedDailyQuery = z.infer<typeof receivedDailySchema>;

/** Per-day qty-weighted QC rollup of recorded pours at a node, optionally
 * filtered to one farmer — powers the VMCC QC trend chart. */
export const poursDailySchema = z.object({
  nodeId: z.string().uuid(),
  farmerId: z.string().uuid().optional(),
  from: z.string().date(),
  to: z.string().date(),
});

export type PoursDailyQuery = z.infer<typeof poursDailySchema>;
