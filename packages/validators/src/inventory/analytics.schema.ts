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
  /**
   * Cover beyond this many days counts as EXCESS — stock that still moves
   * but holds far more than the demand justifies. Distinct from dead
   * stock, which does not move at all. Six months is the usual default.
   */
  excessCoverDays: z.coerce.number().int().min(30).max(730).default(180),
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

/**
 * Target service level — the probability of NOT stocking out during the
 * replenishment lead time. Drives the safety-stock multiplier. 95% is the
 * usual default: 98%+ buys the last few percent with a lot of cash.
 */
export const SERVICE_LEVELS = [90, 95, 98, 99] as const;
export type ServiceLevel = (typeof SERVICE_LEVELS)[number];

/** One-sided normal z-scores for the offered service levels. */
export const SERVICE_LEVEL_Z: Record<ServiceLevel, number> = {
  90: 1.2816,
  95: 1.6449,
  98: 2.0537,
  99: 2.3263,
};

export const inventoryReplenishmentFilterSchema = z.object({
  warehouseId: z.string().uuid().optional(),
  window: analyticsWindowSchema,
  serviceLevel: z.coerce
    .number()
    .refine((n): n is ServiceLevel => (SERVICE_LEVELS as readonly number[]).includes(n), {
      message: `serviceLevel must be one of: ${SERVICE_LEVELS.join(', ')}`,
    })
    .default(95),
  /** Assumed lead time when a SKU has no rule configured. */
  defaultLeadTimeDays: z.coerce.number().int().min(1).max(180).default(7),
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
 * XYZ — how PREDICTABLE demand is, from the coefficient of variation of
 * periodic demand. The counterpart to ABC: ABC says what a SKU is worth,
 * XYZ says whether you can plan it.
 *
 *   X  CV <= 0.5   steady, safe to run lean
 *   Y  CV <= 1.0   variable, needs a real buffer
 *   Z  CV  > 1.0   erratic, buffer is guesswork — consider make/buy to order
 *
 * Crossed with ABC this gives the 9-box that decides stocking policy: AX
 * gets tight just-in-time control, AZ gets a deliberately fat buffer
 * because it is both valuable and unpredictable, CZ is not worth stocking.
 */
export const XYZ_CLASSES = ['X', 'Y', 'Z'] as const;
export type XyzClass = (typeof XYZ_CLASSES)[number];

/** CV cut-offs for the XYZ bands. */
export const XYZ_STABLE_MAX_CV = 0.5;
export const XYZ_VARIABLE_MAX_CV = 1.0;

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
export type InventoryReplenishmentFilter = z.infer<typeof inventoryReplenishmentFilterSchema>;
