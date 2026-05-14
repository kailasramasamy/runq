import { describe, it, expect } from 'vitest';
import {
  calcPf, calcEsi, calcPt, calcMonthlyTdsNewRegime,
  computeNewRegimeAnnualTax, computeNewRegimeTaxBreakdown,
  calcPfChallan, calcEsiChallan, calcPtChallan, ptDueDate,
  esiPeriodMonthsBefore, fyMonthsBefore,
} from './statutory';

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
  it('exempt above 21K when not already covered', () => {
    const r = calcEsi(22000);
    expect(r.employee).toBe(0);
    expect(r.employer).toBe(0);
  });
  it('continues above 21K on full wages when covered earlier in the period', () => {
    const r = calcEsi(23000, true);
    expect(r.employee).toBe(172.5);   // 0.75% of the full 23000, not capped
    expect(r.employer).toBe(747.5);   // 3.25% of 23000
  });
  it('continuedCoverage flag is a no-op below the ceiling', () => {
    expect(calcEsi(18000, true)).toEqual(calcEsi(18000, false));
  });
});

describe('statutory: ESI contribution period', () => {
  it('Apr–Sep period starts in April', () => {
    expect(esiPeriodMonthsBefore(2026, 7)).toEqual([
      { year: 2026, month: 4 }, { year: 2026, month: 5 }, { year: 2026, month: 6 },
    ]);
  });
  it('first month of a period has no prior months', () => {
    expect(esiPeriodMonthsBefore(2026, 4)).toEqual([]);
    expect(esiPeriodMonthsBefore(2026, 10)).toEqual([]);
  });
  it('Jan–Mar belong to the Oct period of the previous year', () => {
    expect(esiPeriodMonthsBefore(2026, 2)).toEqual([
      { year: 2025, month: 10 }, { year: 2025, month: 11 },
      { year: 2025, month: 12 }, { year: 2026, month: 1 },
    ]);
  });
});

describe('statutory: PT', () => {
  it('Karnataka — flat ₹200 above ₹25K, nil below, no February bump', () => {
    expect(calcPt('29', 30000, 'male', 1)).toBe(200);
    expect(calcPt('29', 20000, 'male', 1)).toBe(0);
    expect(calcPt('29', 30000, 'male', 2)).toBe(200); // no febTax
  });

  it('Maharashtra — ₹200/month, ₹300 in February', () => {
    expect(calcPt('27', 30000, 'male', 1)).toBe(200);
    expect(calcPt('27', 30000, 'male', 2)).toBe(300);
    expect(calcPt('27', 9000, 'male', 1)).toBe(175);  // ₹7.5K–10K band
    expect(calcPt('27', 7000, 'male', 1)).toBe(0);
  });

  it('Maharashtra — women exempt up to ₹25K, taxed like men above it', () => {
    expect(calcPt('27', 20000, 'female', 1)).toBe(0);   // exempt (men would pay ₹200)
    expect(calcPt('27', 20000, 'male', 1)).toBe(200);
    expect(calcPt('27', 30000, 'female', 2)).toBe(300); // above threshold → Feb bump applies
  });

  it('treats gender "other" and null as the male slab', () => {
    expect(calcPt('27', 20000, 'other', 1)).toBe(200);
    expect(calcPt('27', 20000, null, 1)).toBe(200);
  });

  it('returns 0 for states with no PT levy or no config', () => {
    expect(calcPt('07', 50000, 'male', 1)).toBe(0);  // Delhi — no PT
    expect(calcPt(null, 50000, 'male', 1)).toBe(0);
    expect(calcPt(undefined, 50000, 'male', 1)).toBe(0);
  });
});

describe('statutory: PT challan', () => {
  it('groups per state and counts only non-zero deductions', () => {
    const challans = calcPtChallan([
      { stateCode: '29', pt: 200 },
      { stateCode: '29', pt: 200 },
      { stateCode: '29', pt: 0 },     // skipped
      { stateCode: '27', pt: 300 },
    ]);
    expect(challans).toEqual([
      { stateCode: '27', totalEmployees: 1, totalPt: 300 },
      { stateCode: '29', totalEmployees: 2, totalPt: 400 },
    ]);
  });

  it('returns an empty array when no one pays PT', () => {
    expect(calcPtChallan([{ stateCode: '07', pt: 0 }])).toEqual([]);
  });
});

describe('statutory: PT due date', () => {
  it('Karnataka — 20th of the month after the payroll month', () => {
    expect(ptDueDate('29', 2026, 5)?.date).toBe('2026-06-20');
    expect(ptDueDate('29', 2026, 5)?.form).toBe('5A');
  });

  it('Maharashtra — last day of the month after the payroll month', () => {
    expect(ptDueDate('27', 2026, 5)?.date).toBe('2026-06-30');
    expect(ptDueDate('27', 2026, 1)?.date).toBe('2026-02-28'); // non-leap February
    expect(ptDueDate('27', 2026, 2)?.date).toBe('2026-03-31');
  });

  it('rolls into the next year for the December payroll month', () => {
    expect(ptDueDate('29', 2026, 12)?.date).toBe('2027-01-20');
  });

  it('returns null for states with no PT filing config', () => {
    expect(ptDueDate('07', 2026, 5)).toBeNull();   // Delhi — no PT
    expect(ptDueDate(null, 2026, 5)).toBeNull();
  });
});

describe('statutory: new regime annual tax', () => {
  it('nil at ₹3L gross — under the slab floor after standard deduction', () => {
    expect(computeNewRegimeAnnualTax(300000)).toBe(0);
  });
  it('nil at ₹7.75L gross — ₹7L taxable wiped by the 87A rebate', () => {
    expect(computeNewRegimeAnnualTax(775000)).toBe(0);
  });
  it('₹71,500 at ₹12L gross — slabs + 4% cess, no rebate', () => {
    // taxable 11.25L → 20000 + 30000 + 18750 = 68750 → ×1.04 cess
    expect(computeNewRegimeAnnualTax(1200000)).toBe(71500);
  });

  it('breakdown lines reconcile to the total', () => {
    const b = computeNewRegimeTaxBreakdown(1200000);
    expect(b.taxableIncome).toBe(1125000);
    expect(b.taxBeforeRebate).toBe(68750);
    expect(b.rebate87A).toBe(0);          // taxable above the ₹7L rebate band
    expect(b.cess).toBe(2750);            // 4% of 68750
    expect(b.totalTax).toBe(71500);
  });

  it('breakdown caps the 87A rebate at the tax actually due', () => {
    // ₹7.75L gross → ₹7L taxable → ₹20,000 tax, rebate capped at ₹20,000 (not ₹25,000)
    const b = computeNewRegimeTaxBreakdown(775000);
    expect(b.taxBeforeRebate).toBe(20000);
    expect(b.rebate87A).toBe(20000);
    expect(b.totalTax).toBe(0);
  });
});

describe('statutory: monthly TDS new regime', () => {
  it('full-year employee — annual tax spread evenly over 12 months', () => {
    // ₹1L/month → ₹12L projected → ₹71,500 annual tax → /12
    const tds = calcMonthlyTdsNewRegime({
      fyIncomeSoFar: 0, currentMonthGross: 100000, futureMonthGross: 100000,
      remainingMonths: 12, tdsPaidSoFar: 0,
    });
    expect(tds).toBeCloseTo(71500 / 12, 2);
  });

  it('mid-year joiner — annual income projected on remaining months only', () => {
    // Joins August: 8 months remaining, ₹1L/month → ₹8L projected, not ₹12L
    const tds = calcMonthlyTdsNewRegime({
      fyIncomeSoFar: 0, currentMonthGross: 100000, futureMonthGross: 100000,
      remainingMonths: 8, tdsPaidSoFar: 0,
    });
    expect(tds).toBeCloseTo(computeNewRegimeAnnualTax(800000) / 8, 2);
  });

  it('final month settles the exact unpaid balance', () => {
    // March, ₹11L paid + ₹1L now = ₹12L → ₹71,500 tax, ₹65,000 already deducted
    const tds = calcMonthlyTdsNewRegime({
      fyIncomeSoFar: 1100000, currentMonthGross: 100000, futureMonthGross: 100000,
      remainingMonths: 1, tdsPaidSoFar: 65000,
    });
    expect(tds).toBe(6500); // 71500 − 65000
  });

  it('absorbs a mid-year bonus into the remaining months', () => {
    const normal = calcMonthlyTdsNewRegime({
      fyIncomeSoFar: 600000, currentMonthGross: 100000, futureMonthGross: 100000,
      remainingMonths: 6, tdsPaidSoFar: 35750,
    });
    // Same employee, but a ₹3L bonus lands this month
    const withBonus = calcMonthlyTdsNewRegime({
      fyIncomeSoFar: 600000, currentMonthGross: 400000, futureMonthGross: 100000,
      remainingMonths: 6, tdsPaidSoFar: 35750,
    });
    expect(withBonus).toBeGreaterThan(normal);
  });

  it('never goes negative when TDS is already over-deducted', () => {
    const tds = calcMonthlyTdsNewRegime({
      fyIncomeSoFar: 1100000, currentMonthGross: 100000, futureMonthGross: 100000,
      remainingMonths: 1, tdsPaidSoFar: 90000, // more than the annual liability
    });
    expect(tds).toBe(0);
  });

  it('returns 0 when no months remain', () => {
    expect(calcMonthlyTdsNewRegime({
      fyIncomeSoFar: 1200000, currentMonthGross: 0, futureMonthGross: 0,
      remainingMonths: 0, tdsPaidSoFar: 71500,
    })).toBe(0);
  });

  it('nil tax employee — no TDS all year', () => {
    expect(calcMonthlyTdsNewRegime({
      fyIncomeSoFar: 0, currentMonthGross: 25000, futureMonthGross: 25000,
      remainingMonths: 12, tdsPaidSoFar: 0,
    })).toBe(0);
  });
});

describe('statutory: financial-year months before', () => {
  it('April is the FY start — no prior months', () => {
    expect(fyMonthsBefore(2026, 4)).toEqual([]);
  });
  it('May has April before it', () => {
    expect(fyMonthsBefore(2026, 5)).toEqual([{ year: 2026, month: 4 }]);
  });
  it('Jan–Mar belong to the previous calendar year’s FY', () => {
    expect(fyMonthsBefore(2026, 1)).toHaveLength(9);  // Apr–Dec 2025
    expect(fyMonthsBefore(2026, 3)).toHaveLength(11); // Apr 2025 – Feb 2026
    expect(fyMonthsBefore(2026, 1)[0]).toEqual({ year: 2025, month: 4 });
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

describe('statutory: ESI challan', () => {
  it('ceils each per-head share to the next rupee before summing', () => {
    // 18000 gross → EE 135, ER 585 (both whole, no rounding effect)
    // 17333 gross → EE 129.9975 → 130, ER 563.3225 → 564
    const c = calcEsiChallan([
      { esiWages: 18000, esiEmployee: 135, esiEmployer: 585 },
      { esiWages: 17333, esiEmployee: 129.9975, esiEmployer: 563.3225 },
    ]);
    expect(c.totalIps).toBe(2);
    expect(c.totalEsiWages).toBe(35333);
    expect(c.employeeShare).toBe(135 + 130);
    expect(c.employerShare).toBe(585 + 564);
    expect(c.grandTotal).toBe(135 + 130 + 585 + 564);
  });

  it('skips above-ceiling employees with no ESI', () => {
    const c = calcEsiChallan([
      { esiWages: 18000, esiEmployee: 135, esiEmployer: 585 },
      { esiWages: 25000, esiEmployee: 0, esiEmployer: 0 },
    ]);
    expect(c.totalIps).toBe(1);
    expect(c.totalEsiWages).toBe(18000);
    expect(c.grandTotal).toBe(720);
  });
});
