/**
 * What a raw-material lot became.
 *
 * The pool screen could say a lot was part-used and how many litres had left
 * it, which states that something happened without saying what. On a floor the
 * useful form of that sentence names the product: 525 litres of this
 * consignment went out as A2 Desi Cow Milk on the 4th.
 *
 * Read off `wo_consumption` (the draw, keyed on input item + batch) and
 * `wo_output` (what the same runs produced). Deliberately two queries rather
 * than one join: a run with two output products would duplicate every
 * consumption row, and summing across that join credits the lot with twice the
 * milk it gave up.
 *
 * A run usually draws from more than one lot, so the quantity reported is the
 * quantity taken *from this lot* — never the run's whole output, which would
 * credit one consignment with milk that came from three.
 */

import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import type { Db } from '@runq/db';
import {
  woConsumption, woOutput, workOrders, items,
  stockLedger, inventoryAdjustments,
} from '@runq/db';
import type { BatchUsage, BatchUsageRun, BatchUsageOtherOut } from '@runq/types';

/** `production_loss` → `Production loss`, for enums people read. */
function humanise(v: string): string {
  return v.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

/** Ledger movement types that leave a lot, in the words the floor uses. */
const MOVEMENT_LABEL: Record<string, string> = {
  delivery: 'Sold / dispatched',
  transfer_out: 'Transferred out',
  adjustment_out: 'Adjusted out',
  reclaim_out: 'Reclaimed',
};

/** Postgres's timestamp rendering → ISO-8601, or null when unparseable. */
function toIso(v: string | null): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export class BatchUsageService {
  constructor(private readonly db: Db, private readonly tenantId: string) {}

  /**
   * The runs fed by each of [batchNos] of [itemId], keyed by batch number.
   *
   * Batched by design: the pool sheet holds every lot of one item at once, and
   * asking per lot would be a query per card. Batches with no run against them
   * are absent from the map rather than present and empty.
   */
  async byBatch(
    itemId: string,
    batchNos: readonly string[],
  ): Promise<Record<string, BatchUsage>> {
    const wanted = batchNos.filter(Boolean);
    if (wanted.length === 0) return {};

    const [runsByBatch, otherByBatch] = await Promise.all([
      this.runs(itemId, wanted),
      this.otherOut(itemId, wanted),
    ]);

    const out: Record<string, BatchUsage> = {};
    for (const batchNo of new Set([
      ...Object.keys(runsByBatch),
      ...Object.keys(otherByBatch),
    ])) {
      out[batchNo] = {
        runs: runsByBatch[batchNo] ?? [],
        otherOut: otherByBatch[batchNo] ?? [],
      };
    }
    return out;
  }

  /** The production runs each lot fed. */
  private async runs(
    itemId: string,
    wanted: readonly string[],
  ): Promise<Record<string, BatchUsageRun[]>> {

    // 1. How much of each lot each run drew. Summed because a run can take
    //    from the same lot more than once — a top-up mid-run is two rows.
    const draws = await this.db
      .select({
        batchNo: woConsumption.batchNo,
        woId: workOrders.id,
        woNumber: workOrders.woNumber,
        uom: woConsumption.uom,
        drawnQty: sql<string>`SUM(${woConsumption.qty})`,
      })
      .from(woConsumption)
      .innerJoin(workOrders, eq(workOrders.id, woConsumption.woId))
      .where(
        and(
          eq(woConsumption.tenantId, this.tenantId),
          eq(woConsumption.inputItemId, itemId),
          inArray(woConsumption.batchNo, [...wanted]),
        ),
      )
      .groupBy(woConsumption.batchNo, workOrders.id, workOrders.woNumber, woConsumption.uom);

    if (draws.length === 0) return {};

    const woIds = Array.from(new Set(draws.map((d) => d.woId)));

    // How much of this input each run drew in total, across every lot. Without
    // it the output count is a half-truth: a run that took 525 litres here and
    // 525 from the next can gets its whole 1,041 packs printed under this lot,
    // and the floor can disprove it. With it the row can say "525 of 1,050".
    const runTotals = await this.db
      .select({
        woId: woConsumption.woId,
        total: sql<string>`SUM(${woConsumption.qty})`,
      })
      .from(woConsumption)
      .where(
        and(
          eq(woConsumption.tenantId, this.tenantId),
          eq(woConsumption.inputItemId, itemId),
          inArray(woConsumption.woId, woIds),
        ),
      )
      .groupBy(woConsumption.woId);
    const totalByWo = new Map(runTotals.map((r) => [r.woId, Number(r.total ?? 0)]));

    // 2. What those runs produced, in its own pass so the outputs never
    //    multiply the draws above.
    const outputs = await this.db
      .select({
        woId: woOutput.woId,
        itemName: items.name,
        uom: woOutput.uom,
        qty: sql<string>`SUM(${woOutput.qty})`,
        producedAt: sql<string | null>`MAX(${woOutput.producedAt})`,
      })
      .from(woOutput)
      .innerJoin(items, eq(items.id, woOutput.outputItemId))
      .where(and(eq(woOutput.tenantId, this.tenantId), inArray(woOutput.woId, woIds)))
      .groupBy(woOutput.woId, items.name, woOutput.uom);

    const byWo = new Map<string, typeof outputs>();
    for (const o of outputs) {
      const list = byWo.get(o.woId) ?? [];
      list.push(o);
      byWo.set(o.woId, list);
    }

    const out: Record<string, BatchUsageRun[]> = {};
    for (const d of draws) {
      if (!d.batchNo) continue;
      const made = byWo.get(d.woId) ?? [];
      (out[d.batchNo] ??= []).push({
        woId: d.woId,
        woNumber: d.woNumber,
        drawnQty: Number(d.drawnQty ?? 0),
        drawnUom: d.uom,
        runDrewQty: totalByWo.get(d.woId) ?? Number(d.drawnQty ?? 0),
        // Normalised to ISO here, not passed through: `MAX()` hands back
        // Postgres's own rendering ("2026-09-04 21:25:54.848+05:30"), and
        // every other timestamp this API emits is ISO-8601.
        producedAt: toIso(
          made.reduce<string | null>(
            (latest, o) =>
              o.producedAt && (!latest || o.producedAt > latest) ? o.producedAt : latest,
            null,
          ),
        ),
        outputs: made.map((o) => ({
          itemName: o.itemName,
          qty: Number(o.qty ?? 0),
          uom: o.uom,
        })),
      });
    }

    // Most recent run first — what a lot went into yesterday is the thing
    // being asked about, not what it went into a week ago. A run that has
    // drawn but not yet produced has no date and stays on top, where the
    // operator can still see it is open.
    for (const list of Object.values(out)) {
      list.sort((a, b) => (b.producedAt ?? '9999').localeCompare(a.producedAt ?? '9999'));
    }
    return out;
  }

  /**
   * Everything that left the lot other than a production run.
   *
   * Without it the card cannot add up. A lot showing 661.4 received, 577.9
   * used and one run drawing 525.8 leaves 52.1 litres of milk with no account
   * of where they went — which on a shop floor is not a rounding difference,
   * it is a question. Here that 52.1 is a wastage adjustment against the same
   * run, and saying so is the whole point.
   *
   * Read off the ledger rather than each source table, so a movement type
   * nobody anticipated still shows up with its quantity instead of silently
   * widening the gap.
   */
  private async otherOut(
    itemId: string,
    wanted: readonly string[],
  ): Promise<Record<string, BatchUsageOtherOut[]>> {
    const rows = await this.db
      .select({
        batchNo: stockLedger.batchNo,
        movementType: stockLedger.movementType,
        sourceType: stockLedger.sourceType,
        sourceId: stockLedger.sourceId,
        qty: sql<string>`SUM(${stockLedger.qtyOut})`,
        at: sql<string | null>`MAX(${stockLedger.postedAt})`,
      })
      .from(stockLedger)
      .where(
        and(
          eq(stockLedger.tenantId, this.tenantId),
          eq(stockLedger.itemId, itemId),
          inArray(stockLedger.batchNo, [...wanted]),
          sql`${stockLedger.qtyOut} > 0`,
          // Runs are already listed by name and product; repeating them here
          // would double the litres the card claims left the lot.
          ne(stockLedger.sourceType, 'work_order'),
        ),
      )
      .groupBy(
        stockLedger.batchNo,
        stockLedger.movementType,
        stockLedger.sourceType,
        stockLedger.sourceId,
      );

    if (rows.length === 0) return {};

    // Adjustments carry the only human account of why milk left — "Wastage on
    // WO-...", "To make Khoa". Everything else is labelled from its movement
    // type, which is enough to place it.
    const adjIds = rows
      .filter((r) => r.sourceType === 'inventory_adjustment' && r.sourceId)
      .map((r) => r.sourceId!);
    const adjById = new Map<string, { no: string; reason: string; notes: string | null }>();
    if (adjIds.length > 0) {
      const adjs = await this.db
        .select({
          id: inventoryAdjustments.id,
          no: inventoryAdjustments.adjNo,
          reason: inventoryAdjustments.reason,
          notes: inventoryAdjustments.notes,
        })
        .from(inventoryAdjustments)
        .where(
          and(
            eq(inventoryAdjustments.tenantId, this.tenantId),
            inArray(inventoryAdjustments.id, adjIds),
          ),
        );
      for (const a of adjs) adjById.set(a.id, { no: a.no, reason: a.reason, notes: a.notes });
    }

    const out: Record<string, BatchUsageOtherOut[]> = {};
    for (const r of rows) {
      if (!r.batchNo) continue;
      const adj = r.sourceId ? adjById.get(r.sourceId) : undefined;
      (out[r.batchNo] ??= []).push({
        kind: r.sourceType,
        // The note the operator typed beats any label this code could invent;
        // the reason enum is the fallback, and the movement type the last one.
        label: adj?.notes?.trim()
          ? adj.notes.trim()
          : adj
            ? humanise(adj.reason)
            : MOVEMENT_LABEL[r.movementType] ?? humanise(r.movementType),
        ref: adj?.no ?? null,
        qty: Number(r.qty ?? 0),
        at: toIso(r.at),
      });
    }
    for (const list of Object.values(out)) {
      list.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
    }
    return out;
  }
}
