import { describe, it, expect } from 'vitest';
import {
  allocateFefo,
  applyOverrides,
  suggestDraw,
  buildAllocations,
  buildPool,
  computeRequiredQty,
  findOverdrawnBatches,
  findShortages,
} from './production-backflush';
import type { BomInputLine } from './production-backflush';
import type { ProductionAllocation, SuggestedBatch } from '@runq/types';

// A dairy BOM: 100 L of curd from 95 L milk + 2 kg culture, 2% scrap on milk.
const batch = (
  batchNo: string,
  availableQty: number,
  expiryDate: string | null = null,
  unitCost = 40,
  lastMovementAt: string | null = null,
): SuggestedBatch => ({ batchNo, availableQty, unitCost, expiryDate, lastMovementAt });

/** One item's worth of stock, as a line draws from it. */
const source = (
  itemId: string,
  available: SuggestedBatch[],
  itemName = itemId,
  tracksBatches = true,
) => ({ itemId, itemName, tracksBatches, available });

const drawn = (
  batchNo: string | null,
  qty: number,
  unitCost = 40,
  expiryDate: string | null = null,
  itemId = 'milk',
  itemName = 'A2 Milk',
) => ({ itemId, itemName, batchNo, qty, unitCost, expiryDate });

const allocation = (over: Partial<ProductionAllocation> = {}): ProductionAllocation => ({
  bomLineId: 'line-1',
  inputItemId: 'milk',
  inputItemName: 'A2 Milk',
  uom: 'L',
  requiredQty: 100,
  availableQty: 100,
  isOptional: false,
  substitutes: [],
  batches: [],
  pool: [],
  suggestion: [],
  ...over,
});

const line = (over: Partial<BomInputLine> = {}): BomInputLine => ({
  bomLineId: 'line-1',
  inputItemId: 'a2',
  inputItemName: 'A2 Milk (Raw)',
  qtyPerOutput: 7,
  inputUom: 'L',
  scrapPct: 0,
  isOptional: false,
  tracksBatches: true,
  substitutes: [],
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
    const { batches, allocated } = allocateFefo(30, [
      source('milk', [batch('B1', 50, '2026-08-05'), batch('B2', 50, '2026-08-20')]),
    ]);
    expect(batches).toEqual([drawn('B1', 30, 40, '2026-08-05', 'milk', 'milk')]);
    expect(allocated).toBe(30);
  });

  it('splits across batches when the first cannot cover the run', () => {
    const { batches, allocated } = allocateFefo(80, [
      source('milk', [batch('B1', 50, '2026-08-05'), batch('B2', 50, '2026-08-20')]),
    ]);
    expect(batches.map((b) => [b.batchNo, b.qty])).toEqual([
      ['B1', 50],
      ['B2', 30],
    ]);
    expect(allocated).toBe(80);
  });

  it('allocates only what exists when stock is short', () => {
    const { batches, allocated } = allocateFefo(100, [source('milk', [batch('B1', 20)])]);
    expect(batches).toHaveLength(1);
    expect(allocated).toBe(20);
  });

  it('allocates nothing when there is no stock at all', () => {
    const { batches, allocated } = allocateFefo(100, [source('milk', [])]);
    expect(batches).toEqual([]);
    expect(allocated).toBe(0);
  });

  it('nulls the batch no for items that do not track batches', () => {
    // stock_on_hand keys these as '', but the ledger rejects a batch_no here.
    const { batches } = allocateFefo(10, [source('milk', [batch('', 50)], 'milk', false)]);
    expect(batches[0]!.batchNo).toBeNull();
  });

  it('stops once the requirement is met, leaving later batches untouched', () => {
    const { batches } = allocateFefo(50, [
      source('milk', [batch('B1', 50), batch('B2', 50), batch('B3', 50)]),
    ]);
    expect(batches).toHaveLength(1);
  });

  it('draws FEFO across sources, not source by source', () => {
    const { batches } = allocateFefo(100, [
      source('a2', [batch('A2-1', 60, '2026-09-02')], 'A2 Milk'),
      source('buffalo', [batch('BUF-1', 60, '2026-09-01')], 'Buffalo Milk'),
    ]);
    // The buffalo batch expires first, so it goes in first.
    expect(batches.map((b) => [b.itemId, b.qty])).toEqual([
      ['buffalo', 60],
      ['a2', 40],
    ]);
  });

  it('falls back to batch age when nothing carries an expiry — raw milk', () => {
    const { batches } = allocateFefo(50, [
      source('a2', [batch('A2-1', 40, null, 40, '2026-08-25T04:00:00.000Z')]),
      source('a1', [batch('A1-1', 40, null, 38, '2026-08-24T17:00:00.000Z')]),
    ]);
    // Yesterday's evening milk before this morning's.
    expect(batches.map((b) => [b.itemId, b.qty])).toEqual([
      ['a1', 40],
      ['a2', 10],
    ]);
  });

  it('tags every batch with the item it came from', () => {
    const { batches } = allocateFefo(80, [
      source('a2', [batch('A2-1', 50)], 'A2 Milk (Raw)'),
      source('a1', [batch('A1-1', 50)], 'A1 Milk (Raw)'),
    ]);
    expect(batches.map((b) => b.itemName)).toEqual(['A2 Milk (Raw)', 'A1 Milk (Raw)']);
  });
});

describe('buildAllocations — substitutes on a line', () => {
  // 7 L of raw milk per kg of paneer: A2 by name, A1 or buffalo if that is
  // what the tank holds. One requirement, stated once.
  const paneer = [
    line({
      substitutes: [
        { itemId: 'a1', itemName: 'A1 Milk (Raw)', priority: 0 },
        { itemId: 'buffalo', itemName: 'Buffalo Milk (Raw)', priority: 1 },
      ],
    }),
  ];

  it('asks for the line qty once, however many substitutes it lists', () => {
    // 27 kg of paneer at 7 L/kg = 189 L, not 189 × 3.
    const allocations = buildAllocations(
      paneer,
      27,
      new Map([
        ['a2', [batch('A2-1', 100)]],
        ['a1', [batch('A1-1', 100)]],
        ['buffalo', [batch('BUF-1', 100)]],
      ]),
    );

    expect(allocations).toHaveLength(1);
    expect(allocations[0]!.requiredQty).toBe(189);
    expect(allocations[0]!.availableQty).toBe(300);
    expect(findShortages(allocations)).toEqual([]);
  });

  it('covers the line from a substitute when its own item is empty', () => {
    const allocations = buildAllocations(
      paneer,
      10,
      new Map([
        ['a2', []],
        ['a1', [batch('A1-1', 100)]],
        ['buffalo', []],
      ]),
    );

    expect(allocations[0]!.batches).toEqual([
      { itemId: 'a1', itemName: 'A1 Milk (Raw)', batchNo: 'A1-1', qty: 70, unitCost: 40, expiryDate: null },
    ]);
    expect(findShortages(allocations)).toEqual([]);
  });

  it('is short only when the item and its substitutes together fall behind', () => {
    const short = findShortages(
      buildAllocations(
        paneer,
        10,
        new Map([
          ['a2', [batch('A2-1', 30)]],
          ['a1', []],
          ['buffalo', [batch('BUF-1', 20)]],
        ]),
      ),
    );

    expect(short).toHaveLength(1);
    expect(short[0]!.shortQty).toBe(20);
    expect(short[0]!.availableQty).toBe(50);
    expect(short[0]!.inputItemName).toBe('A2 Milk (Raw) or 2 alternates');
  });

  it('ignores a substitute naming the line’s own item', () => {
    // Otherwise the same stock queues twice and the line draws milk twice over.
    const allocations = buildAllocations(
      [line({ substitutes: [{ itemId: 'a2', itemName: 'A2 Milk (Raw)', priority: 0 }] })],
      10,
      new Map([['a2', [batch('A2-1', 40)]]]),
    );

    expect(allocations[0]!.availableQty).toBe(40);
    expect(findShortages(allocations)[0]!.shortQty).toBe(30);
  });

  it('leaves a line without substitutes judged on its own item', () => {
    const short = findShortages(
      buildAllocations(
        [...paneer, line({ bomLineId: 'line-2', inputItemId: 'culture', inputItemName: 'Culture', qtyPerOutput: 0.02 })],
        10,
        new Map([['a2', [batch('A2-1', 100)]]]),
      ),
    );

    expect(short.map((s) => s.inputItemName)).toEqual(['Culture']);
  });
});

describe('applyOverrides', () => {
  const available = new Map<string, SuggestedBatch[]>([
    ['milk', [batch('B1', 50, '2026-08-05', 40), batch('B2', 50, '2026-08-20', 42)]],
    ['buffalo', [batch('BUF-1', 50, null, 38)]],
  ]);
  const tracks = new Map<string, boolean>([
    ['milk', true],
    ['buffalo', true],
  ]);

  it('replaces the FEFO allocation for the overridden item', () => {
    const base = [allocation({ batches: [drawn('B1', 100, 40, '2026-08-05')] })];
    const result = applyOverrides(
      base,
      [{ inputItemId: 'milk', batchNo: 'B2', qty: 90 }],
      available,
      tracks,
    );
    expect(result[0]!.batches).toEqual([drawn('B2', 90, 42, '2026-08-20')]);
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

  it('replaces the whole line, not just the overridden item', () => {
    // The screen sends what the operator typed for the entire line. Anything
    // it leaves out is not drawn — a server-picked batch surviving next to
    // typed quantities would consume more than the screen ever showed.
    const base = [
      allocation({
        substitutes: [{ itemId: 'buffalo', itemName: 'Buffalo Milk' }],
        batches: [
          drawn('B1', 40),
          drawn('BUF-1', 60, 38, null, 'buffalo', 'Buffalo Milk'),
        ],
      }),
    ];
    const result = applyOverrides(
      base,
      [{ inputItemId: 'buffalo', batchNo: 'BUF-1', qty: 25 }],
      available,
      tracks,
    );

    expect(result[0]!.batches).toEqual([
      drawn('BUF-1', 25, 38, null, 'buffalo', 'Buffalo Milk'),
    ]);
  });

  it('keeps a line the overrides never mention', () => {
    const base = [
      allocation({ bomLineId: 'line-1', inputItemId: 'milk', batches: [drawn('B1', 40)] }),
      allocation({
        bomLineId: 'line-2',
        inputItemId: 'culture',
        inputItemName: 'Culture',
        batches: [drawn('C1', 2, 500, null, 'culture', 'Culture')],
      }),
    ];
    const result = applyOverrides(
      base,
      [{ inputItemId: 'milk', batchNo: 'B1', qty: 35 }],
      available,
      tracks,
    );

    // The override re-reads the batch's expiry from what is on hand.
    expect(result[0]!.batches).toEqual([drawn('B1', 35, 40, '2026-08-05')]);
    expect(result[1]!.batches).toEqual([drawn('C1', 2, 500, null, 'culture', 'Culture')]);
  });
});

describe('findShortages', () => {
  it('reports the gap when allocation cannot meet the requirement', () => {
    const short = findShortages([
      allocation({ requiredQty: 100, availableQty: 20, batches: [drawn('B1', 20)] }),
    ]);
    expect(short).toHaveLength(1);
    expect(short[0]!.shortQty).toBe(80);
    expect(short[0]!.inputItemName).toBe('A2 Milk');
  });

  it('is silent when the run is fully covered', () => {
    expect(findShortages([allocation({ batches: [drawn('B1', 100)] })])).toEqual([]);
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
        batches: [drawn('B1', 4)],
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
  const available = new Map<string, SuggestedBatch[]>([
    ['milk', [batch('B1', 30)]],
    ['buffalo', [batch('BUF-1', 10)]],
  ]);

  it('catches an override that draws more than the batch holds', () => {
    const over = findOverdrawnBatches([allocation({ batches: [drawn('B1', 50)] })], available);
    expect(over).toHaveLength(1);
    expect(over[0]!.shortQty).toBe(20);
    expect(over[0]!.inputItemName).toContain('B1');
  });

  it('sums repeated draws on the same batch before comparing', () => {
    const over = findOverdrawnBatches(
      [allocation({ batches: [drawn('B1', 20), drawn('B1', 20)] })],
      available,
    );
    expect(over[0]!.shortQty).toBe(10);
  });

  it('passes a draw that fits', () => {
    expect(
      findOverdrawnBatches([allocation({ batches: [drawn('B1', 30)] })], available),
    ).toEqual([]);
  });

  it('catches a draw against a batch that does not exist at all', () => {
    const over = findOverdrawnBatches(
      [allocation({ batches: [drawn('GHOST', 5)] })],
      available,
    );
    expect(over[0]!.availableQty).toBe(0);
  });

  it('judges each item on its own stock, not the line item’s', () => {
    // Same batch qty, two items: only the buffalo draw is overdrawn.
    const over = findOverdrawnBatches(
      [
        allocation({
          substitutes: [{ itemId: 'buffalo', itemName: 'Buffalo Milk' }],
          batches: [
            drawn('B1', 25),
            drawn('BUF-1', 25, 38, null, 'buffalo', 'Buffalo Milk'),
          ],
        }),
      ],
      available,
    );

    expect(over).toHaveLength(1);
    expect(over[0]!.inputItemId).toBe('buffalo');
    expect(over[0]!.shortQty).toBe(15);
  });
});

describe('buildPool', () => {
  // The paneer floor's actual pool: cut-open pouches and yesterday's odds and
  // ends, then the tanker that landed at noon. 70 L makes one batch.
  const paneerLine = line({
    inputItemId: 'a2',
    qtyPerOutput: 70,
    substitutes: [
      { itemId: 'a2-reclaimed', itemName: 'A2 Milk (Reclaimed)', priority: 1 },
      { itemId: 'a1', itemName: 'A1 Milk (Raw)', priority: 2 },
      { itemId: 'buffalo', itemName: 'Buffalo Milk (Raw)', priority: 3 },
    ],
  });

  const pool = new Map<string, SuggestedBatch[]>([
    // Fresh: arrived today, longest expiry — last in the queue despite being
    // the biggest pile.
    ['a2', [batch('CON/01596', 600, '2026-08-29', 40, '2026-08-26T12:00:00Z')]],
    ['a2-reclaimed', [batch('RCL/0042', 75, '2026-08-27', 38, '2026-08-26T09:00:00Z')]],
    ['a1', [batch('CON/01481', 5, '2026-08-28', 39, '2026-08-25T18:00:00Z')]],
    ['buffalo', [batch('CON/01482', 5, '2026-08-28', 45, '2026-08-25T18:00:00Z')]],
  ]);

  it('queues every pooled batch in the order a run would draw it', () => {
    const [pooled] = buildPool([paneerLine], pool);

    expect(pooled!.batches.map((b) => b.batchNo)).toEqual([
      'RCL/0042',   // expires first
      'CON/01481',  // next expiry, older movement than the buffalo tie
      'CON/01482',
      'CON/01596',  // fresh, longest-dated — untouched until the rest is gone
    ]);
  });

  it('totals the pool across the line item and its stand-ins', () => {
    const [pooled] = buildPool([paneerLine], pool);
    expect(pooled!.totalQty).toBe(685);
  });

  it('reports whole batches covered, not a fraction', () => {
    const [pooled] = buildPool([paneerLine], pool);
    expect(pooled!.qtyPerBatch).toBe(70);
    expect(pooled!.batchesCovered).toBe(9); // 685 / 70 = 9.78 → 9
  });

  it('counts the odds and ends alone as one batch, not two', () => {
    const oddsOnly = new Map(pool);
    oddsOnly.delete('a2');
    const [pooled] = buildPool([paneerLine], oddsOnly);

    // 75 + 5 + 5 = 85 L: one full batch, with 15 L that needs topping up from
    // fresh stock before a second can run.
    expect(pooled!.totalQty).toBe(85);
    expect(pooled!.batchesCovered).toBe(1);
  });

  it('matches the order allocateFefo actually draws in', () => {
    const [pooled] = buildPool([paneerLine], pool);
    // 90 L so the draw spans several batches — a single-batch draw would make
    // the prefix check pass without proving anything.
    const { batches } = allocateFefo(90, [
      source('a2', pool.get('a2')!, 'A2 Milk (Raw)'),
      source('a2-reclaimed', pool.get('a2-reclaimed')!, 'A2 Milk (Reclaimed)'),
      source('a1', pool.get('a1')!, 'A1 Milk (Raw)'),
      source('buffalo', pool.get('buffalo')!, 'Buffalo Milk (Raw)'),
    ]);

    // The pool view is only honest if it predicts the draw — same queue, so
    // the draw is a prefix of what the pool lists.
    expect(batches.map((b) => b.batchNo)).toEqual(
      pooled!.batches.slice(0, batches.length).map((b) => b.batchNo),
    );
  });

  it('carries an empty pool without inventing a batch', () => {
    const [pooled] = buildPool([paneerLine], new Map());
    expect(pooled!.batches).toEqual([]);
    expect(pooled!.totalQty).toBe(0);
    expect(pooled!.batchesCovered).toBe(0);
  });
});

describe('suggestDraw', () => {
  // The paneer floor's pool, oldest first: cut-open pouches, yesterday's odds
  // and ends, then the tanker that landed at noon. A batch takes 70 L.
  const reclaimed = source('a2-rec', [batch('RCL/0042', 75, '2026-08-27', 38)], 'A2 Reclaimed');
  const prevDay = source('a2', [batch('CON/01480', 20, '2026-08-28', 40, '2026-08-25T06:00:00Z')], 'A2 Raw');
  const buffalo = source('buf', [batch('CON/01482', 5, '2026-08-28', 45, '2026-08-25T18:00:00Z')], 'Buffalo Raw');
  const a1 = source('a1', [batch('CON/01481', 5, '2026-08-28', 39, '2026-08-25T18:00:00Z')], 'A1 Raw');
  const fresh = source('a2f', [batch('CON/01596', 600, '2026-08-30', 40, '2026-08-26T12:00:00Z')], 'A2 Fresh');
  const pool = [reclaimed, prevDay, buffalo, a1, fresh];

  it('drains the small cans whole and takes the shortfall from one batch', () => {
    const drawn = suggestDraw(70, pool);

    // 20 + 5 + 5 fit inside what is needed, so they go in whole. The 40 L
    // balance comes from the reclaimed batch — the only one set aside that
    // expires soonest — leaving ONE remnant rather than four.
    expect(drawn.map((d) => [d.batchNo, d.qty])).toEqual([
      ['CON/01480', 20],
      ['CON/01482', 5],
      ['CON/01481', 5],
      ['RCL/0042', 40],
    ]);
    expect(drawn.reduce((s, d) => s + d.qty, 0)).toBe(70);
  });

  it('leaves the fresh tanker alone while odds and ends can cover the draw', () => {
    const drawn = suggestDraw(70, pool);
    expect(drawn.some((d) => d.batchNo === 'CON/01596')).toBe(false);
  });

  it('tops up from fresh once the old stock is gone', () => {
    // Second batch of the day: 35 L of reclaimed left, then the tanker.
    const leftover = source('a2-rec', [batch('RCL/0042', 35, '2026-08-27', 38)], 'A2 Reclaimed');
    const drawn = suggestDraw(70, [leftover, fresh]);

    expect(drawn.map((d) => [d.batchNo, d.qty])).toEqual([
      ['RCL/0042', 35],   // drained
      ['CON/01596', 35],  // topped up
    ]);
  });

  it('never tips in a can that does not fit — no over-draw', () => {
    const drawn = suggestDraw(70, [reclaimed]);
    expect(drawn).toEqual([
      expect.objectContaining({ batchNo: 'RCL/0042', qty: 70 }),
    ]);
  });

  it('beats plain FEFO on remnants left behind', () => {
    const fefo = allocateFefo(70, pool).batches;
    // FEFO opens the reclaimed batch first and leaves 5 L of it stranded,
    // on top of the three part-cans it never touched.
    expect(fefo.map((d) => d.batchNo)).toEqual(['RCL/0042']);

    const suggested = suggestDraw(70, pool);
    const partUsed = suggested.filter((d) => {
      const avail = pool.flatMap((s) => s.available).find((b) => b.batchNo === d.batchNo);
      return avail && d.qty < avail.availableQty;
    });
    expect(partUsed).toHaveLength(1); // exactly one remnant created
  });

  it('returns what it can when the pool cannot cover the draw', () => {
    const drawn = suggestDraw(70, [buffalo, a1]);
    expect(drawn.reduce((s, d) => s + d.qty, 0)).toBe(10);
  });

  it('is empty when nothing is on hand', () => {
    expect(suggestDraw(70, [])).toEqual([]);
  });
});
