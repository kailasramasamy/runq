import { describe, it, expect } from 'vitest';
import {
  latestBillPerNode, blendedBillRate, varianceValuation, receiptRate, type BilledLeg,
} from './raw-milk-cost';
import type { DrGross } from './report.service';

const bill = (
  nodeId: string, periodEnd: string, milkCost: number | string, qtyLitres: number | string,
): BilledLeg => ({ nodeId, periodEnd, milkCost, qtyLitres });

describe('latestBillPerNode', () => {
  it('keeps only the newest bill for each centre', () => {
    const picked = latestBillPerNode([
      bill('gollahalli', '2026-07-31', 50_000, 1400),
      bill('gollahalli', '2026-08-15', 55_934.15, 1487.5),
      bill('thoksandra', '2026-08-15', 14_548.4, 496.8),
    ]);
    expect(picked).toHaveLength(2);
    expect(picked.find((b) => b.nodeId === 'gollahalli')?.periodEnd).toBe('2026-08-15');
  });

  it('is empty when nothing has been billed', () => {
    expect(latestBillPerNode([])).toEqual([]);
  });
});

describe('blendedBillRate', () => {
  it('weights by litres, not by centre', () => {
    // Averaging the two rates would say 40.03 and over-value every tanker.
    const rate = blendedBillRate([
      bill('gollahalli', '2026-08-15', 55_934.15, 1487.5),   // 37.60/L
      bill('hanumandoddi', '2026-08-15', 6_597.05, 155.4),   // 42.45/L
    ]);
    expect(rate).toBeCloseTo(38.06, 2);
  });

  it('reads pg decimal strings', () => {
    expect(blendedBillRate([bill('x', '2026-08-15', '48211.20', '1339.200')])).toBe(36);
  });

  it('returns 0 rather than dividing by nothing', () => {
    expect(blendedBillRate([])).toBe(0);
    expect(blendedBillRate([bill('x', '2026-08-15', 100, 0)])).toBe(0);
  });
});

describe('varianceValuation', () => {
  it('values a short delivery as a negative amount at the leg rate', () => {
    expect(varianceValuation(-10, 37.33)).toEqual({ varianceUnitCost: '37.33', varianceValue: '-373.3' });
  });

  it('leaves an unpriced leg null rather than a ₹0 loss', () => {
    expect(varianceValuation(-10, 0)).toEqual({ varianceUnitCost: null, varianceValue: null });
  });
});

describe('receiptRate', () => {
  const g = (
    toNodeId: string, milkType: string, qty: number, rate: number | null,
  ): DrGross => ({
    fromNodeId: 'vmcc', toNodeId, milkType, date: '2026-09-20', shift: 'am',
    qty, gross: rate == null ? 0 : qty * rate, fat: 4, snf: 8.5, water: null, ratePerLitre: rate,
  });

  it('weights each VMCC chart rate by the litres it priced', () => {
    expect(receiptRate([g('indus', 'cow_a2', 300, 40), g('indus', 'cow_a2', 100, 44)], 'indus', 'cow_a2'))
      .toBe(41);
  });

  it('leaves out unpriced groups, other milk types and other CCs', () => {
    expect(receiptRate([
      g('indus', 'cow_a2', 200, 40), g('indus', 'cow_a2', 500, null),
      g('indus', 'buffalo', 100, 60), g('other', 'cow_a2', 100, 50),
    ], 'indus', 'cow_a2')).toBe(40);
  });

  it('is zero when no receipt priced', () => {
    expect(receiptRate([g('indus', 'cow_a2', 200, null)], 'indus', 'cow_a2')).toBe(0);
  });
});
