/**
 * Dispatch-time repack — decision maths, no DB access.
 *
 * A repackable SKU is one that only exists once it is labelled: the stock sits
 * in an unlabelled pool item and the BOM turns pool + label into the branded
 * pack. These functions decide whether a delivery line needs that conversion
 * and what expiry the pack it produces inherits.
 *
 * Kept pure and separate from the service for the same reason
 * sales-dispatch.logic.ts is — the rules are worth testing on their own.
 */

import type { ProductionAllocation } from '@runq/types';

/** Qty columns are decimal(12,3); match them so DB truncation never surprises. */
const QTY_DP = 3;

export function roundQty(value: number): number {
  return Math.round(value * 10 ** QTY_DP) / 10 ** QTY_DP;
}

export interface RepackDecisionInput {
  /** What the delivery line asks for. */
  qty: number;
  /** Batch pinned on the line — by the operator, or by FEFO at draft time. */
  batchNo: string | null;
  /** On-hand for the branded SKU across every batch in this warehouse. */
  onHandQty: number;
  /** Whether the SKU has an active BOM flagged allow_auto_repack. */
  hasRepackBom: boolean;
}

/**
 * Should this line be made on the spot?
 *
 * A pinned batch always wins: FEFO only pins a batch that covers the whole line
 * on its own, and an operator who typed one is asserting which stock ships. In
 * either case there is nothing to make.
 *
 * Otherwise the line is repacked in full rather than topped up by the shortfall.
 * A DN line carries exactly one batch, so a line part-drawn from leftover
 * branded stock and part from a fresh repack could not be expressed — and
 * splitting the line would break its 1:1 tie back to the invoice line. Leftover
 * stock isn't lost by this: it stays on hand and FEFO picks it for the next line
 * small enough for it to cover.
 */
export function needsRepack(input: RepackDecisionInput): boolean {
  if (!input.hasRepackBom) return false;
  if (input.batchNo) return false;
  return roundQty(input.onHandQty) < roundQty(input.qty);
}

/**
 * Expiry for the pack this repack produces: the earliest among the pool batches
 * consumed.
 *
 * A 200g pack cannot outlive the oldest paneer inside it, and FEFO means a run
 * that spans two pool batches is drawing the oldest first. Taking the minimum
 * is the only choice that can't overstate shelf life.
 *
 * Returns null when no consumed batch carries an expiry — the caller decides
 * whether the output item can live with that.
 */
export function earliestExpiry(
  allocations: readonly ProductionAllocation[],
): string | null {
  let earliest: string | null = null;
  for (const alloc of allocations) {
    for (const batch of alloc.batches) {
      if (!batch.expiryDate) continue;
      if (!earliest || batch.expiryDate < earliest) earliest = batch.expiryDate;
    }
  }
  return earliest;
}

/** Pool items a repack would need but the warehouse cannot cover. */
export interface RepackShortage {
  inputItemName: string;
  uom: string;
  requiredQty: number;
  availableQty: number;
  shortQty: number;
}

/**
 * Shortage phrased for a dispatch operator, who is looking at a branded SKU and
 * needs to be told the *pool* is what ran out — otherwise the message reads as
 * a contradiction of the "made on demand" promise.
 */
export function repackShortageMessage(
  skuName: string,
  qty: number,
  shortages: readonly RepackShortage[],
): string {
  const detail = shortages
    .map((s) => `${s.inputItemName} (need ${s.requiredQty} ${s.uom}, have ${s.availableQty})`)
    .join(', ');
  return `Cannot make ${qty} × ${skuName} on demand — not enough ${detail}`;
}
