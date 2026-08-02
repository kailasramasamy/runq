import { describe, it, expect } from 'vitest';
import {
  dispatchStatus,
  isStockable,
  overCommitMessage,
  remainingQty,
  resolveLine,
} from './sales-dispatch.logic';

describe('resolveLine', () => {
  it('prefers the direct catalogue link', () => {
    expect(resolveLine({ itemId: 'i1', directItemId: 'i1', trackInventory: true })).toBe('item');
  });

  it('falls back to a remembered description alias', () => {
    expect(resolveLine({ itemId: 'i1', directItemId: null, trackInventory: true })).toBe('alias');
  });

  it('reports an ad-hoc line as unmapped rather than dropping it', () => {
    expect(resolveLine({ itemId: null, directItemId: null, trackInventory: true })).toBe('unmapped');
  });

  it('separates a service SKU from an unmapped line', () => {
    // Freight billed as a catalogue item with trackInventory=false — correctly
    // moves no stock, and must not nag the user to "map" it.
    expect(resolveLine({ itemId: 'freight', directItemId: 'freight', trackInventory: false }))
      .toBe('not_stocked');
  });

  it('only counts item/alias lines as stockable', () => {
    expect(isStockable('item')).toBe(true);
    expect(isStockable('alias')).toBe(true);
    expect(isStockable('unmapped')).toBe(false);
    expect(isStockable('not_stocked')).toBe(false);
  });
});

describe('remainingQty', () => {
  it('is what is left to send', () => {
    expect(remainingQty(100, 40)).toBe(60);
  });

  it('never goes negative when a line was over-dispatched historically', () => {
    expect(remainingQty(100, 120)).toBe(0);
  });
});

describe('overCommitMessage', () => {
  it('allows a dispatch that fits', () => {
    expect(overCommitMessage({
      description: 'A2 Curd 500g', requestedQty: 60, allowedQty: 100, committedQty: 40,
    }, 'dispatch')).toBeNull();
  });

  it('allows sending the exact remainder', () => {
    expect(overCommitMessage({
      description: 'A2 Curd 500g', requestedQty: 60, allowedQty: 100, committedQty: 40,
    }, 'dispatch')).toBeNull();
  });

  it('rejects a dispatch beyond the invoiced qty', () => {
    expect(overCommitMessage({
      description: 'A2 Curd 500g', requestedQty: 70, allowedQty: 100, committedQty: 40,
    }, 'dispatch')).toBe('"A2 Curd 500g" has 60 left to dispatch, tried 70');
  });

  it('counts an open draft as committed, so a second draft cannot double-ship', () => {
    // 100 invoiced, a draft already holds all 100 → nothing left.
    expect(overCommitMessage({
      description: 'Ghee 1L', requestedQty: 1, allowedQty: 100, committedQty: 100,
    }, 'dispatch')).toBe('"Ghee 1L" has 0 left to dispatch, tried 1');
  });

  it('does not trip on decimal rounding', () => {
    expect(overCommitMessage({
      description: 'Milk', requestedQty: 0.3, allowedQty: 1, committedQty: 0.7,
    }, 'dispatch')).toBeNull();
  });

  it('never reports a negative remainder', () => {
    expect(overCommitMessage({
      description: 'Paneer', requestedQty: 5, allowedQty: 10, committedQty: 12,
    }, 'return')).toBe('"Paneer" has 0 left to return, tried 5');
  });

  it('uses the caller-supplied verb', () => {
    expect(overCommitMessage({
      description: 'Paneer', requestedQty: 5, allowedQty: 4, committedQty: 0,
    }, 'return')).toContain('left to return');
  });
});

describe('dispatchStatus', () => {
  const line = (over: Partial<{ stockable: boolean; invoicedQty: number; dispatchedQty: number }> = {}) => ({
    stockable: true, invoicedQty: 100, dispatchedQty: 0, ...over,
  });

  it('is not_stockable for a services-only invoice', () => {
    // A consultancy invoice must never sit in the warehouse queue.
    expect(dispatchStatus([line({ stockable: false })])).toBe('not_stockable');
  });

  it('is pending when nothing has gone out', () => {
    expect(dispatchStatus([line(), line()])).toBe('pending');
  });

  it('is partial when one line shipped short', () => {
    expect(dispatchStatus([line({ dispatchedQty: 100 }), line({ dispatchedQty: 40 })]))
      .toBe('partial');
  });

  it('is dispatched when every stockable line is complete', () => {
    expect(dispatchStatus([line({ dispatchedQty: 100 }), line({ dispatchedQty: 100 })]))
      .toBe('dispatched');
  });

  it('ignores non-stockable lines when deciding completion', () => {
    // Goods fully sent, freight line never ships — invoice is done.
    expect(dispatchStatus([
      line({ dispatchedQty: 100 }),
      line({ stockable: false, invoicedQty: 1, dispatchedQty: 0 }),
    ])).toBe('dispatched');
  });

  it('treats an over-dispatched line as complete, not partial', () => {
    expect(dispatchStatus([line({ dispatchedQty: 120 })])).toBe('dispatched');
  });
});
