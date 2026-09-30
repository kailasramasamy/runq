/**
 * Receipt-variance rollups: by source, by day, and the headline totals.
 *
 * Pure functions over the report's lines so the arithmetic is testable without
 * a database. Every received leg is a line — matched ones included — because
 * "short on 9 of 10 loads" needs the tenth: a source short on every load it
 * sends is a calibration or pilferage problem, one that swings both ways around
 * zero is measurement noise, and only the load count tells them apart.
 */

/** Dipstick vs flowmeter readings routinely disagree by about this much. A
 *  load inside it counts as matched for the pattern, though its litres and
 *  rupees still count toward the totals — money is money. */
export const TOLERANCE_PCT = 0.5;

/** Beyond this a single load is worth a second look. Matches the short-delivery
 *  push in MpNotifier so the screen and the alert agree. */
export const FLAG_PCT = 2;

export interface ReceiptVarianceLine {
  consignmentId: string;
  consignmentNo: string;
  date: string;
  shift: 'am' | 'pm' | null;
  stage: 'cc' | 'pp';
  milkType: string | null;
  fromNodeId: string;
  fromNodeName: string;
  toNodeId: string;
  toNodeName: string;
  dispatchedQty: number;
  /** What the receiving node measured — dispatch + variance. Not the kept
   *  receipt, which a later rejection reduces. */
  measuredQty: number;
  /** measured − dispatched: negative is a loss. */
  varianceQty: number;
  variancePct: number;
  /** Null = no pour or prior bill priced this leg's milk. */
  unitCost: number | null;
  varianceValue: number | null;
  /** Inside ±TOLERANCE_PCT — noise, not a short or a gain. */
  withinTolerance: boolean;
  flagged: boolean;
}

/** Litres and rupees for any group of loads — the whole period, one source, one day. */
export interface VarianceTally {
  loads: number;
  /** Loads beyond tolerance on each side, and inside it. */
  shortLoads: number;
  gainLoads: number;
  matchedLoads: number;
  flaggedLoads: number;
  dispatchedQty: number;
  measuredQty: number;
  shortQty: number; shortValue: number;
  gainQty: number; gainValue: number;
  netQty: number; netValue: number;
  /** netQty as a share of dispatched — the fair comparison between a big
   *  source and a small one. */
  netPct: number;
  /** Variance litres (either sign) with no price — so a ₹ total isn't read as
   *  complete when part of it couldn't be valued. */
  unpricedQty: number;
}

export interface VarianceBySource extends VarianceTally {
  fromNodeId: string;
  fromNodeName: string;
}

export interface VarianceByDay extends VarianceTally {
  date: string;
}

export interface ReceiptVarianceReport {
  totals: VarianceTally;
  /** Worst first: most rupees lost, then most litres. */
  bySource: VarianceBySource[];
  /** Newest first. Only days with at least one load. */
  byDay: VarianceByDay[];
  lines: ReceiptVarianceLine[];
}

export function classify(variancePct: number): Pick<ReceiptVarianceLine, 'withinTolerance' | 'flagged'> {
  const abs = Math.abs(variancePct);
  return { withinTolerance: abs <= TOLERANCE_PCT, flagged: abs >= FLAG_PCT };
}

/** Losses and gains summed apart, so a gain on one load never hides a loss on
 *  another; net is carried alongside, never instead. */
export function tally(lines: readonly ReceiptVarianceLine[]): VarianceTally {
  const t: VarianceTally = {
    loads: lines.length, shortLoads: 0, gainLoads: 0, matchedLoads: 0, flaggedLoads: 0,
    dispatchedQty: 0, measuredQty: 0,
    shortQty: 0, shortValue: 0, gainQty: 0, gainValue: 0,
    netQty: 0, netValue: 0, netPct: 0, unpricedQty: 0,
  };
  for (const l of lines) {
    t.dispatchedQty += l.dispatchedQty;
    t.measuredQty += l.measuredQty;
    const value = l.varianceValue ?? 0;
    if (l.varianceQty < 0) {
      t.shortQty += -l.varianceQty;
      t.shortValue += -value;
    } else {
      t.gainQty += l.varianceQty;
      t.gainValue += value;
    }
    if (l.withinTolerance) t.matchedLoads += 1;
    else if (l.varianceQty < 0) t.shortLoads += 1;
    else t.gainLoads += 1;
    if (l.flagged) t.flaggedLoads += 1;
    if (l.varianceValue == null) t.unpricedQty += Math.abs(l.varianceQty);
  }
  t.netQty = t.gainQty - t.shortQty;
  t.netValue = t.gainValue - t.shortValue;
  t.netPct = t.dispatchedQty > 0 ? (t.netQty / t.dispatchedQty) * 100 : 0;
  return rounded(t);
}

export function bySource(lines: readonly ReceiptVarianceLine[]): VarianceBySource[] {
  const groups = groupBy(lines, (l) => l.fromNodeId);
  return [...groups.values()]
    .map((g) => ({ fromNodeId: g[0]!.fromNodeId, fromNodeName: g[0]!.fromNodeName, ...tally(g) }))
    .sort((a, b) => a.netValue - b.netValue || a.netQty - b.netQty);
}

export function byDay(lines: readonly ReceiptVarianceLine[]): VarianceByDay[] {
  const groups = groupBy(lines, (l) => l.date);
  return [...groups.entries()]
    .map(([date, g]) => ({ date, ...tally(g) }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function buildReport(lines: ReceiptVarianceLine[]): ReceiptVarianceReport {
  return { totals: tally(lines), bySource: bySource(lines), byDay: byDay(lines), lines };
}

function groupBy<T>(items: readonly T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    const g = m.get(k);
    if (g) g.push(it); else m.set(k, [it]);
  }
  return m;
}

function rounded(t: VarianceTally): VarianceTally {
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    ...t,
    dispatchedQty: r3(t.dispatchedQty), measuredQty: r3(t.measuredQty),
    shortQty: r3(t.shortQty), gainQty: r3(t.gainQty), netQty: r3(t.netQty),
    unpricedQty: r3(t.unpricedQty),
    shortValue: r2(t.shortValue), gainValue: r2(t.gainValue), netValue: r2(t.netValue),
    netPct: r3(t.netPct),
  };
}
