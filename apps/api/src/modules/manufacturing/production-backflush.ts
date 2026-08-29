/**
 * Manufacturing — backflush math for unplanned production entries.
 *
 * Pure functions: given a BOM and what the technician says was produced, work
 * out how much of each input that implies and which batches it comes out of.
 * No DB access here so the arithmetic stays directly testable.
 *
 * A BOM line may accept substitutes — "7 L of raw milk, A2 or A1 or buffalo".
 * That is still one requirement with one qty, so it stays one allocation; the
 * draw simply spans the line's item and its stand-ins, and every batch it
 * yields carries the item it actually came from.
 *
 * Spec: docs/manufacturing-plan.md §5.6.
 */

import type {
  InputPoolLine,
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

/** One item a line can draw from, with the stock standing behind it. */
export interface AllocationSource {
  itemId: string;
  itemName: string;
  tracksBatches: boolean;
  available: readonly SuggestedBatch[];
}

/** One BOM input line, as the backflush needs it. */
export interface BomInputLine {
  bomLineId: string;
  inputItemId: string;
  inputItemName: string;
  qtyPerOutput: number;
  inputUom: string;
  scrapPct: number;
  isOptional: boolean;
  tracksBatches: boolean;
  /** Items accepted in place of the line's own, in the order it prefers them. */
  substitutes: Array<{ itemId: string; itemName: string; priority: number }>;
}

/**
 * Draw `required` across the sources, splitting when the earliest-expiring
 * batch cannot cover it.
 *
 * With one source this is plain FEFO. With substitutes the sources' batches
 * merge into a single queue — earliest expiry first, oldest movement breaking
 * ties for undated stock like raw milk, then the line's own item ahead of its
 * stand-ins — so a paneer run takes the milk that needs using, whatever type
 * it is. Returns whatever it could allocate; the caller compares `allocated`
 * against `required` to decide whether the line is short.
 */
export function allocateFefo(
  required: number,
  sources: readonly AllocationSource[],
): { batches: ProductionAllocationBatch[]; allocated: number } {
  const queue = orderedQueue(sources);

  const batches: ProductionAllocationBatch[] = [];
  let remaining = required;

  for (const { source, batch } of queue) {
    if (remaining <= 0) break;
    const take = roundQty(Math.min(remaining, batch.availableQty));
    if (take <= 0) continue;
    batches.push({
      itemId: source.itemId,
      itemName: source.itemName,
      // stock_on_hand keys non-batch items as '', but the ledger rejects a
      // batch_no for items that don't track batches — normalise to null.
      batchNo: source.tracksBatches ? batch.batchNo : null,
      qty: take,
      unitCost: batch.unitCost,
      expiryDate: batch.expiryDate,
    });
    remaining = roundQty(remaining - take);
  }

  return { batches, allocated: roundQty(required - Math.max(remaining, 0)) };
}

interface QueuedBatch {
  sourceIdx: number;
  batch: SuggestedBatch;
}

/** FEFO across items: expiry first, then batch age, then source order. */
function byExpiryThenAge(a: QueuedBatch, b: QueuedBatch): number {
  const ax = a.batch.expiryDate;
  const bx = b.batch.expiryDate;
  if (ax !== bx) {
    if (!ax) return 1;
    if (!bx) return -1;
    return ax < bx ? -1 : 1;
  }
  const aAge = a.batch.lastMovementAt ?? '';
  const bAge = b.batch.lastMovementAt ?? '';
  if (aAge !== bAge) return aAge < bAge ? -1 : 1;
  return a.sourceIdx - b.sourceIdx;
}

/**
 * The line's stock as one queue in draw order — earliest expiry, then oldest
 * movement, then the line's own item ahead of its stand-ins.
 *
 * Every reader of the pool goes through here: the allocation, the pool view
 * and the suggestion. A second ordering would let the screen show one thing
 * and the run take another.
 */
function orderedQueue(
  sources: readonly AllocationSource[],
): Array<{ source: AllocationSource; batch: SuggestedBatch }> {
  const queue = sources.flatMap((source, sourceIdx) =>
    source.available.map((batch) => ({ source, sourceIdx, batch })),
  );
  queue.sort(byExpiryThenAge);
  return queue;
}

/**
 * Draw `required` the way someone on the floor would: tip in whole cans, and
 * take the shortfall from one bigger batch.
 *
 * Plain FEFO empties the queue in order, so a 70 L draw against a 75 L batch
 * takes 70 and leaves 5 — and the part-cans pile up until the pool is a shelf
 * of unusable remnants. This walks the same queue but only takes a batch whole
 * while it fits inside what is still needed; a batch too big to fit is set
 * aside. The leftover is then drawn from the first batch set aside, so the run
 * leaves ONE remnant instead of five, and leaves it in the longest-dated stock
 * it can.
 *
 * Nothing is over-drawn: a can that does not fit is never tipped in whole.
 */
export function suggestDraw(
  required: number,
  sources: readonly AllocationSource[],
): ProductionAllocationBatch[] {
  const queue = orderedQueue(sources);
  const taken: ProductionAllocationBatch[] = [];
  const deferred: typeof queue = [];
  let remaining = roundQty(required);

  const take = (entry: (typeof queue)[number], qty: number) => {
    taken.push({
      itemId: entry.source.itemId,
      itemName: entry.source.itemName,
      batchNo: entry.source.tracksBatches ? entry.batch.batchNo : null,
      qty,
      unitCost: entry.batch.unitCost,
      expiryDate: entry.batch.expiryDate,
    });
    remaining = roundQty(remaining - qty);
  };

  for (const entry of queue) {
    if (remaining <= 0) break;
    if (entry.batch.availableQty <= 0) continue;
    if (entry.batch.availableQty <= remaining) {
      take(entry, entry.batch.availableQty); // drains the can
    } else {
      deferred.push(entry); // too big to finish — keep it for the shortfall
    }
  }

  // The shortfall comes from the first deferred batch: leaving a remnant of
  // long-dated stock beats leaving one that is about to expire.
  if (remaining > 0 && deferred.length > 0) take(deferred[0]!, remaining);

  return taken;
}

/**
 * Every batch standing behind each input line, in the order a run would take
 * them — the same merged FEFO queue `allocateFefo` walks, just not stopped at
 * a required qty.
 *
 * Sharing the queue is the point: a pool view that ordered stock its own way
 * would show one thing and the next run would draw another.
 */
export function buildPool(
  lines: readonly BomInputLine[],
  availableByItem: ReadonlyMap<string, readonly SuggestedBatch[]>,
): InputPoolLine[] {
  return lines.map((line) => {
    const sources = sourcesFor(line, availableByItem);
    const batches = orderedQueue(sources).map(({ source, batch }) => ({
      itemId: source.itemId,
      itemName: source.itemName,
      batchNo: source.tracksBatches ? batch.batchNo : null,
      qty: batch.availableQty,
      unitCost: batch.unitCost,
      expiryDate: batch.expiryDate,
      lastMovementAt: batch.lastMovementAt ?? null,
      originKind: batch.originKind ?? null,
      originLabel: batch.originLabel ?? null,
      originDetail: batch.originDetail ?? null,
      receivedQty: batch.receivedQty ?? null,
      addedQty: batch.addedQty ?? null,
    }));

    const totalQty = roundQty(batches.reduce((sum, b) => sum + b.qty, 0));
    // What one BOM batch draws, scrap included — the yardstick behind
    // "how many more can I run before I open the fresh stock?".
    const qtyPerBatch = computeRequiredQty(line.qtyPerOutput, 1, line.scrapPct);

    return {
      bomLineId: line.bomLineId,
      inputItemId: line.inputItemId,
      inputItemName: line.inputItemName,
      uom: line.inputUom,
      qtyPerBatch,
      totalQty,
      batchesCovered: qtyPerBatch > 0 ? Math.floor(totalQty / qtyPerBatch) : 0,
      isOptional: line.isOptional,
      substitutes: line.substitutes.map((s) => ({ itemId: s.itemId, itemName: s.itemName })),
      batches,
    };
  });
}

/**
 * Turn the BOM into a concrete draw against what is on hand.
 *
 * One allocation per line, whether or not the line accepts substitutes — the
 * recipe asks for 7 L of milk once, so the preview says so once.
 */
export function buildAllocations(
  lines: readonly BomInputLine[],
  runs: number,
  availableByItem: ReadonlyMap<string, readonly SuggestedBatch[]>,
): ProductionAllocation[] {
  return lines.map((line) => {
    const sources = sourcesFor(line, availableByItem);
    const requiredQty = computeRequiredQty(line.qtyPerOutput, runs, line.scrapPct);
    const { batches } = allocateFefo(requiredQty, sources);
    const pool = orderedQueue(sources).map(({ source, batch }) => ({
      itemId: source.itemId,
      itemName: source.itemName,
      batchNo: source.tracksBatches ? batch.batchNo : null,
      qty: batch.availableQty,
      unitCost: batch.unitCost,
      expiryDate: batch.expiryDate,
      lastMovementAt: batch.lastMovementAt ?? null,
      originKind: batch.originKind ?? null,
      originLabel: batch.originLabel ?? null,
      originDetail: batch.originDetail ?? null,
      receivedQty: batch.receivedQty ?? null,
      addedQty: batch.addedQty ?? null,
    }));

    return {
      bomLineId: line.bomLineId,
      inputItemId: line.inputItemId,
      inputItemName: line.inputItemName,
      uom: line.inputUom,
      requiredQty,
      availableQty: roundQty(
        sources.reduce(
          (sum, s) => sum + s.available.reduce((n, b) => n + b.availableQty, 0),
          0,
        ),
      ),
      isOptional: line.isOptional,
      substitutes: line.substitutes.map((s) => ({
        itemId: s.itemId,
        itemName: s.itemName,
      })),
      batches,
      pool,
      suggestion: suggestDraw(requiredQty, sources),
    };
  });
}

/**
 * The line's own item first, then its substitutes by priority.
 *
 * A substitute naming the line's own item is dropped: it would queue the same
 * batches twice and let the line draw stock that isn't there.
 */
export function sourcesFor(
  line: BomInputLine,
  availableByItem: ReadonlyMap<string, readonly SuggestedBatch[]>,
): AllocationSource[] {
  const seen = new Set([line.inputItemId]);
  const sources: AllocationSource[] = [
    {
      itemId: line.inputItemId,
      itemName: line.inputItemName,
      tracksBatches: line.tracksBatches,
      available: availableByItem.get(line.inputItemId) ?? [],
    },
  ];

  for (const sub of [...line.substitutes].sort((a, b) => a.priority - b.priority)) {
    if (seen.has(sub.itemId)) continue;
    seen.add(sub.itemId);
    sources.push({
      itemId: sub.itemId,
      itemName: sub.itemName,
      tracksBatches: line.tracksBatches,
      available: availableByItem.get(sub.itemId) ?? [],
    });
  }

  return sources;
}

/**
 * Replace the FEFO allocation for any input the technician overrode.
 *
 * An override is all-or-nothing per item: supplying one line for an item
 * discards the server's batches for that item, so a partial edit must list
 * every batch actually used. Other items on the same allocation keep theirs —
 * editing the buffalo draw leaves the A2 draw alone. Unit costs are re-read
 * from the available batches (a technician picks batches, never prices).
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
  if (overridesByItem.size === 0) return allocations;

  // An overridden item belongs to whichever line accepts it — its own, or the
  // one listing it as a substitute. First line to claim it wins, so a BOM that
  // names the same item twice cannot apply the same override twice.
  const claimed = new Set<string>();
  return allocations.map((alloc) => {
    const items = [alloc.inputItemId, ...alloc.substitutes.map((s) => s.itemId)].filter(
      (itemId) => overridesByItem.has(itemId) && !claimed.has(itemId),
    );
    if (items.length === 0) return alloc;
    items.forEach((itemId) => claimed.add(itemId));

    // An override set describes the WHOLE line, so the server's own allocation
    // for it is dropped rather than merged. Keeping the un-overridden part
    // would let a FEFO draw the operator never saw ride along beside the
    // quantities they typed — the line would consume more than the screen
    // showed, which is exactly the drift the manual split exists to stop.
    const replaced = items.flatMap((itemId) =>
      overrideBatches(
        itemId,
        alloc,
        overridesByItem.get(itemId)!,
        availableByItem,
        tracksBatchesByItem,
      ),
    );

    return { ...alloc, batches: replaced };
  });
}

function overrideBatches(
  itemId: string,
  alloc: ProductionAllocation,
  lines: readonly ProductionLineOverride[],
  availableByItem: ReadonlyMap<string, readonly SuggestedBatch[]>,
  tracksBatchesByItem: ReadonlyMap<string, boolean>,
): ProductionAllocationBatch[] {
  const available = availableByItem.get(itemId) ?? [];
  const tracksBatches = tracksBatchesByItem.get(itemId) ?? false;
  const itemName =
    itemId === alloc.inputItemId
      ? alloc.inputItemName
      : (alloc.substitutes.find((s) => s.itemId === itemId)?.itemName ??
        alloc.inputItemName);

  return lines.map((line) => {
    const source = available.find((b) => b.batchNo === (line.batchNo ?? ''));
    return {
      itemId,
      itemName,
      batchNo: tracksBatches ? (line.batchNo ?? null) : null,
      qty: roundQty(line.qty),
      unitCost: source?.unitCost ?? 0,
      expiryDate: source?.expiryDate ?? null,
    };
  });
}

/**
 * Inputs the run needs but the warehouse cannot cover.
 *
 * One line, one verdict — a line that accepts substitutes is short only when
 * its item and its stand-ins together fall behind. Optional lines never raise
 * a shortage when absent, and an overridden line is still checked against
 * on-hand, so a technician cannot type their way past missing stock.
 */
export function findShortages(
  allocations: readonly ProductionAllocation[],
): ProductionShortage[] {
  const shortages: ProductionShortage[] = [];

  for (const alloc of allocations) {
    const allocated = roundQty(alloc.batches.reduce((sum, b) => sum + b.qty, 0));
    if (allocated >= alloc.requiredQty) continue;
    if (alloc.isOptional && allocated === 0) continue;

    const shortQty = roundQty(alloc.requiredQty - allocated);
    if (shortQty <= 0) continue;

    shortages.push({
      inputItemId: alloc.inputItemId,
      inputItemName: describeInput(alloc),
      uom: alloc.uom,
      requiredQty: alloc.requiredQty,
      availableQty: alloc.availableQty,
      shortQty,
    });
  }

  return shortages;
}

/** "A2 Milk (Raw) or 2 alternates" — so the floor knows the stand-ins were counted. */
function describeInput(alloc: ProductionAllocation): string {
  const count = alloc.substitutes.length;
  if (count === 0) return alloc.inputItemName;
  return `${alloc.inputItemName} or ${count} alternate${count === 1 ? '' : 's'}`;
}

/** Overrides can ask for more of a batch than exists — catch it before posting. */
export function findOverdrawnBatches(
  allocations: readonly ProductionAllocation[],
  availableByItem: ReadonlyMap<string, readonly SuggestedBatch[]>,
): ProductionShortage[] {
  const overdrawn: ProductionShortage[] = [];

  for (const alloc of allocations) {
    for (const draw of drawnPerBatch(alloc)) {
      const onHand =
        (availableByItem.get(draw.itemId) ?? []).find((b) => b.batchNo === draw.batchNo)
          ?.availableQty ?? 0;
      if (draw.qty <= onHand) continue;
      overdrawn.push({
        inputItemId: draw.itemId,
        inputItemName: draw.batchNo
          ? `${draw.itemName} (batch ${draw.batchNo})`
          : draw.itemName,
        uom: alloc.uom,
        requiredQty: draw.qty,
        availableQty: onHand,
        shortQty: roundQty(draw.qty - onHand),
      });
    }
  }

  return overdrawn;
}

/** Totals per item + batch — a split draw on one batch must be judged as one. */
function drawnPerBatch(
  alloc: ProductionAllocation,
): Array<{ itemId: string; itemName: string; batchNo: string; qty: number }> {
  const drawn = new Map<
    string,
    { itemId: string; itemName: string; batchNo: string; qty: number }
  >();

  for (const batch of alloc.batches) {
    const batchNo = batch.batchNo ?? '';
    const key = `${batch.itemId}|${batchNo}`;
    const at = drawn.get(key);
    if (at) at.qty = roundQty(at.qty + batch.qty);
    else {
      drawn.set(key, {
        itemId: batch.itemId,
        itemName: batch.itemName,
        batchNo,
        qty: batch.qty,
      });
    }
  }

  return [...drawn.values()];
}
