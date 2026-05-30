/**
 * Manufacturing — costing helpers.
 *
 * Pure functions. No DB access — caller fetches `wo_consumption` + `wo_output`
 * rows and BOM metadata, hands them in, and we compute roll-up + variance.
 * Keeps the call sites in `wo.service.ts` free of arithmetic so they can be
 * read top-to-bottom as orchestration.
 *
 * v1 = actual costing only (plan §8). Cost is conserved input → output, so
 * the JE at WO close balances exactly across the two same-account lines on
 * 1112 (plan §8.4). Yield variance is reported as a metric on the WO row
 * but does NOT post to GL until standard costing lands in Phase C.
 *
 * All inputs are plain numbers (already coerced from Drizzle's string-typed
 * decimals at the read boundary).
 */

import type { WoCostingPreview } from '@runq/types';

export interface ConsumptionRow {
  /** itemClass of the input — drives per-class breakdown for the future class-routed JE. */
  itemClass: string | null;
  value: number;
}

export interface OutputRow {
  qty: number;
}

export interface CostingInputs {
  woId: string;
  plannedQty: number;
  consumption: ConsumptionRow[];
  output: OutputRow[];
}

/** Per-input cost roll-up — read by web/mobile live during a WO run. */
export function computePreview(inputs: CostingInputs): WoCostingPreview {
  const consumedValue = sumValue(inputs.consumption);
  const actualOutputQty = sumQty(inputs.output);
  const expectedOutputQty = inputs.plannedQty;
  const perUnitOutputCost =
    actualOutputQty > 0 ? consumedValue / actualOutputQty : 0;
  const varianceQty = actualOutputQty - expectedOutputQty;
  const varianceValue = round2(varianceQty * perUnitOutputCost);
  return {
    woId: inputs.woId,
    consumedValue: round2(consumedValue),
    actualOutputQty,
    expectedOutputQty,
    perUnitOutputCost: round4(perUnitOutputCost),
    varianceQty,
    varianceValue,
  };
}

export interface OutputCostAssignment {
  /** Per-row cost — sum(value) reconciles exactly to total consumed value. */
  rows: Array<{ unitCost: number; value: number }>;
  /** Total output value (== total consumed value under cost conservation). */
  totalOutputValue: number;
  /** Per-unit cost before rounding — for storage on output rows. */
  perUnitOutputCost: number;
}

/**
 * Assign per-output-row cost at WO close. Output rows share the same
 * per-unit cost; the last row absorbs rounding drift so the JE at close
 * balances to the paisa (totalOutputValue === consumedValue exactly).
 *
 * Returns one assignment per output row in input order. Caller persists
 * `unit_cost` + `value` on each `wo_output` row.
 */
export function assignOutputCosts(
  outputs: Array<{ qty: number }>,
  consumedValue: number,
): OutputCostAssignment {
  if (outputs.length === 0) {
    return { rows: [], totalOutputValue: 0, perUnitOutputCost: 0 };
  }
  const totalQty = outputs.reduce((s, o) => s + o.qty, 0);
  if (totalQty <= 0) {
    return { rows: [], totalOutputValue: 0, perUnitOutputCost: 0 };
  }
  const perUnit = consumedValue / totalQty;
  const rounded = outputs.map((o) => ({
    unitCost: round4(perUnit),
    value: round2(o.qty * perUnit),
  }));
  // Reconcile rounding drift onto the last row's value.
  const summed = rounded.reduce((s, r) => s + r.value, 0);
  const drift = round2(consumedValue - summed);
  if (drift !== 0) {
    const last = rounded[rounded.length - 1];
    last.value = round2(last.value + drift);
  }
  return {
    rows: rounded,
    totalOutputValue: round2(consumedValue),
    perUnitOutputCost: perUnit,
  };
}

/** Per-class breakdown — exposed for the future class-routed JE poster. */
export function consumedByClass(
  consumption: ConsumptionRow[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of consumption) {
    const key = c.itemClass ?? 'unknown';
    out[key] = round2((out[key] ?? 0) + c.value);
  }
  return out;
}

/** Variance over 20% triggers a soft warning at close (plan §9 row 13). */
export function isHighVariance(
  varianceQty: number,
  expectedQty: number,
): boolean {
  if (expectedQty <= 0) return false;
  return Math.abs(varianceQty) / expectedQty > 0.2;
}

// ─── internals ────────────────────────────────────────────────────────────

function sumValue(rows: ConsumptionRow[]): number {
  return rows.reduce((s, r) => s + r.value, 0);
}

function sumQty(rows: OutputRow[]): number {
  return rows.reduce((s, r) => s + r.qty, 0);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
