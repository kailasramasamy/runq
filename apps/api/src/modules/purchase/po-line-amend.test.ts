import { describe, it, expect } from 'vitest';
import { planLineAmend, statusFromLines } from './po-line-amend';

const line = (id: string, ordered: number, received = 0, billed = 0) =>
  ({ id, description: `Item ${id}`, qtyOrdered: ordered, qtyReceived: received, qtyBilled: billed });

describe('planLineAmend', () => {
  const existing = [line('a', 100, 60), line('b', 50), line('c', 20, 0, 5)];

  it('amends in place, inserts new lines and removes untouched ones', () => {
    const plan = planLineAmend(existing, [{ id: 'a', qtyOrdered: 120 }, { id: 'c', qtyOrdered: 20 }, { qtyOrdered: 10 }]);
    expect(plan.update.map((l) => l.id)).toEqual(['a', 'c']);
    expect(plan.insert).toHaveLength(1);
    expect(plan.remove).toEqual(['b']);
  });

  it('refuses a quantity below what was received or billed', () => {
    expect(() => planLineAmend(existing, [{ id: 'a', qtyOrdered: 50 }, { id: 'b', qtyOrdered: 50 }, { id: 'c', qtyOrdered: 20 }]))
      .toThrow(/60 received/);
    expect(() => planLineAmend(existing, [{ id: 'a', qtyOrdered: 100 }, { id: 'b', qtyOrdered: 50 }, { id: 'c', qtyOrdered: 4 }]))
      .toThrow(/5 billed/);
  });

  it('refuses to remove a line with receipts or bills', () => {
    expect(() => planLineAmend(existing, [{ id: 'b', qtyOrdered: 50 }, { id: 'c', qtyOrdered: 20 }])).toThrow(/Item a.*can't be removed/);
  });

  it('refuses an id that is not on the PO', () => {
    expect(() => planLineAmend(existing, [{ id: 'zz', qtyOrdered: 1 }])).toThrow(/no longer exists/);
  });
});

describe('statusFromLines', () => {
  it('follows what has been received', () => {
    expect(statusFromLines([{ qtyOrdered: 10, qtyReceived: 0 }])).toBe('sent');
    expect(statusFromLines([{ qtyOrdered: 10, qtyReceived: 4 }, { qtyOrdered: 5, qtyReceived: 0 }])).toBe('partially_received');
    expect(statusFromLines([{ qtyOrdered: 10, qtyReceived: 10 }])).toBe('received');
    // adding a line to a fully received PO reopens it
    expect(statusFromLines([{ qtyOrdered: 10, qtyReceived: 10 }, { qtyOrdered: 3, qtyReceived: 0 }])).toBe('partially_received');
  });
});

describe('dueFrom', () => {
  it('reads the days out of the payment terms', async () => {
    const { dueFrom } = await import('./receive-and-bill');
    expect(dueFrom('2026-10-04', 'Net 30')).toBe('2026-11-03');
    expect(dueFrom('2026-10-04', null)).toBe('2026-10-04');
    expect(dueFrom('2026-10-04', 'Immediate')).toBe('2026-10-04');
  });
});
