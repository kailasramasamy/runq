import { describe, it, expect } from 'vitest';
import {
  allocateFefo,
  applyOverrides,
  computeRequiredQty,
  findOverdrawnBatches,
  findShortages,
} from './production-backflush';
import type { ProductionAllocation, SuggestedBatch } from '@runq/types';

// A dairy BOM: 100 L of curd from 95 L milk + 2 kg culture, 2% scrap on milk.
const batch = (
  batchNo: string,
  availableQty: number,
  expiryDate: string | null = null,
  unitCost = 40,
): SuggestedBatch => ({ batchNo, availableQty, unitCost, expiryDate });

const allocation = (over: Partial<ProductionAllocation> = {}): ProductionAllocation => ({
  bomLineId: 'line-1',
  inputItemId: 'milk',
  inputItemName: 'A2 Milk',
  uom: 'L',
  requiredQty: 100,
  availableQty: 100,
  isOptional: false,
  batches: [],
  ...over,
});

describe('computeRequiredQty', () => {
  it('scales by runs — a 100 L BOM run for 250 L of output is 2.5 runs', () => {
    expect(computeRequiredQty(0.95, 2.5, 0)).toBe(2.375);
  });

  it('adds scrap on top', () => {
    // 95 L per run + 2% scrap
    expect(computeRequiredQty(95, 1, 2)).toBe(96.9);
  });

  it('rounds to 3dp to match the decimal(12,3) qty columns', () => {
    expect(computeRequiredQty(1 / 3, 1, 0)).toBe(0.333);
  });

  it('is zero-safe on a zero-qty line', () => {
    expect(computeRequiredQty(0, 5, 10)).toBe(0);
  });
});

describe('allocateFefo', () => {
  it('draws from the earliest-expiring batch first', () => {
    // The service passes batches already FEFO-ordered by the suggest query.
    const { batches, allocated } = allocateFefo(
      30,
      [batch('B1', 50, '2026-08-05'), batch('B2', 50, '2026-08-20')],
      true,
    );
    expect(batches).toEqual([
      { batchNo: 'B1', qty: 30, unitCost: 40, expiryDate: '2026-08-05' },
    ]);
    expect(allocated).toBe(30);
  });

  it('splits across batches when the first cannot cover the run', () => {
    const { batches, allocated } = allocateFefo(
      80,
      [batch('B1', 50, '2026-08-05'), batch('B2', 50, '2026-08-20')],
      true,
    );
    expect(batches.map((b) => [b.batchNo, b.qty])).toEqual([
      ['B1', 50],
      ['B2', 30],
    ]);
    expect(allocated).toBe(80);
  });

  it('allocates only what exists when stock is short', () => {
    const { batches, allocated } = allocateFefo(100, [batch('B1', 20)], true);
    expect(batches).toHaveLength(1);
    expect(allocated).toBe(20);
  });

  it('allocates nothing when there is no stock at all', () => {
    const { batches, allocated } = allocateFefo(100, [], true);
    expect(batches).toEqual([]);
    expect(allocated).toBe(0);
  });

  it('nulls the batch no for items that do not track batches', () => {
    // stock_on_hand keys these as '', but the ledger rejects a batch_no here.
    const { batches } = allocateFefo(10, [batch('', 50)], false);
    expect(batches[0]!.batchNo).toBeNull();
  });

  it('stops once the requirement is met, leaving later batches untouched', () => {
    const { batches } = allocateFefo(
      50,
      [batch('B1', 50), batch('B2', 50), batch('B3', 50)],
      true,
    );
    expect(batches).toHaveLength(1);
  });
});

describe('applyOverrides', () => {
  const available = new Map<string, SuggestedBatch[]>([
    ['milk', [batch('B1', 50, '2026-08-05', 40), batch('B2', 50, '2026-08-20', 42)]],
  ]);
  const tracks = new Map<string, boolean>([['milk', true]]);

  it('replaces the FEFO allocation for the overridden item', () => {
    const base = [
      allocation({ batches: [{ batchNo: 'B1', qty: 100, unitCost: 40, expiryDate: '2026-08-05' }] }),
    ];
    const result = applyOverrides(
      base,
      [{ inputItemId: 'milk', batchNo: 'B2', qty: 90 }],
      available,
      tracks,
    );
    expect(result[0]!.batches).toEqual([
      { batchNo: 'B2', qty: 90, unitCost: 42, expiryDate: '2026-08-20' },
    ]);
  });

  it('re-reads unit cost from stock — a technician picks batches, not prices', () => {
    const result = applyOverrides(
      [allocation()],
      [{ inputItemId: 'milk', batchNo: 'B2', qty: 10 }],
      available,
      tracks,
    );
    expect(result[0]!.batches[0]!.unitCost).toBe(42);
  });

  it('leaves untouched items on their FEFO allocation', () => {
    const base = [
      allocation(),
      allocation({ inputItemId: 'culture', inputItemName: 'Culture', bomLineId: 'line-2' }),
    ];
    const result = applyOverrides(
      base,
      [{ inputItemId: 'milk', batchNo: 'B1', qty: 5 }],
      available,
      tracks,
    );
    expect(result[1]).toBe(base[1]);
  });

  it('accepts several batches for one item', () => {
    const result = applyOverrides(
      [allocation()],
      [
        { inputItemId: 'milk', batchNo: 'B1', qty: 40 },
        { inputItemId: 'milk', batchNo: 'B2', qty: 60 },
      ],
      available,
      tracks,
    );
    expect(result[0]!.batches.map((b) => b.qty)).toEqual([40, 60]);
  });
});

describe('findShortages', () => {
  it('reports the gap when allocation cannot meet the requirement', () => {
    const short = findShortages([
      allocation({
        requiredQty: 100,
        availableQty: 20,
        batches: [{ batchNo: 'B1', qty: 20, unitCost: 40, expiryDate: null }],
      }),
    ]);
    expect(short).toHaveLength(1);
    expect(short[0]!.shortQty).toBe(80);
    expect(short[0]!.inputItemName).toBe('A2 Milk');
  });

  it('is silent when the run is fully covered', () => {
    expect(
      findShortages([
        allocation({ batches: [{ batchNo: 'B1', qty: 100, unitCost: 40, expiryDate: null }] }),
      ]),
    ).toEqual([]);
  });

  it('skips optional lines that are entirely absent', () => {
    expect(
      findShortages([allocation({ isOptional: true, availableQty: 0, batches: [] })]),
    ).toEqual([]);
  });

  it('still reports a partially-filled optional line', () => {
    // Half a flavouring is a real problem — it changes the product.
    const short = findShortages([
      allocation({
        isOptional: true,
        requiredQty: 10,
        availableQty: 4,
        batches: [{ batchNo: 'B1', qty: 4, unitCost: 40, expiryDate: null }],
      }),
    ]);
    expect(short[0]!.shortQty).toBe(6);
  });

  it('reports every short input, not just the first', () => {
    const short = findShortages([
      allocation({ availableQty: 0, batches: [] }),
      allocation({ inputItemId: 'culture', inputItemName: 'Culture', availableQty: 0, batches: [] }),
    ]);
    expect(short.map((s) => s.inputItemName)).toEqual(['A2 Milk', 'Culture']);
  });
});

describe('findOverdrawnBatches', () => {
  const available = new Map<string, SuggestedBatch[]>([['milk', [batch('B1', 30)]]]);

  it('catches an override that draws more than the batch holds', () => {
    const over = findOverdrawnBatches(
      [allocation({ batches: [{ batchNo: 'B1', qty: 50, unitCost: 40, expiryDate: null }] })],
      available,
    );
    expect(over).toHaveLength(1);
    expect(over[0]!.shortQty).toBe(20);
    expect(over[0]!.inputItemName).toContain('B1');
  });

  it('sums repeated draws on the same batch before comparing', () => {
    const over = findOverdrawnBatches(
      [
        allocation({
          batches: [
            { batchNo: 'B1', qty: 20, unitCost: 40, expiryDate: null },
            { batchNo: 'B1', qty: 20, unitCost: 40, expiryDate: null },
          ],
        }),
      ],
      available,
    );
    expect(over[0]!.shortQty).toBe(10);
  });

  it('passes a draw that fits', () => {
    expect(
      findOverdrawnBatches(
        [allocation({ batches: [{ batchNo: 'B1', qty: 30, unitCost: 40, expiryDate: null }] })],
        available,
      ),
    ).toEqual([]);
  });

  it('catches a draw against a batch that does not exist at all', () => {
    const over = findOverdrawnBatches(
      [allocation({ batches: [{ batchNo: 'GHOST', qty: 5, unitCost: 40, expiryDate: null }] })],
      available,
    );
    expect(over[0]!.availableQty).toBe(0);
  });
});
