/**
 * Manufacturing — unplanned production entry ("Record Production").
 *
 * A technician states what was produced; the server backflushes the inputs
 * from the BOM, allocates them FEFO, and posts the whole thing as one
 * unplanned work order. Spec: docs/manufacturing-plan.md §5.6.
 */

/** One BOM input, FEFO-allocated across the batches actually on hand. */
export interface ProductionAllocation {
  bomLineId: string | null;
  inputItemId: string;
  inputItemName: string;
  uom: string;
  /** qtyPerOutput × runs × (1 + scrapPct/100), rounded to 4dp. */
  requiredQty: number;
  /** Sum of on-hand across every batch of this item in the warehouse. */
  availableQty: number;
  isOptional: boolean;
  /** Empty when nothing is on hand — pair with the matching shortage row. */
  batches: ProductionAllocationBatch[];
}

export interface ProductionAllocationBatch {
  batchNo: string | null;
  qty: number;
  unitCost: number;
  expiryDate: string | null;
}

/** An input the BOM demands but the warehouse cannot cover. Blocks posting. */
export interface ProductionShortage {
  inputItemId: string;
  inputItemName: string;
  uom: string;
  requiredQty: number;
  availableQty: number;
  shortQty: number;
}

export interface ProductionPreview {
  bomId: string;
  bomVersion: number;
  bomCode: string;
  bomName: string;
  outputItemId: string;
  outputItemName: string;
  outputUom: string;
  /** producedQty ÷ bom.outputQty — how many BOM batches this run represents. */
  runs: number;
  producedQty: number;
  warehouseId: string;
  warehouseName: string;
  /** Whether the output item requires a batch number + expiry date. */
  outputTracksBatches: boolean;
  allocations: ProductionAllocation[];
  shortages: ProductionShortage[];
  /** Sum of allocated qty × unit cost — the run's input cost at current WAC. */
  estimatedInputValue: number;
}
