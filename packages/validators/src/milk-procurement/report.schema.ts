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

/** Per-day, per-milk-type qty-weighted QC rollup across the tenant (optionally
 * one node) — powers the per-milk-type quality trend charts on the MP home. */
export const qualityTrendSchema = z.object({
  nodeId: z.string().uuid().optional(),
  from: z.string().date(),
  to: z.string().date(),
});

export type QualityTrendQuery = z.infer<typeof qualityTrendSchema>;

/** Per-day full collection rollup grouped by node — either the pour's own VMCC
 * (`vmcc`) or its parent CC (`cc`). Powers the per-node collection history. */
export const nodeDailySchema = z.object({
  from: z.string().date(),
  to: z.string().date(),
  groupBy: z.enum(['vmcc', 'cc']),
});

export type NodeDailyQuery = z.infer<typeof nodeDailySchema>;

/** Whole-network flow snapshot for one collection date + optional shift —
 * powers the Flow page (VMCC → CC → PP quantities + per-hop loss). */
export const flowReportSchema = z.object({
  date: z.string().date(),
  shift: z.enum(['am', 'pm']).optional(),
});

export type FlowReportQuery = z.infer<typeof flowReportSchema>;
