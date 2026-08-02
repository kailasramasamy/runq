/**
 * Pure decision logic for the invoice → dispatch lane. Kept free of Drizzle
 * so the quantity guards — the part that decides whether stock is allowed to
 * move — can be tested without a database.
 */

/** Float slack: quantities are decimal(18,3), so this is well below one unit. */
const EPSILON = 1e-9;

export type LineResolution = 'item' | 'alias' | 'unmapped' | 'not_stocked';

/**
 * How an invoice line found its stock item. `unmapped` and `not_stocked`
 * both mean "no stock moves", but they're different messages to the user:
 * one is a gap to fix, the other is a service line behaving correctly.
 */
export function resolveLine(input: {
  itemId: string | null;
  directItemId: string | null;
  trackInventory: boolean;
}): LineResolution {
  if (!input.itemId) return 'unmapped';
  if (!input.trackInventory) return 'not_stocked';
  return input.directItemId ? 'item' : 'alias';
}

export function isStockable(resolution: LineResolution) {
  return resolution === 'item' || resolution === 'alias';
}

/** Never negative — an over-dispatched line owes nothing further. */
export function remainingQty(invoicedQty: number, dispatchedQty: number) {
  return Math.max(0, invoicedQty - dispatchedQty);
}

export interface QtyCheck {
  /** Label used in the rejection message. */
  description: string;
  requestedQty: number;
  /** Qty allowed in total across all documents. */
  allowedQty: number;
  /** Qty already committed by other documents. */
  committedQty: number;
}

/**
 * Returns a rejection message when a request would exceed what's allowed,
 * or null when it fits. Committed qty includes open drafts, so two drafts
 * for the same invoice line can't each look valid on their own.
 */
export function overCommitMessage(check: QtyCheck, verb: 'dispatch' | 'return'): string | null {
  const remaining = check.allowedQty - check.committedQty;
  if (check.requestedQty <= remaining + EPSILON) return null;
  const left = Math.max(0, remaining);
  return `"${check.description}" has ${trim(left)} left to ${verb}, tried ${trim(check.requestedQty)}`;
}

/**
 * Roll a set of per-line dispatch positions into the status shown on the AR
 * invoice. An invoice with no stockable lines is `not_stockable`, not
 * `pending` — a services-only invoice is never waiting on the warehouse.
 */
export function dispatchStatus(
  lines: Array<{ stockable: boolean; invoicedQty: number; dispatchedQty: number }>,
): 'not_stockable' | 'pending' | 'partial' | 'dispatched' {
  const stockable = lines.filter((l) => l.stockable);
  if (stockable.length === 0) return 'not_stockable';
  const complete = stockable.filter((l) => l.dispatchedQty >= l.invoicedQty - EPSILON);
  if (complete.length === stockable.length) return 'dispatched';
  return stockable.some((l) => l.dispatchedQty > EPSILON) ? 'partial' : 'pending';
}

/** Drop trailing zeros so messages read "5" and "2.5", not "5.000". */
function trim(n: number) {
  return String(Number(n.toFixed(3)));
}
