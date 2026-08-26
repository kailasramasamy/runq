import { describe, it, expect } from 'vitest';
import type { ProductionAllocation } from '@runq/types';
import {
  earliestExpiry,
  needsRepack,
  repackShortageMessage,
} from './dispatch-repack.logic';

const base = { qty: 100, batchNo: null, onHandQty: 0, hasRepackBom: true };

describe('needsRepack', () => {
  it('makes a made-on-demand SKU that has no stock at all', () => {
    expect(needsRepack(base)).toBe(true);
  });

  it('leaves ordinary items alone so the ledger reports the shortage', () => {
    expect(needsRepack({ ...base, hasRepackBom: false })).toBe(false);
  });

  it('respects a pinned batch', () => {
    // FEFO only pins a batch that covers the whole line, and an operator who
    // typed one is asserting which stock ships. Either way, nothing to make.
    expect(needsRepack({ ...base, batchNo: 'FFNP-20260811-001', onHandQty: 0 }))
      .toBe(false);
  });

  it('does not make what is already on hand', () => {
    expect(needsRepack({ ...base, onHandQty: 100 })).toBe(false);
    expect(needsRepack({ ...base, onHandQty: 140 })).toBe(false);
  });

  it('remakes the whole line when leftover stock cannot cover it', () => {
    // 40 in stock against a line of 100: the line carries one batch, so it
    // ships 100 fresh and the 40 waits for a line it can cover on its own.
    expect(needsRepack({ ...base, onHandQty: 40 })).toBe(true);
  });

  it('treats a hair of rounding as covered, not as a 0.0001 repack', () => {
    expect(needsRepack({ ...base, qty: 100.0001, onHandQty: 100 })).toBe(false);
  });
});

function alloc(...expiries: Array<string | null>): ProductionAllocation {
  return {
    bomLineId: 'bl1',
    inputItemId: 'pool',
    inputItemName: 'A2 Paneer — Unlabelled',
    uom: 'kg',
    requiredQty: 20,
    availableQty: 50,
    isOptional: false,
    substitutes: [],
    pool: [],
    suggestion: [],
    batches: expiries.map((expiryDate, i) => ({
      itemId: 'pool',
      itemName: 'A2 Paneer — Unlabelled',
      batchNo: `B${i}`,
      qty: 10,
      unitCost: 300,
      expiryDate,
    })),
  };
}

describe('earliestExpiry', () => {
  it('takes the oldest pool batch in the run', () => {
    // The pack cannot outlive the oldest paneer inside it.
    expect(earliestExpiry([alloc('2026-08-20', '2026-08-14')])).toBe('2026-08-14');
  });

  it('spans every input line, not just the first', () => {
    expect(earliestExpiry([alloc('2026-08-20'), alloc('2026-08-12')]))
      .toBe('2026-08-12');
  });

  it('ignores inputs with no expiry, such as labels', () => {
    expect(earliestExpiry([alloc('2026-08-20'), alloc(null)])).toBe('2026-08-20');
  });

  it('returns null when nothing carries an expiry', () => {
    expect(earliestExpiry([alloc(null, null)])).toBeNull();
  });

  it('returns null for an empty run', () => {
    expect(earliestExpiry([])).toBeNull();
  });
});

describe('repackShortageMessage', () => {
  it('blames the pool, not the SKU the operator is looking at', () => {
    const msg = repackShortageMessage('A2 Desi Cow Paneer 200g', 60, [
      { inputItemName: 'A2 Paneer — Unlabelled', uom: 'kg', requiredQty: 12, availableQty: 5, shortQty: 7 },
    ]);
    expect(msg).toContain('60 × A2 Desi Cow Paneer 200g');
    expect(msg).toContain('A2 Paneer — Unlabelled (need 12 kg, have 5)');
  });
});
