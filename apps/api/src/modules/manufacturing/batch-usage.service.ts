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

import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '@runq/db';
import { woConsumption, woOutput, workOrders, items } from '@runq/db';
import type { BatchUsageRun } from '@runq/types';

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
  ): Promise<Record<string, BatchUsageRun[]>> {
    const wanted = batchNos.filter(Boolean);
    if (wanted.length === 0) return {};

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
}
