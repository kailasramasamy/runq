import { z } from 'zod';

/**
 * Inventory analytics filters.
 *
 * The analytics layer sits above the operational reports: reports answer
 * "what is in stock right now", analytics answers "how is stock performing
 * and what is about to go wrong". Everything is derived live from
 * stock_ledger + stock_on_hand — no snapshot tables.
 *
 * `window` is the trailing period used for consumption run-rates. 90 days
 * is the default because it smooths a month-end spike without reaching so
 * far back that a discontinued SKU still looks alive.
 */

/** Trailing window, in days, for consumption + run-rate maths. */
export const analyticsWindowSchema = z.coerce.number().int().min(7).max(365).default(90);

export const inventoryAnalyticsFilterSchema = z.object({
  warehouseId: z.string().uuid().optional(),
  window: analyticsWindowSchema,
});

export const inventoryPerformanceFilterSchema = z.object({
  warehouseId: z.string().uuid().optional(),
  window: analyticsWindowSchema,
  /** Cap the SKU rows returned; the UI charts the top slice by value. */
  limit: z.coerce.number().int().positive().max(500).default(100),
});

export const inventoryTrendFilterSchema = z.object({
  warehouseId: z.string().uuid().optional(),
  /** How far back the time series runs. */
  months: z.coerce.number().int().min(1).max(24).default(6),
  bucket: z.enum(['week', 'month']).default('week'),
});

export const inventoryForecastFilterSchema = z.object({
  warehouseId: z.string().uuid().optional(),
  window: analyticsWindowSchema,
  /** Only surface SKUs projected to run out within this horizon. */
  horizonDays: z.coerce.number().int().min(7).max(365).default(60),
});

// ─── Shared vocabulary ────────────────────────────────────────────────────

/** Pareto class on trailing consumption VALUE — A is the vital few. */
export const ABC_CLASSES = ['A', 'B', 'C'] as const;
export type AbcClass = (typeof ABC_CLASSES)[number];

/**
 * How fast a SKU turns, bucketed off days-of-cover. `dead` is reserved for
 * stock with no outbound movement at all in the window — it is a different
 * problem from "slow" and deserves its own colour on every chart.
 */
export const VELOCITY_BANDS = ['fast', 'medium', 'slow', 'dead'] as const;
export type VelocityBand = (typeof VELOCITY_BANDS)[number];

/**
 * Below-reorder severity. Mirrors ReorderService.alerts() so the analytics
 * page and the operational alert list never disagree about what is critical.
 */
export const STOCK_RISK_LEVELS = ['out', 'critical', 'warning', 'ok'] as const;
export type StockRiskLevel = (typeof STOCK_RISK_LEVELS)[number];

export type InventoryAnalyticsFilter = z.infer<typeof inventoryAnalyticsFilterSchema>;
export type InventoryPerformanceFilter = z.infer<typeof inventoryPerformanceFilterSchema>;
export type InventoryTrendFilter = z.infer<typeof inventoryTrendFilterSchema>;
export type InventoryForecastFilter = z.infer<typeof inventoryForecastFilterSchema>;
