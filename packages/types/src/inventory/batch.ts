/**
 * Batch provenance — what a `batch_no` on stock actually is.
 *
 * Resolved from the first inbound stock-ledger movement (see
 * `BatchOriginService`), not stored. Every surface that lists batches carries
 * these fields so a planner reads `Indus CC · 28 Aug PM · A2 cow` rather than
 * `CN-2026-000418`.
 */

/** Coarse bucket for the origin, driving the icon and colour on a batch row. */
export type BatchOriginKind =
  | 'mp_receipt'   // milk taken in at the plant against a procurement consignment
  | 'reclaim'      // finished goods cut open and returned to the raw pool
  | 'grn'          // bought in from a vendor
  | 'production'   // made in-house by a work order
  | 'transfer'     // moved in from another warehouse
  | 'adjustment'
  | 'stock_take'
  | 'opening'
  | 'unknown';

export interface BatchOriginRef {
  /** Ledger `source_type` of the movement that opened the batch. */
  type: string;
  id: string;
  /** Human document number — consignment no, GRN no, WO number. */
  no: string | null;
}

export interface BatchOrigin {
  itemId: string;
  batchNo: string;
  kind: BatchOriginKind;
  /** One-line provenance, ready to render. */
  label: string;
  /** Secondary line — tanker, QC readings, document number. Null when the
   *  label already says everything known. */
  detail: string | null;
  /** Business date of the source document (collection date for milk). */
  sourceDate: string | null;
  shift: 'am' | 'pm' | null;
  milkType: string | null;
  sourceRef: BatchOriginRef | null;
  /** Everything ever put into the batch. Against on-hand qty this is what
   *  separates a full batch from yesterday's part-used balance. */
  receivedQty: number;
  /** Of `receivedQty`, how much came from the document named in `label`. */
  originQty: number;
  /**
   * Stock added to the batch from somewhere other than its origin — an
   * adjustment topping up a milk consignment, say. The label names one
   * source, so anything above zero here means the label does not account for
   * all of the batch and the UI has to say so.
   */
  addedQty: number;
  /** When the batch was last topped up from another source. */
  addedAt: string | null;
  /** When the batch first landed, by the clock — orders same-day intake that
   *  shares a midnight business date. */
  firstInAt: string;
}

/** The batch fields every stock surface adds on top of qty/cost/expiry. */
export interface BatchProvenanceFields {
  originKind?: BatchOriginKind | null;
  originLabel?: string | null;
  originDetail?: string | null;
  originDate?: string | null;
  originShift?: 'am' | 'pm' | null;
  originMilkType?: string | null;
  originRef?: BatchOriginRef | null;
  receivedQty?: number | null;
}
