/**
 * Deciding how much of an invoice line the warehouse can actually hand over.
 *
 * A delivery note posts whole or not at all, so before auto-dispatch raises
 * one it has to know which quantities will survive the ledger. Everything
 * here is pure arithmetic over a preview row — no database, so the rules that
 * decide what ships are testable on their own.
 */

/** The slice of a preview line this module needs to size a shipment. */
export interface CoverableLine {
  remainingQty: number;
  availableQty: number;
  repackFrom: { capacityQty: number } | null;
  itemName: string | null;
  description: string;
}

/** One line cut down to a quantity — either ready to ship, or waiting. */
export interface SplitLine<T extends CoverableLine = CoverableLine> {
  line: T;
  qty: number;
}

/** Qty is numeric(18,3); float arithmetic must not invent a fourth decimal. */
export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * What the warehouse could hand over for this line today.
 *
 * A made-on-demand SKU holds no standing stock of its own — it is branded at
 * dispatch — so the pool behind it is the real limit, and adds to whatever
 * finished packs happen to be sitting on the shelf.
 */
export function coverableQty(l: CoverableLine): number {
  return Math.max(l.availableQty, 0) + Math.max(l.repackFrom?.capacityQty ?? 0, 0);
}

/**
 * Split what the invoice still owes into what ships now and what waits.
 *
 * Two lines drawing on one repack pool are each measured against the whole
 * pool, so a rare invoice can still over-claim and fail to post. That lands
 * on the caller's existing failure path — a draft left for a human — which is
 * exactly where every short line used to land, so the worst case is the old
 * behaviour rather than a new one.
 */
export function splitByAvailability<T extends CoverableLine>(lines: T[]) {
  const ready: SplitLine<T>[] = [];
  const short: SplitLine<T>[] = [];
  for (const line of lines) {
    const now = round3(Math.min(line.remainingQty, coverableQty(line)));
    if (now > 0) ready.push({ line, qty: now });
    const rest = round3(line.remainingQty - now);
    if (rest > 0) short.push({ line, qty: rest });
  }
  return { ready, short };
}

/** Names the operator has to act on, not a wall of every line. */
export function shortfallReason(short: SplitLine[]): string {
  const named = short.slice(0, 3)
    .map((s) => `${s.line.itemName ?? s.line.description} ×${s.qty}`);
  const more = short.length > named.length ? `, +${short.length - named.length} more` : '';
  return `Short on ${named.join(', ')}${more}`;
}
