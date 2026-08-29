import type { BatchOriginKind } from '../inventory/batch';

/**
 * Manufacturing Phase 2 — Run + costing domain types.
 * Spec: docs/manufacturing-plan.md §4.4–4.6, §8.
 */

export interface WoConsumption {
  id: string;
  tenantId: string;
  woId: string;
  bomLineId: string | null;
  inputItemId: string;
  /** Joined from items master at read time. */
  inputItemName: string;
  batchNo: string | null;
  warehouseId: string;
  warehouseName: string;
  qty: number;
  uom: string;
  unitCost: number;
  value: number;
  consumedAt: string;
  consumedBy: string | null;
  stockTxnId: string | null;
  notes: string | null;
}

export interface WoOutput {
  id: string;
  tenantId: string;
  woId: string;
  outputItemId: string;
  outputItemName: string;
  batchNo: string;
  warehouseId: string;
  warehouseName: string;
  qty: number;
  uom: string;
  /** Zero until WO close — set by costing roll-up. */
  unitCost: number;
  value: number;
  expiryDate: string | null;
  producedAt: string;
  producedBy: string | null;
  stockTxnId: string | null;
  notes: string | null;
}

/** FEFO-suggested source batch for a given input item + warehouse. */
export interface SuggestedBatch {
  batchNo: string;
  availableQty: number;
  unitCost: number;
  expiryDate: string | null;
  /**
   * Last stock movement on the batch. Only a tiebreak: pooling several items
   * into one FEFO queue needs an age signal for undated stock, and raw milk
   * carries no expiry date.
   */
  lastMovementAt?: string | null;

  /**
   * Where the batch came from — `Indus CC · 28 Aug PM · A2 cow` rather than
   * `CN-2026-000418`. A planner picking milk for a paneer run is choosing on
   * shift, centre and freshness; the batch number carries none of that.
   */
  originKind?: BatchOriginKind | null;
  originLabel?: string | null;
  originDetail?: string | null;
  /** Everything ever put into the batch. Less than `availableQty` means the
   *  batch is part-used — yesterday's balance, not a fresh can. */
  receivedQty?: number | null;
  /** Stock added from a source other than the one `originLabel` names — see
   *  `BatchOrigin.addedQty`. Above zero, the label is only part of the story. */
  addedQty?: number | null;
}

/** Per-input costing preview computed by `costing.service` while a WO is in_progress. */
export interface WoCostingPreview {
  woId: string;
  consumedValue: number;
  /** Sum of wo_output.qty (output_uom). */
  actualOutputQty: number;
  /** From bom.output_qty × wo.plannedQty / bom.output_qty (= plannedQty). */
  expectedOutputQty: number;
  /** consumedValue / actualOutputQty (0 if no output yet). */
  perUnitOutputCost: number;
  /** actualOutputQty - expectedOutputQty (can be negative). */
  varianceQty: number;
  /** varianceQty × perUnitOutputCost. */
  varianceValue: number;
}
