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
export type WoEntryMode = 'planned' | 'unplanned';

export interface WorkOrder {
  id: string;
  tenantId: string;
  woNumber: string;
  bomId: string;
  bomVersion: number;
  plannedQty: number;
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
  bomCode: string;
  bomName: string;
  outputItemId: string;
  outputItemName: string;
  outputUom: string;
  warehouseName: string;
  expected: WorkOrderExpectedLine[];
}

export interface WorkOrderListRow extends WorkOrder {
  bomCode: string;
  bomName: string;
  outputItemName: string;
  warehouseName: string;
}
