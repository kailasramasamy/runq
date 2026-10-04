import { ValidationError } from '../../utils/errors';

export type ExistingLine = { id: string; description: string; qtyOrdered: number; qtyReceived: number; qtyBilled: number };
export type IncomingLine = { id?: string; qtyOrdered: number };

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, ''));

/**
 * How an edit changes a PO's lines. Lines carrying an id are amended in place
 * (keeping the receipt / bill links that point at them); lines without one
 * are new; existing lines left out are removed. A line can't drop below what
 * has already been received or billed against it, and one with any receipt or
 * bill can't be removed at all — that history is real stock and real money.
 */
export function planLineAmend<T extends IncomingLine>(existing: ExistingLine[], incoming: T[]) {
  const byId = new Map(existing.map((l) => [l.id, l]));
  for (const l of incoming) {
    if (!l.id) continue;
    const cur = byId.get(l.id);
    if (!cur) throw new ValidationError('A line being edited no longer exists on this PO — refresh and try again');
    const floor = Math.max(cur.qtyReceived, cur.qtyBilled);
    if (l.qtyOrdered < floor) {
      const why = cur.qtyBilled > cur.qtyReceived ? 'billed' : 'received';
      throw new ValidationError(`"${cur.description}" has ${fmt(floor)} ${why} — the quantity can't go below that`);
    }
  }
  const kept = new Set(incoming.map((l) => l.id).filter(Boolean));
  const removed = existing.filter((l) => !kept.has(l.id));
  const locked = removed.find((l) => l.qtyReceived > 0 || l.qtyBilled > 0);
  if (locked) {
    throw new ValidationError(`"${locked.description}" has been received or billed and can't be removed`);
  }
  return {
    update: incoming.filter((l) => l.id),
    insert: incoming.filter((l) => !l.id),
    remove: removed.map((l) => l.id),
  };
}

/** PO status implied by its lines once it's out of draft. */
export function statusFromLines(lines: Array<{ qtyOrdered: number; qtyReceived: number }>): 'sent' | 'partially_received' | 'received' {
  if (lines.length && lines.every((l) => l.qtyReceived >= l.qtyOrdered)) return 'received';
  return lines.some((l) => l.qtyReceived > 0) ? 'partially_received' : 'sent';
}
