/**
 * Manufacturing — backflush math for unplanned production entries.
 *
 * Pure functions: given a BOM and what the technician says was produced, work
 * out how much of each input that implies and which batches it comes out of.
 * No DB access here so the arithmetic stays directly testable.
 *
 * Spec: docs/manufacturing-plan.md §5.6.
 */

import type {
  ProductionAllocation,
  ProductionAllocationBatch,
  ProductionShortage,
  SuggestedBatch,
} from '@runq/types';
import type { ProductionLineOverride } from '@runq/validators';

/** Qty columns are decimal(12,3); round to match so DB truncation never surprises. */
const QTY_DP = 3;

export function roundQty(value: number): number {
  return Math.round(value * 10 ** QTY_DP) / 10 ** QTY_DP;
}

/**
 * How much of one input a run consumes.
 *
 *   required = qtyPerOutput × runs × (1 + scrapPct/100)
 *
 * `runs` is producedQty ÷ bom.outputQty, so a BOM yielding 100 L run for 250 L
 * of output is 2.5 runs.
 */
export function computeRequiredQty(
  qtyPerOutput: number,
  runs: number,
  scrapPct: number,
): number {
  return roundQty(qtyPerOutput * runs * (1 + scrapPct / 100));
}

/**
 * Draw `required` from the FEFO-ordered batches, splitting across batches when
 * the earliest-expiring one cannot cover it.
 *
 * Returns whatever it could allocate — the caller compares `allocated` against
 * `required` to decide whether this input is short.
 */
export function allocateFefo(
  required: number,
  available: readonly SuggestedBatch[],
  tracksBatches: boolean,
): { batches: ProductionAllocationBatch[]; allocated: number } {
  const batches: ProductionAllocationBatch[] = [];
  let remaining = required;

  for (const batch of available) {
    if (remaining <= 0) break;
    const take = roundQty(Math.min(remaining, batch.availableQty));
    if (take <= 0) continue;
    batches.push({
      // stock_on_hand keys non-batch items as '', but the ledger rejects a
      // batch_no for items that don't track batches — normalise to null.
      batchNo: tracksBatches ? batch.batchNo : null,
      qty: take,
      unitCost: batch.unitCost,
      expiryDate: batch.expiryDate,
    });
    remaining = roundQty(remaining - take);
  }

  return { batches, allocated: roundQty(required - Math.max(remaining, 0)) };
}

/**
 * Replace the FEFO allocation for any input the technician overrode.
 *
 * An override is all-or-nothing per item: supplying one line for an item
 * discards the server's batches for that item, so a partial edit must list
 * every batch actually used. Unit costs are re-read from the available batches
 * (a technician picks batches, never prices).
 */
export function applyOverrides(
  allocations: ProductionAllocation[],
  overrides: readonly ProductionLineOverride[],
  availableByItem: ReadonlyMap<string, readonly SuggestedBatch[]>,
  tracksBatchesByItem: ReadonlyMap<string, boolean>,
): ProductionAllocation[] {
  const overridesByItem = new Map<string, ProductionLineOverride[]>();
  for (const line of overrides) {
    const list = overridesByItem.get(line.inputItemId) ?? [];
    list.push(line);
    overridesByItem.set(line.inputItemId, list);
  }

  return allocations.map((alloc) => {
    const lines = overridesByItem.get(alloc.inputItemId);
    if (!lines) return alloc;

    const available = availableByItem.get(alloc.inputItemId) ?? [];
    const tracksBatches = tracksBatchesByItem.get(alloc.inputItemId) ?? false;

    return {
      ...alloc,
      batches: lines.map((line) => {
        const batchNo = tracksBatches ? (line.batchNo ?? null) : null;
        const source = available.find((b) => b.batchNo === (line.batchNo ?? ''));
        return {
          batchNo,
          qty: roundQty(line.qty),
          unitCost: source?.unitCost ?? 0,
          expiryDate: source?.expiryDate ?? null,
        };
      }),
    };
  });
}

/**
 * Inputs the run needs but the warehouse cannot cover.
 *
 * Optional BOM lines never raise a shortage — they are skipped when absent.
 * Overridden lines are checked against on-hand too, so a technician cannot
 * type their way past missing stock.
 */
export function findShortages(
  allocations: readonly ProductionAllocation[],
): ProductionShortage[] {
  const shortages: ProductionShortage[] = [];

  for (const alloc of allocations) {
    const allocated = roundQty(
      alloc.batches.reduce((sum, b) => sum + b.qty, 0),
    );
    if (allocated >= alloc.requiredQty) continue;
    if (alloc.isOptional && allocated === 0) continue;

    const shortQty = roundQty(alloc.requiredQty - allocated);
    if (shortQty <= 0) continue;

    shortages.push({
      inputItemId: alloc.inputItemId,
      inputItemName: alloc.inputItemName,
      uom: alloc.uom,
      requiredQty: alloc.requiredQty,
      availableQty: alloc.availableQty,
      shortQty,
    });
  }

  return shortages;
}

/** Overrides can ask for more of a batch than exists — catch it before posting. */
export function findOverdrawnBatches(
  allocations: readonly ProductionAllocation[],
  availableByItem: ReadonlyMap<string, readonly SuggestedBatch[]>,
): ProductionShortage[] {
  const overdrawn: ProductionShortage[] = [];

  for (const alloc of allocations) {
    const available = availableByItem.get(alloc.inputItemId) ?? [];
    const drawnByBatch = new Map<string, number>();
    for (const batch of alloc.batches) {
      const key = batch.batchNo ?? '';
      drawnByBatch.set(key, roundQty((drawnByBatch.get(key) ?? 0) + batch.qty));
    }

    for (const [batchNo, drawn] of drawnByBatch) {
      const onHand = available.find((b) => b.batchNo === batchNo)?.availableQty ?? 0;
      if (drawn <= onHand) continue;
      overdrawn.push({
        inputItemId: alloc.inputItemId,
        inputItemName: batchNo
          ? `${alloc.inputItemName} (batch ${batchNo})`
          : alloc.inputItemName,
        uom: alloc.uom,
        requiredQty: drawn,
        availableQty: onHand,
        shortQty: roundQty(drawn - onHand),
      });
    }
  }

  return overdrawn;
}
