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
  /**
   * Sum of on-hand behind this line in the warehouse — the line's own item
   * plus any substitutes, since the line will accept them.
   */
  availableQty: number;
  isOptional: boolean;
  /** Items this line accepts instead of its own, in the order it prefers them. */
  substitutes: ProductionAllocationSubstitute[];
  /** Empty when nothing is on hand — pair with the matching shortage row. */
  batches: ProductionAllocationBatch[];
  /**
   * Everything this line could draw from, in draw order — its own item plus
   * every stand-in. The screen lists these with a qty box each so the floor
   * splits the draw itself.
   */
  pool: InputPoolBatch[];
  /**
   * What the "Suggest" button fills in: whole cans first, the shortfall from
   * one bigger batch. Offered, never applied — a number nobody typed is how
   * stock quietly drifts from what is on the floor.
   */
  suggestion: ProductionAllocationBatch[];
}

export interface ProductionAllocationSubstitute {
  itemId: string;
  itemName: string;
}

export interface ProductionAllocationBatch {
  /**
   * Which item the batch belongs to. Differs from the allocation's own item
   * when the draw fell to a substitute, so consumption posts against the stock
   * that actually moved.
   */
  itemId: string;
  itemName: string;
  batchNo: string | null;
  qty: number;
  unitCost: number;
  expiryDate: string | null;
}

/** An input the BOM demands but the warehouse cannot cover. Blocks posting. */
export interface ProductionShortage {
  /** The first member item for a pooled shortage — the pool has no single id. */
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

/**
 * Manufacturing — input pool ("what have I got to run this with?").
 *
 * A read-only view of every batch standing behind a BOM's inputs, ordered the
 * way the backflush would draw them. On a dairy floor that is the milk pool:
 * cut-open pouches and yesterday's balance ahead of the tanker that landed at
 * noon, so the operator can see whether the next paneer batch breaks into
 * fresh stock before committing to it.
 */
export interface InputPoolBatch {
  itemId: string;
  itemName: string;
  batchNo: string | null;
  /** On hand, not allocated — nothing is reserved by looking. */
  qty: number;
  unitCost: number;
  expiryDate: string | null;
  /** Drives the age shown next to the batch, and breaks FEFO ties. */
  lastMovementAt: string | null;
  /** Provenance — see `SuggestedBatch`. A draw is booked against a specific
   *  can of milk, so the row has to say which collection that is. */
  originKind?: string | null;
  originLabel?: string | null;
  originDetail?: string | null;
  receivedQty?: number | null;
  addedQty?: number | null;
}

export interface InputPoolLine {
  bomLineId: string | null;
  inputItemId: string;
  inputItemName: string;
  uom: string;
  /** What one BOM batch draws, scrap included. */
  qtyPerBatch: number;
  totalQty: number;
  /** Whole BOM batches the pool covers — the "can I run two more?" answer. */
  batchesCovered: number;
  isOptional: boolean;
  substitutes: ProductionAllocationSubstitute[];
  /** Draw order: earliest expiry, then oldest movement, then line item first. */
  batches: InputPoolBatch[];
}

export interface InputPool {
  bomId: string;
  bomCode: string;
  bomName: string;
  outputItemName: string;
  warehouseId: string;
  warehouseName: string;
  lines: InputPoolLine[];
}
