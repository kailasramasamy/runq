/**
 * Manufacturing Phase 3 — reports + dashboard payload shapes.
 * Spec: docs/manufacturing-plan.md §5.4 + §5.5.
 *
 * Reports are read-only aggregations; no FK back to source tables in the
 * payload — each row carries enough context to drill through via existing
 * list pages (BOM detail, WO detail).
 */

// ── Dashboard ─────────────────────────────────────────────────────────────

export interface MfgDashboard {
  /** Operational KPIs — drive the 4 home tiles. */
  activeBomCount: number;
  draftWoCount: number;
  scheduledTodayCount: number;
  inProgressCount: number;
  /** Analytics (plan §5.5). */
  wosCompletedPendingClose: number;
  todayPlannedOutput: number;
  todayActualOutput: number;
  /** Variance % across closed WOs in the last 7 days. Null if no closes. */
  weekVariancePct: number | null;
  /** Top BOMs by run count this week. Empty when no activity. */
  topBomsThisWeek: Array<{ bomId: string; bomCode: string; bomName: string; runs: number }>;
}

// ── WO summary report — one row per WO ───────────────────────────────────

export interface WoSummaryRow {
  woId: string;
  woNumber: string;
  bomCode: string;
  bomName: string;
  outputItemName: string;
  warehouseName: string;
  scheduledFor: string;
  status: string;
  plannedQty: number;
  actualOutputQty: number;
  consumedValue: number;
  outputValue: number;
  yieldVariance: number;
  yieldVariancePct: number | null;
  closedAt: string | null;
}

// ── Yield trend — one row per (BOM, day) ─────────────────────────────────

export interface YieldTrendPoint {
  bucketDate: string; // YYYY-MM-DD
  bomId: string;
  bomCode: string;
  runs: number;
  plannedQty: number;
  actualOutputQty: number;
  /** actualQty / plannedQty × 100. Null when planned=0. */
  yieldPct: number | null;
}

// ── BOM usage — one row per BOM ──────────────────────────────────────────

export interface BomUsageRow {
  bomId: string;
  bomCode: string;
  bomName: string;
  outputItemName: string;
  isActive: boolean;
  runs: number;
  closedRuns: number;
  totalPlannedQty: number;
  totalActualQty: number;
  avgYieldVariancePct: number | null;
  lastRunAt: string | null;
}

// ── WO pending close — one row per `completed` WO awaiting close ─────────

export interface WoPendingCloseRow {
  woId: string;
  woNumber: string;
  bomCode: string;
  bomName: string;
  scheduledFor: string;
  completedAt: string;
  consumedValue: number;
  /** Days since `completedAt` (rounded down). Drives the SLA badge. */
  ageDays: number;
}
