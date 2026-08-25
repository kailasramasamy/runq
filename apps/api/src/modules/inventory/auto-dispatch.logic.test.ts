import { describe, expect, it } from 'vitest';
import type { CoverableLine } from './auto-dispatch.logic';
import { coverableQty, shortfallReason, splitByAvailability } from './auto-dispatch.logic';

function line(over: Partial<CoverableLine> = {}): CoverableLine {
  return {
    remainingQty: 10,
    availableQty: 10,
    repackFrom: null,
    itemName: 'A2 Milk 500ml',
    description: 'A2 Milk 500ml',
    ...over,
  };
}

describe('coverableQty', () => {
  it('adds the repack pool to standing stock', () => {
    expect(coverableQty(line({ availableQty: 4, repackFrom: { capacityQty: 6 } }))).toBe(10);
  });

  it('never lets a negative on-hand eat into the pool', () => {
    expect(coverableQty(line({ availableQty: -5, repackFrom: { capacityQty: 6 } }))).toBe(6);
  });
});

describe('splitByAvailability', () => {
  it('ships a fully covered line whole', () => {
    const { ready, short } = splitByAvailability([line({ remainingQty: 10, availableQty: 897 })]);
    expect(ready).toEqual([{ line: expect.anything(), qty: 10 }]);
    expect(short).toEqual([]);
  });

  it('ships what is on hand and parks the rest', () => {
    const { ready, short } = splitByAvailability([line({ remainingQty: 10, availableQty: 4 })]);
    expect(ready[0]!.qty).toBe(4);
    expect(short[0]!.qty).toBe(6);
  });

  it('parks a line with nothing behind it, keeping the others shippable', () => {
    const [milk, ghee] = [
      line({ remainingQty: 553, availableQty: 897, itemName: 'A2 Milk' }),
      line({ remainingQty: 2, availableQty: 0, itemName: 'A2 Ghee' }),
    ];
    const { ready, short } = splitByAvailability([milk!, ghee!]);
    expect(ready.map((r) => [r.line.itemName, r.qty])).toEqual([['A2 Milk', 553]]);
    expect(short.map((r) => [r.line.itemName, r.qty])).toEqual([['A2 Ghee', 2]]);
  });

  it('does not invent a fourth decimal', () => {
    const { ready, short } = splitByAvailability([line({ remainingQty: 1, availableQty: 0.3 })]);
    expect(ready[0]!.qty).toBe(0.3);
    expect(short[0]!.qty).toBe(0.7);
  });
});

describe('shortfallReason', () => {
  it('names up to three lines and counts the rest', () => {
    const short = ['A', 'B', 'C', 'D'].map((n) => ({ line: line({ itemName: n }), qty: 2 }));
    expect(shortfallReason(short)).toBe('Short on A ×2, B ×2, C ×2, +1 more');
  });

  it('falls back to the invoice description when the item has no name', () => {
    expect(shortfallReason([{ line: line({ itemName: null, description: 'Ghee tin' }), qty: 1 }]))
      .toBe('Short on Ghee tin ×1');
  });
});
