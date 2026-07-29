import { describe, it, expect } from 'vitest';
import { perPourBonus, shouldGateOnSnf, tenantWideFallback } from './rate-chart.service';
import type { MetricBands } from './quality-band.service';

type Rule = Parameters<typeof perPourBonus>[0][number];

const rule = (r: Partial<Rule>): Rule => ({
  id: 'r', tenantId: 't', rateChartId: 'c',
  ruleType: 'quality_bonus', grade: null, minQty: null, maxQty: null,
  fatMin: null, bonusPerLitre: '0',
  ...r,
} as Rule);

// Vrindavan cow_a1 effective bands: SNF good 8.50 / watch 8.00.
const COW: MetricBands = {
  fat: { goodMin: 4.0, watchMin: 3.5 },
  snf: { goodMin: 8.5, watchMin: 8.0 },
};

describe('perPourBonus', () => {
  it('adds the matching grade bonus', () => {
    const rules = [rule({ ruleType: 'quality_bonus', grade: 'a', bonusPerLitre: '4' })];
    expect(perPourBonus(rules, 'a')).toBe(4);
    expect(perPourBonus(rules, 'b')).toBe(0);
  });

  it('adds a volume slab only inside its range', () => {
    const rules = [rule({ ruleType: 'volume_slab', minQty: '100', maxQty: '500', bonusPerLitre: '1' })];
    expect(perPourBonus(rules, null, 250)).toBe(1);
    expect(perPourBonus(rules, null, 600)).toBe(0);
    expect(perPourBonus(rules, null)).toBe(0);
  });

  // The one that would quietly double the bonus bill: the quarterly tier is
  // settled as a separate lump sum at quarter close, so it must never land
  // inside a pour's line_amount.
  it('never pays a quarterly FAT tier at capture', () => {
    const rules = [
      rule({ ruleType: 'quarterly_fat_bonus', fatMin: '4.40', bonusPerLitre: '7.20' }),
      rule({ ruleType: 'quarterly_fat_bonus', fatMin: '3.70', bonusPerLitre: '6.00' }),
    ];
    expect(perPourBonus(rules, 'a', 1000)).toBe(0);
    expect(perPourBonus(rules, null)).toBe(0);
  });

  it('still pays per-pour rules on a chart that also carries quarterly tiers', () => {
    const rules = [
      rule({ ruleType: 'quarterly_fat_bonus', fatMin: '3.70', bonusPerLitre: '6.00' }),
      rule({ ruleType: 'quality_bonus', grade: 'a', bonusPerLitre: '2' }),
    ];
    expect(perPourBonus(rules, 'a')).toBe(2);
  });
});

describe('tenantWideFallback', () => {
  // Newest-effective first, as findActiveChart orders them.
  const flat45 = { id: 'flat45', scopeNodeId: null };      // one farmer's deal
  const matrix = { id: 'matrix', scopeNodeId: null };      // the real tenant chart
  const nodeChart = { id: 'node', scopeNodeId: 'n1' };

  it('takes the newest tenant-wide chart when nothing is an override', () => {
    expect(tenantWideFallback([flat45, matrix], new Set())).toBe(flat45);
  });

  // The regression: repointing the tenant slot at an Aug-effective chart made
  // July dates fall through to here, and a single farmer's flat ₹45 override
  // outranked the ₹33 matrix every back-dated 24–31 Jul pour belonged on.
  it('skips a chart that exists only as a farmer/node override', () => {
    expect(tenantWideFallback([flat45, matrix], new Set(['flat45']))).toBe(matrix);
  });

  it('ignores node-scoped charts and returns null when nothing qualifies', () => {
    expect(tenantWideFallback([nodeChart], new Set())).toBeNull();
    expect(tenantWideFallback([flat45], new Set(['flat45']))).toBeNull();
    expect(tenantWideFallback([], new Set())).toBeNull();
  });
});

describe('shouldGateOnSnf', () => {
  const base = { pricingMode: 'matrix' as const, fat: 4.5, snf: 7.4, snfGateMin: '7.20' };

  it('does not gate at or above the chart floor', () => {
    expect(shouldGateOnSnf(base)).toBe(false);
    expect(shouldGateOnSnf({ ...base, snf: 7.2 })).toBe(false);
  });

  // Watering rich milk dilutes solids too — that is the tell.
  it('gates below the floor however good the FAT looks', () => {
    expect(shouldGateOnSnf({ ...base, snf: 7.19 })).toBe(true);
    expect(shouldGateOnSnf({ ...base, fat: 5.0, snf: 6.5 })).toBe(true);
  });

  // Opt-in per chart. Buffalo, A2 and every pre-existing chart carry no floor
  // and must price exactly as they did before the 2026-08 cutover.
  it('is off entirely when the chart sets no floor', () => {
    expect(shouldGateOnSnf({ ...base, snf: 5.0, snfGateMin: null })).toBe(false);
    expect(shouldGateOnSnf({ ...base, snf: 5.0, snfGateMin: undefined })).toBe(false);
  });

  // The band that colour-codes quality (SNF watch 8.00) would gate a quarter of
  // Vrindavan's litres, including a 4.38-FAT farmer whose SNF is naturally low.
  // The payment floor is a separate, far more conservative number.
  it('does not fire at the quality watch band', () => {
    expect(shouldGateOnSnf({ ...base, snf: 7.76 })).toBe(false);
    expect(COW.snf!.watchMin).toBe(8.0);
  });

  it('ignores flat and CLR charts, and readings it cannot judge', () => {
    expect(shouldGateOnSnf({ ...base, snf: 6.0, pricingMode: 'flat' })).toBe(false);
    expect(shouldGateOnSnf({ ...base, snf: 6.0, pricingMode: 'clr' })).toBe(false);
    expect(shouldGateOnSnf({ ...base, snf: null })).toBe(false);
    expect(shouldGateOnSnf({ ...base, fat: null, snf: 6.0 })).toBe(false);
  });
});
