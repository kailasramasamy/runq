/**
 * What a litre of milk arriving at the plant cost to buy.
 *
 * The plant's raw milk has to carry a cost or manufacturing consumes it at zero
 * and every finished product is under-costed by its main input. Two bases, in
 * order of how directly they know the price:
 *
 *   1. The pours behind the leg. The farmer's pour is where the price is
 *      actually struck (`rate_per_litre` against the rate chart), so a
 *      volume-weighted average of the day's pours is the real purchase cost.
 *
 *   2. The last VMCC bill. Centres whose VMCCs record no pours — Indus CC's
 *      twelve, entered as manual receipts — have no pour to average, so their
 *      milk landed at zero: ~600 L a day of the plant's intake with no cost on
 *      it. The bill that settled those VMCCs last cycle is a price the company
 *      actually paid, `milk_cost / qty_litres`, so it stands in until pours
 *      exist. Self-correcting: each cycle's bill re-bases the estimate, and the
 *      difference against the next settlement is variance, not a silent zero.
 *
 * Both exclude quarterly bonus, advances and feed-loan recoveries — they are
 * not per-litre purchase cost and land as variance when the cycle clears.
 *
 * Plan: docs/dhenu-raw-milk-valuation.md §3, and §6 decision 4 (resolved:
 * previous bill's realised rate).
 */

import { and, eq, inArray, lt, isNull, sql } from 'drizzle-orm';
import type { Db } from '@runq/db';
import {
  mpPours, mpNodes, mpConsignments, mpVmccBills, mpPayoutCycles,
} from '@runq/db';
import type { MpConsignmentRow } from '@runq/db';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = any;

const round2 = (v: number): number => Math.round(v * 100) / 100;

/** A bill, reduced to what a rate needs. Decimals arrive from pg as strings. */
export interface BilledLeg {
  nodeId: string;
  periodEnd: string;
  milkCost: number | string;
  qtyLitres: number | string;
}

/**
 * One bill per source VMCC — the last one that settled.
 *
 * A centre bills every cycle, so a plain average over all its bills would
 * anchor the estimate to rates from months ago. Only the newest per node
 * speaks for what milk costs there now.
 */
export function latestBillPerNode(bills: readonly BilledLeg[]): BilledLeg[] {
  const latest = new Map<string, BilledLeg>();
  for (const b of bills) {
    const held = latest.get(b.nodeId);
    if (!held || b.periodEnd > held.periodEnd) latest.set(b.nodeId, b);
  }
  return Array.from(latest.values());
}

/**
 * Volume-weighted rate across bills — total cost over total litres.
 *
 * Weighted, not a mean of rates: a 1,487 L centre at ₹37.60 and a 155 L centre
 * at ₹42.45 blend to ₹38.06, and averaging the two rates instead would say
 * ₹40.03 and over-value every tanker.
 */
export function blendedBillRate(bills: readonly BilledLeg[]): number {
  const cost = bills.reduce((sum, b) => sum + Number(b.milkCost), 0);
  const litres = bills.reduce((sum, b) => sum + Number(b.qtyLitres), 0);
  return litres > 0 ? round2(cost / litres) : 0;
}

export class RawMilkCostService {
  constructor(private readonly tenantId: string) {}

  /** Purchase cost per litre for this leg, or 0 when neither basis knows it. */
  async unitCost(db: Db | Tx, c: MpConsignmentRow): Promise<number> {
    const nodeIds = await this.sourceNodeIds(db, c);
    if (nodeIds.length === 0) return 0;
    const fromPours = await this.pourRate(db, c, nodeIds);
    if (fromPours > 0) return fromPours;
    return this.lastBillRate(db, c, nodeIds);
  }

  /**
   * Whose milk this leg is. A CC's intake is its VMCCs'; a VMCC shipping
   * straight to the plant is its own source.
   */
  private async sourceNodeIds(db: Db | Tx, c: MpConsignmentRow): Promise<string[]> {
    const [src] = await db.select({ nodeType: mpNodes.nodeType }).from(mpNodes)
      .where(and(eq(mpNodes.tenantId, this.tenantId), eq(mpNodes.id, c.fromNodeId)));
    if (!src) return [];
    if (src.nodeType !== 'cc') return [c.fromNodeId];
    const kids = await db.select({ id: mpNodes.id }).from(mpNodes)
      .where(and(eq(mpNodes.tenantId, this.tenantId), eq(mpNodes.parentNodeId, c.fromNodeId)));
    return kids.map((k: { id: string }) => k.id);
  }

  /** Volume-weighted `line_amount / qty_litres` of the pours behind the leg. */
  private async pourRate(
    db: Db | Tx, c: MpConsignmentRow, nodeIds: string[],
  ): Promise<number> {
    const [r] = await db.select({
      qty: sql<string>`coalesce(sum(${mpPours.qtyLitres}), 0)`,
      amount: sql<string>`coalesce(sum(${mpPours.lineAmount}), 0)`,
    }).from(mpPours).where(and(
      eq(mpPours.tenantId, this.tenantId),
      inArray(mpPours.nodeId, nodeIds),
      eq(mpPours.collectionDate, c.collectionDate),
      eq(mpPours.status, 'recorded'),
      ...(c.milkType ? [eq(mpPours.milkType, c.milkType)] : []),
    ));
    const qty = Number(r?.qty ?? 0);
    return qty > 0 ? round2(Number(r?.amount ?? 0) / qty) : 0;
  }

  /**
   * Blended realised rate of the most recent bill for each source VMCC.
   *
   * "Most recent" by the cycle the bill settled, and only cycles that closed
   * before this collection — a leg must not be valued from a settlement that
   * had not happened when the milk arrived, or re-posting the same receipt
   * later would give a different cost.
   */
  private async lastBillRate(
    db: Db | Tx, c: MpConsignmentRow, nodeIds: string[],
  ): Promise<number> {
    const rows: BilledLeg[] = await db
      .select({
        nodeId: mpVmccBills.vmccNodeId,
        periodEnd: mpPayoutCycles.periodEnd,
        milkCost: mpVmccBills.milkCost,
        qtyLitres: mpVmccBills.qtyLitres,
      })
      .from(mpVmccBills)
      .innerJoin(mpPayoutCycles, eq(mpPayoutCycles.id, mpVmccBills.payoutCycleId))
      .where(and(
        eq(mpVmccBills.tenantId, this.tenantId),
        inArray(mpVmccBills.vmccNodeId, nodeIds),
        isNull(mpVmccBills.reversedAt),
        lt(mpPayoutCycles.periodEnd, c.collectionDate),
      ));
    if (rows.length === 0) return 0;

    const bills = latestBillPerNode(rows);
    if (!await this.singleMilkType(db, c, bills)) return 0;
    return blendedBillRate(bills);
  }

  /**
   * Whether the bills can speak for this leg's milk type.
   *
   * A bill settles a VMCC's whole cycle with no per-type split, so its rate is
   * blended across everything that centre collected. That is only safe where
   * the centre collects one type — pricing buffalo at a cow-blended rate is a
   * ₹25/L error, and a wrong cost on the shop floor is worse than none. A
   * mixed-type centre keeps today's zero until its VMCCs record pours.
   *
   * Judged over the period the bills cover, not all history, so one stray leg
   * years ago does not disable the estimate for good.
   */
  private async singleMilkType(
    db: Db | Tx, c: MpConsignmentRow, bills: BilledLeg[],
  ): Promise<boolean> {
    if (!c.milkType) return false;
    const from = bills.reduce((a, b) => (b.periodEnd < a ? b.periodEnd : a), bills[0]!.periodEnd);
    const types = await db.selectDistinct({ t: mpConsignments.milkType })
      .from(mpConsignments)
      .where(and(
        eq(mpConsignments.tenantId, this.tenantId),
        eq(mpConsignments.fromNodeId, c.fromNodeId),
        sql`${mpConsignments.collectionDate} >= ${from}`,
      ));
    return types.length === 1 && types[0]?.t === c.milkType;
  }
}
