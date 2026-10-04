import { normaliseCatalogDescription } from '@runq/db';

export type PoLineOpen = { id: string; description: string; qtyOrdered: number; qtyReceived: number; qtyBilled: number };
export type BillItem = { id: string; itemName: string; quantity: number };

/** Qty still to be billed on a PO line: what was ordered or received (whichever is more) less what's billed. */
export const openQty = (l: PoLineOpen) => Math.max(0, Math.max(l.qtyOrdered, l.qtyReceived) - l.qtyBilled);

/**
 * Pair a bill's items with a PO's open lines so billed qty can be recorded
 * without the user mapping each one: by item name (normalised the way the
 * vendor catalog does), or — when the bill and the PO each have exactly one
 * open item — those two. Each mapping bills at most the line's open qty.
 */
export function autoMapLines(bill: BillItem[], po: PoLineOpen[]) {
  const open = po.filter((l) => openQty(l) > 0);
  const remaining = new Map(open.map((l) => [l.id, openQty(l)]));
  const byName = new Map(open.map((l) => [normaliseCatalogDescription(l.description), l]));
  const pairs: Array<{ billLineId: string; poLineId: string; qty: number }> = [];
  for (const item of bill) {
    const line = byName.get(normaliseCatalogDescription(item.itemName))
      ?? (bill.length === 1 && open.length === 1 ? open[0] : undefined);
    if (!line) continue;
    const qty = Math.min(item.quantity, remaining.get(line.id) ?? 0);
    if (qty <= 0) continue;
    remaining.set(line.id, (remaining.get(line.id) ?? 0) - qty);
    pairs.push({ billLineId: item.id, poLineId: line.id, qty });
  }
  return pairs;
}
