import { describe, it, expect } from 'vitest';
import { calcPf, calcEsi, calcPtKarnataka, calcMonthlyTdsNewRegime, calcPfChallan } from './statutory';

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

describe('statutory: PF challan', () => {
  it('rolls up account heads for a single above-ceiling employee', () => {
    // PF wages capped at 15000 → EE 1800, ER 1800
    const c = calcPfChallan([{ pfWages: 20000, pfEmployee: 1800, pfEmployer: 1800 }]);
    expect(c.totalEmployees).toBe(1);
    expect(c.totalPfWages).toBe(15000);
    expect(c.account10Eps).toBe(1250);          // 8.33% × 15000
    expect(c.account1Epf).toBe(2350);           // EE 1800 + ER diff 550
    expect(c.account21Edli).toBe(75);           // 0.5% × 15000
    expect(c.account2Admin).toBe(500);          // 0.5% × 15000 = 75 → floored to 500
    expect(c.employeeShare).toBe(1800);
    expect(c.grandTotal).toBe(2350 + 500 + 1250 + 75);
  });

  it('admin charge clears the ₹500 floor with enough employees', () => {
    // 10 employees × 15000 PF wages = 150000 → admin 0.5% = 750 > 500
    const rows = Array.from({ length: 10 }, () => ({
      pfWages: 15000, pfEmployee: 1800, pfEmployer: 1800,
    }));
    const c = calcPfChallan(rows);
    expect(c.account2Admin).toBe(750);
    expect(c.account10Eps).toBe(12500);
    expect(c.totalEmployees).toBe(10);
  });

  it('skips employees with no PF', () => {
    const c = calcPfChallan([
      { pfWages: 15000, pfEmployee: 1800, pfEmployer: 1800 },
      { pfWages: 0, pfEmployee: 0, pfEmployer: 0 },
    ]);
    expect(c.totalEmployees).toBe(1);
  });

  it('grand total = sum of all account heads', () => {
    const c = calcPfChallan([{ pfWages: 12000, pfEmployee: 1440, pfEmployer: 1440 }]);
    expect(c.grandTotal).toBe(
      c.account1Epf + c.account2Admin + c.account10Eps + c.account21Edli + c.account22EdliAdmin,
    );
  });
});
