import { describe, it, expect } from 'vitest';
import {
  latestBillPerNode, blendedBillRate, type BilledLeg,
} from './raw-milk-cost';

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
