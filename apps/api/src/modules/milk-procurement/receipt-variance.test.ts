import { describe, it, expect } from 'vitest';
import {
  tally, bySource, byDay, classify, type ReceiptVarianceLine,
} from './receipt-variance-summary';

const line = (
  varianceQty: number, varianceValue: number | null,
  opts: { from?: string; date?: string; dispatched?: number } = {},
): ReceiptVarianceLine => {
  const dispatchedQty = opts.dispatched ?? 600;
  const variancePct = (varianceQty / dispatchedQty) * 100;
  return {
    consignmentId: 'c', consignmentNo: 'CON/1', date: opts.date ?? '2026-09-29', shift: null,
    stage: 'pp', milkType: 'cow', fromNodeId: opts.from ?? 'indus', fromNodeName: opts.from ?? 'indus',
    toNodeId: 't', toNodeName: 'PP', dispatchedQty, measuredQty: dispatchedQty + varianceQty,
    varianceQty, variancePct, unitCost: varianceValue == null ? null : 37.33, varianceValue,
    ...classify(variancePct),
  };
};

describe('tally', () => {
  it('keeps losses and gains apart so a gain never hides a loss', () => {
    const t = tally([line(-10, -373.3), line(5, 186.65)]);
    expect(t.shortQty).toBe(10);
    expect(t.shortValue).toBe(373.3);
    expect(t.gainQty).toBe(5);
    expect(t.gainValue).toBe(186.65);
    expect(t.netQty).toBe(-5);
    expect(t.netValue).toBe(-186.65);
  });

  it('counts unpriced litres separately instead of as a free loss', () => {
    const t = tally([line(-10, null), line(-4, -149.32)]);
    expect(t.shortValue).toBe(149.32);
    expect(t.unpricedQty).toBe(10);
  });

  it('treats a load inside ±0.5% as matched for the pattern, but keeps its litres', () => {
    // -2 of 600 = -0.33%: noise, not a short load — but still 2 L gone.
    const t = tally([line(-2, -74.66), line(-12, -447.96), line(0, 0)]);
    expect(t.matchedLoads).toBe(2);
    expect(t.shortLoads).toBe(1);
    expect(t.shortQty).toBe(14);
  });

  it('expresses net as a share of dispatched', () => {
    const t = tally([line(-6, -224, { dispatched: 300 }), line(0, 0, { dispatched: 300 })]);
    expect(t.netPct).toBe(-1);
  });
});

describe('bySource', () => {
  it('ranks the source losing the most rupees first', () => {
    const ranked = bySource([
      line(-3, -112, { from: 'hoskote' }),
      line(-10, -373, { from: 'indus' }),
      line(4, 150, { from: 'kolar' }),
    ]);
    expect(ranked.map((s) => s.fromNodeId)).toEqual(['indus', 'hoskote', 'kolar']);
  });
});

describe('byDay', () => {
  it('rolls loads up per day, newest first', () => {
    const days = byDay([
      line(-10, -373, { date: '2026-09-28' }),
      line(-5, -186, { date: '2026-09-29' }),
      line(-3, -112, { date: '2026-09-28' }),
    ]);
    expect(days.map((d) => d.date)).toEqual(['2026-09-29', '2026-09-28']);
    expect(days[1]!.loads).toBe(2);
    expect(days[1]!.shortQty).toBe(13);
  });
});
