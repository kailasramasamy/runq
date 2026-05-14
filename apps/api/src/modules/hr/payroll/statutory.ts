/**
 * Indian statutory payroll calculators.
 *
 * All numbers below reflect FY 2025-26 rules. When the law changes (new PT
 * slabs, PF wage ceiling revision, etc.), edit the constants in one place.
 *
 * Out of scope here: rebates, surcharge, cess for high earners — Phase 4
 * will add the full TDS engine with Section 89/HRA exemption/declarations.
 */

const PF_CEILING_BASIC = 15000;        // PF wage ceiling
const PF_EMPLOYEE_RATE = 0.12;
const PF_EMPLOYER_RATE = 0.12;         // (admin/EDLI charges added at filing time)

const ESI_WAGE_CEILING = 21000;        // ESI applies if monthly wages ≤ this
const ESI_EMPLOYEE_RATE = 0.0075;
const ESI_EMPLOYER_RATE = 0.0325;

/** Karnataka monthly PT slabs (FY 2025-26). */
const KARNATAKA_PT_SLABS: Array<{ upto: number; tax: number }> = [
  { upto: 25000, tax: 0 },
  { upto: Infinity, tax: 200 },
];

/** New tax regime slabs (FY 2025-26) — flat default for MVP. */
const NEW_REGIME_SLABS: Array<{ upto: number; rate: number }> = [
  { upto: 300000, rate: 0 },
  { upto: 700000, rate: 0.05 },
  { upto: 1000000, rate: 0.10 },
  { upto: 1200000, rate: 0.15 },
  { upto: 1500000, rate: 0.20 },
  { upto: Infinity, rate: 0.30 },
];

const STANDARD_DEDUCTION = 75000;
const SECTION_87A_REBATE_LIMIT = 700000; // taxable income up to ₹7L → rebate
const SECTION_87A_MAX_REBATE = 25000;

export function calcPf(basic: number): { employee: number; employer: number } {
  const wages = Math.min(basic, PF_CEILING_BASIC);
  return {
    employee: round(wages * PF_EMPLOYEE_RATE),
    employer: round(wages * PF_EMPLOYER_RATE),
  };
}

export function calcEsi(grossWages: number): { employee: number; employer: number } {
  if (grossWages > ESI_WAGE_CEILING) return { employee: 0, employer: 0 };
  return {
    employee: round(grossWages * ESI_EMPLOYEE_RATE),
    employer: round(grossWages * ESI_EMPLOYER_RATE),
  };
}

export function calcPtKarnataka(monthlyGross: number): number {
  for (const slab of KARNATAKA_PT_SLABS) {
    if (monthlyGross <= slab.upto) return slab.tax;
  }
  return 0;
}

/**
 * Estimate monthly TDS using new regime, no declarations.
 * Projects annual income, applies standard deduction, slabs, 87A rebate, 4% cess,
 * divides by 12.
 */
export function calcMonthlyTdsNewRegime(monthlyGross: number): number {
  const annualGross = monthlyGross * 12;
  const taxable = Math.max(0, annualGross - STANDARD_DEDUCTION);

  let tax = 0;
  let prev = 0;
  for (const slab of NEW_REGIME_SLABS) {
    if (taxable <= prev) break;
    const chunk = Math.min(taxable, slab.upto) - prev;
    if (chunk > 0) tax += chunk * slab.rate;
    prev = slab.upto;
  }

  // 87A rebate
  if (taxable <= SECTION_87A_REBATE_LIMIT) {
    tax = Math.max(0, tax - SECTION_87A_MAX_REBATE);
  }
  // 4% health & education cess
  tax *= 1.04;

  return round(tax / 12);
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
