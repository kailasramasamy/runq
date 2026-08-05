import type { AbcClass, VelocityBand, XyzClass } from '@runq/validators';

/**
 * Shared shapes and thresholds for the inventory analytics services.
 *
 * Extracted so `analytics.service.ts` and `analytics-forecast.service.ts`
 * import the same constants from one place rather than reaching into each
 * other — and so neither file outgrows the per-file line budget.
 */

/**
 * Days-of-cover cut-offs for the velocity bands. Chosen against how an SME
 * actually restocks: under a month of cover is fast-moving and needs
 * watching, over a quarter is capital sitting still.
 */
export const FAST_MAX_COVER_DAYS = 30;
export const MEDIUM_MAX_COVER_DAYS = 90;

/** Pareto cut-offs on cumulative consumption value. */
export const A_CLASS_SHARE = 0.8;
export const B_CLASS_SHARE = 0.95;

/**
 * Cover beyond this counts as EXCESS on the scorecard — stock that still
 * moves but holds far more than demand justifies. Kept apart from dead
 * stock because the two need opposite actions: excess gets discounted or
 * stops being reordered, dead gets written off.
 */
export const EXCESS_COVER_DAYS = 180;

export interface SkuPerformance {
  itemId: string;
  itemName: string;
  itemSku: string | null;
  itemUnit: string | null;
  category: string | null;
  onHandQty: number;
  onHandValue: number;
  consumedQty: number;
  consumedValue: number;
  /** Units per day, over the SKU's active span inside the window. */
  runRate: number;
  /** On-hand ÷ run rate. Null when the SKU has no demand to divide by. */
  daysOfCover: number | null;
  /** Annualised consumption value ÷ average inventory value held. */
  turnover: number | null;
  velocity: VelocityBand;
  abcClass: AbcClass;
  /** Coefficient of variation of weekly demand — the XYZ input. */
  demandCv: number | null;
  /** How predictable demand is: X steady, Y variable, Z erratic. */
  xyzClass: XyzClass | null;
  /** Holds more cover than the excess threshold — capital to release. */
  isExcess: boolean;
  /** Value of the stock held beyond the excess threshold. */
  excessValue: number;
  /** False when the SKU has too little history to judge — UI must say so. */
  hasEnoughHistory: boolean;
  lastMovementAt: string | null;
}

/** Below this many days of movement history, predictions are not offered. */
export const MIN_HISTORY_DAYS = 14;

