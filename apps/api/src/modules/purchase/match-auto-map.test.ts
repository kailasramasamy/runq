import { describe, it, expect } from 'vitest';
import { autoMapLines, openQty } from './match-auto-map';

const po = (id: string, description: string, ordered: number, received = 0, billed = 0) =>
  ({ id, description, qtyOrdered: ordered, qtyReceived: received, qtyBilled: billed });

describe('openQty', () => {
  it('counts what was ordered or received (whichever is more) and not yet billed', () => {
    expect(openQty(po('a', 'x', 10, 0, 0))).toBe(10);
    expect(openQty(po('a', 'x', 10, 12, 4))).toBe(8);
    expect(openQty(po('a', 'x', 10, 10, 10))).toBe(0);
  });
});

describe('autoMapLines', () => {
  const lines = [po('gn', 'Groundnut Oil', 15, 15), po('ses', 'Sesame Oil', 2, 2)];

  it('pairs by item name, ignoring case and spacing', () => {
    expect(autoMapLines([{ id: 'b1', itemName: 'groundnut  oil', quantity: 15 }, { id: 'b2', itemName: 'SESAME OIL', quantity: 2 }], lines))
      .toEqual([{ billLineId: 'b1', poLineId: 'gn', qty: 15 }, { billLineId: 'b2', poLineId: 'ses', qty: 2 }]);
  });

  it('caps at what is still open and skips unknown items', () => {
    expect(autoMapLines([{ id: 'b1', itemName: 'Groundnut Oil', quantity: 20 }, { id: 'b2', itemName: 'Ghee', quantity: 1 }], lines))
      .toEqual([{ billLineId: 'b1', poLineId: 'gn', qty: 15 }]);
  });

  it('pairs a lone bill item with a lone open line even if the names differ', () => {
    expect(autoMapLines([{ id: 'b1', itemName: 'GN oil 15L tin', quantity: 5 }], [po('gn', 'Groundnut Oil', 10, 5)]))
      .toEqual([{ billLineId: 'b1', poLineId: 'gn', qty: 5 }]);
  });
});
