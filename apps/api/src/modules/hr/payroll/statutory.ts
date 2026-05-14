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
const PF_EMPLOYER_RATE = 0.12;
const PF_EPS_RATE = 0.0833;            // employer 8.33% → pension (A/c 10)
const PF_EPS_CAP = 1250;               // 8.33% of ₹15,000, hard cap per head
const PF_EDLI_RATE = 0.005;            // employer 0.5% → EDLI insurance (A/c 21)
const PF_ADMIN_RATE = 0.005;           // employer 0.5% → admin charges (A/c 2)
const PF_ADMIN_MIN = 500;              // per-establishment monthly minimum on A/c 2

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

export interface PfChallan {
  totalEmployees: number;
  totalPfWages: number;
  /** A/c 1 — EPF: employee 12% + employer's EPF-EPS difference. */
  account1Epf: number;
  /** A/c 2 — Admin charges: 0.5% of PF wages, floored at ₹500/month. */
  account2Admin: number;
  /** A/c 10 — EPS: employer 8.33%, capped at 8.33% of ₹15,000 per head. */
  account10Eps: number;
  /** A/c 21 — EDLI: employer 0.5% of PF wages. */
  account21Edli: number;
  /** A/c 22 — EDLI admin: nil since 2015, kept for challan completeness. */
  account22EdliAdmin: number;
  employeeShare: number;
  employerShare: number;
  grandTotal: number;
}

/**
 * Roll up per-employee PF figures into the EPFO challan account heads.
 * `rows` are the already-computed per-payslip values; PF wages must already
 * be capped at the ceiling by the caller.
 */
export function calcPfChallan(
  rows: Array<{ pfWages: number; pfEmployee: number; pfEmployer: number }>,
): PfChallan {
  // EPFO challans are denominated in whole rupees — each per-head figure is
  // rounded before it's summed, mirroring how the portal computes the TRRN.
  let totalPfWages = 0;
  let account1Epf = 0;
  let account10Eps = 0;
  let account21Edli = 0;
  let employeeShare = 0;
  let contributors = 0;

  for (const r of rows) {
    if (r.pfEmployee === 0 && r.pfEmployer === 0) continue;
    contributors++;
    const wages = Math.min(r.pfWages, PF_CEILING_BASIC);
    totalPfWages += wages;

    // EPS is 8.33%, but hard-capped at 8.33% of the ceiling (₹1,250/head).
    const eps = Math.min(PF_EPS_CAP, Math.round(wages * PF_EPS_RATE));
    const epfDiff = Math.max(0, Math.round(r.pfEmployer) - eps); // employer's 3.67% share
    account10Eps += eps;
    account1Epf += Math.round(r.pfEmployee) + epfDiff;
    account21Edli += Math.round(wages * PF_EDLI_RATE);
    employeeShare += Math.round(r.pfEmployee);
  }

  const account2Admin = Math.max(PF_ADMIN_MIN, Math.round(totalPfWages * PF_ADMIN_RATE));
  const account22EdliAdmin = 0;
  const employerShare =
    account1Epf - employeeShare + account10Eps + account21Edli + account2Admin;
  const grandTotal =
    account1Epf + account2Admin + account10Eps + account21Edli + account22EdliAdmin;

  return {
    totalEmployees: contributors,
    totalPfWages,
    account1Epf,
    account2Admin,
    account10Eps,
    account21Edli,
    account22EdliAdmin,
    employeeShare,
    employerShare,
    grandTotal,
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
