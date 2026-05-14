import { describe, it, expect } from 'vitest';
import { calcPf, calcEsi, calcPtKarnataka, calcMonthlyTdsNewRegime } from './statutory';

describe('statutory: PF', () => {
  it('caps at PF wage ceiling (15K basic)', () => {
    const r = calcPf(50000);
    expect(r.employee).toBe(1800); // 12% of 15000
    expect(r.employer).toBe(1800);
  });
  it('uses actual basic below ceiling', () => {
    const r = calcPf(10000);
    expect(r.employee).toBe(1200);
  });
});

describe('statutory: ESI', () => {
  it('applies when wages ≤ 21K', () => {
    const r = calcEsi(18000);
    expect(r.employee).toBe(135);   // 0.75%
    expect(r.employer).toBe(585);   // 3.25%
  });
  it('exempt above 21K', () => {
    const r = calcEsi(22000);
    expect(r.employee).toBe(0);
    expect(r.employer).toBe(0);
  });
});

describe('statutory: PT Karnataka', () => {
  it('₹200 for gross > 25K', () => {
    expect(calcPtKarnataka(30000)).toBe(200);
  });
  it('nil below threshold', () => {
    expect(calcPtKarnataka(20000)).toBe(0);
  });
});

describe('statutory: TDS new regime', () => {
  it('nil for ₹3L income (rebate)', () => {
    expect(calcMonthlyTdsNewRegime(25000)).toBe(0); // 3L annual
  });
  it('nil at ₹7L taxable after standard deduction (87A)', () => {
    // 7L + 75K SD = 7.75L gross → ≈ 64583/mo. Taxable = 7L → 87A wipes it.
    expect(calcMonthlyTdsNewRegime(64583)).toBe(0);
  });
  it('non-zero above rebate band', () => {
    // 12L annual gross → meaningful TDS
    expect(calcMonthlyTdsNewRegime(100000)).toBeGreaterThan(0);
  });
});
