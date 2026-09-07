/**
 * Manufacturing — Work Order domain types.
 * Spec: docs/manufacturing-plan.md §4.3.
 */

export type WorkOrderStatus =
  | 'draft'
  | 'in_progress'
  | 'completed'
  | 'closed'
  | 'cancelled';

export type QcStatus = 'pending' | 'passed' | 'failed' | 'conditional';

/**
 * `planned`   — manager authored the WO, floor ran it.
 * `unplanned` — technician recorded finished goods after the fact; inputs were
 *               backflushed from the BOM. See production-entry.service.
 */
/** How the run reached the system. `auto_repack` is the machine's own: a
 *  dispatch line for a late-differentiation SKU came up short and the pool
 *  item was backflushed to cover it, with nobody on the floor involved. */
export type WoEntryMode = 'planned' | 'unplanned' | 'auto_repack';

export interface WorkOrder {
  id: string;
  tenantId: string;
  woNumber: string;
  /** Null on a draw — milk taken before anyone knows what it will yield. */
  bomId: string | null;
  bomVersion: number | null;
  /** Null on a draw: there is no plan to deviate from until the yield is in. */
  plannedQty: number | null;
  /** The product being made. Always set — from the BOM, or stated by a draw. */
  outputItemId: string | null;
  warehouseId: string;
  shift: string | null;
  scheduledFor: string;
  status: WorkOrderStatus;
  entryMode: WoEntryMode;
  startedAt: string | null;
  completedAt: string | null;
  closedAt: string | null;
  cancelledAt: string | null;
  cancelledReason: string | null;
  outputQty: number;
  consumedValue: number;
  outputValue: number;
  yieldVariance: number;
  qcStatus: QcStatus | null;
  jeId: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkOrderExpectedSubstitute {
  itemId: string;
  itemName: string;
}

export interface WorkOrderExpectedLine {
  bomLineId: string;
  inputItemId: string;
  inputItemName: string;
  qtyPerOutput: number;
  inputUom: string;
  scrapPct: number;
  expectedQty: number;
  /** Items the line accepts instead of its own; the qty above covers them all. */
  substitutes: WorkOrderExpectedSubstitute[];
  isOptional: boolean;
}

export interface WorkOrderWithDetail extends WorkOrder {
  /** Null on a draw, which has no recipe behind it. */
  bomCode: string | null;
  bomName: string | null;
  /** Always resolved — from the recipe, or from what the draw was taken for. */
  outputItemName: string;
  outputUom: string;
  warehouseName: string;
  /** Empty on a draw: nothing was expected, the floor stated what it took. */
  expected: WorkOrderExpectedLine[];
}

export interface WorkOrderListRow extends WorkOrder {
  bomCode: string | null;
  bomName: string | null;
  outputItemName: string;
  outputUom: string;
  warehouseName: string;
}
