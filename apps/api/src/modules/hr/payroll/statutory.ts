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

/**
 * Professional Tax — a *state* levy, so slabs are keyed by GST state code
 * (the stable identifier already captured in tenant settings). Each state
 * config carries male/female slab arrays: most states are gender-blind so
 * both point at the same array, but Maharashtra exempts women up to a higher
 * threshold. `febTax` overrides the monthly amount for February, where some
 * states (Maharashtra) collect the annual catch-up to hit the ₹2,500 cap.
 *
 * Monthly-cadence states only. Tamil Nadu / West Bengal compute PT on
 * half-yearly income and need a separate code path — out of scope here.
 * Seeded with Maharashtra + Karnataka; add states incrementally.
 */
interface PtSlab { upto: number; tax: number; febTax?: number }
interface PtStateConfig { male: PtSlab[]; female: PtSlab[] }

const PT_STATE_SLABS: Record<string, PtStateConfig> = {
  // Maharashtra (27): men taxed above ₹7,500, women above ₹25,000;
  // ₹200/month rising to ₹300 in February (₹200×11 + ₹300 = ₹2,500 cap).
  '27': {
    male: [
      { upto: 7500, tax: 0 },
      { upto: 10000, tax: 175 },
      { upto: Infinity, tax: 200, febTax: 300 },
    ],
    female: [
      { upto: 25000, tax: 0 },
      { upto: Infinity, tax: 200, febTax: 300 },
    ],
  },
  // Karnataka (29): flat ₹200/month above ₹25,000, no gender split, no
  // February catch-up.
  '29': (() => {
    const slabs: PtSlab[] = [
      { upto: 25000, tax: 0 },
      { upto: Infinity, tax: 200 },
    ];
    return { male: slabs, female: slabs };
  })(),
};

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
  options: { epsEnabled?: boolean } = {},
): PfChallan {
  const epsEnabled = options.epsEnabled !== false;
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
    // When EPS is disabled (e.g. ≥₹15k joiner post-Sep 2014), the employer's
    // full share lands in A/c 1 instead.
    const eps = epsEnabled
      ? Math.min(PF_EPS_CAP, Math.round(wages * PF_EPS_RATE))
      : 0;
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

/**
 * ESI for one employee-month.
 *
 * The ₹21,000 ceiling is an *eligibility* threshold checked at the start of
 * each six-month contribution period (Apr–Sep, Oct–Mar) — not a contribution
 * cap. So when an already-covered employee's wages cross the ceiling
 * mid-period, ESIC requires contributions to continue on the *full* wages
 * until the period ends. The caller passes `continuedCoverage = true` when
 * the employee was contributing in an earlier month of the current period.
 */
export function calcEsi(
  grossWages: number,
  continuedCoverage = false,
): { employee: number; employer: number } {
  if (grossWages > ESI_WAGE_CEILING && !continuedCoverage) {
    return { employee: 0, employer: 0 };
  }
  return {
    employee: round(grossWages * ESI_EMPLOYEE_RATE),
    employer: round(grossWages * ESI_EMPLOYER_RATE),
  };
}

/** Contribution-period months strictly before the given month, for the period
 *  that month falls in. Apr–Sep → starts Apr; Oct–Mar → starts Oct (prev year
 *  for Jan–Mar). Used to detect mid-period ESI coverage carry-over. */
export function esiPeriodMonthsBefore(
  year: number,
  month: number,
): Array<{ year: number; month: number }> {
  const start =
    month >= 4 && month <= 9
      ? { year, month: 4 }
      : month >= 10
        ? { year, month: 10 }
        : { year: year - 1, month: 10 };
  const out: Array<{ year: number; month: number }> = [];
  let y = start.year;
  let m = start.month;
  while (y < year || (y === year && m < month)) {
    out.push({ year: y, month: m });
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

export interface EsiChallan {
  /** Insured persons contributing this month. */
  totalIps: number;
  totalEsiWages: number;
  employeeShare: number;
  employerShare: number;
  grandTotal: number;
}

/**
 * Roll up per-employee ESI figures into the ESIC challan totals.
 * ESIC rounds each per-head contribution up to the next rupee, so we ceil
 * before summing — mirroring how the portal computes the challan amount.
 * Rows with no ESI (above-ceiling earners) are excluded from the IP count.
 */
export function calcEsiChallan(
  rows: Array<{ esiWages: number; esiEmployee: number; esiEmployer: number }>,
): EsiChallan {
  let totalIps = 0;
  let totalEsiWages = 0;
  let employeeShare = 0;
  let employerShare = 0;

  for (const r of rows) {
    if (r.esiEmployee === 0 && r.esiEmployer === 0) continue;
    totalIps++;
    totalEsiWages += r.esiWages;
    employeeShare += Math.ceil(r.esiEmployee);
    employerShare += Math.ceil(r.esiEmployer);
  }

  return {
    totalIps,
    totalEsiWages,
    employeeShare,
    employerShare,
    grandTotal: employeeShare + employerShare,
  };
}

/**
 * Professional Tax for one employee-month.
 *
 * `stateCode` is the GST state code of the establishment. States with no PT
 * levy (Delhi, UP, Haryana, …) — or any state not yet seeded — return 0.
 * `month` is 1-12; February (2) uses `febTax` where the state defines one.
 */
export function calcPt(
  stateCode: string | null | undefined,
  monthlyGross: number,
  gender: 'male' | 'female' | 'other' | null | undefined,
  month: number,
): number {
  if (!stateCode) return 0;
  const config = PT_STATE_SLABS[stateCode];
  if (!config) return 0;

  const slabs = gender === 'female' ? config.female : config.male;
  for (const slab of slabs) {
    if (monthlyGross <= slab.upto) {
      return month === 2 && slab.febTax != null ? slab.febTax : slab.tax;
    }
  }
  return 0;
}

export interface PtChallan {
  stateCode: string;
  /** Employees with a non-zero PT deduction this month. */
  totalEmployees: number;
  totalPt: number;
}

/**
 * Roll up per-employee PT into per-state challan totals. A company operating
 * in multiple states files a separate PT challan per state, so this returns
 * one entry per state, sorted by state code.
 */
export function calcPtChallan(
  rows: Array<{ stateCode: string; pt: number }>,
): PtChallan[] {
  const byState = new Map<string, PtChallan>();
  for (const r of rows) {
    if (r.pt === 0) continue;
    const entry = byState.get(r.stateCode)
      ?? { stateCode: r.stateCode, totalEmployees: 0, totalPt: 0 };
    entry.totalEmployees++;
    entry.totalPt = round(entry.totalPt + r.pt);
    byState.set(r.stateCode, entry);
  }
  return [...byState.values()].sort((a, b) => a.stateCode.localeCompare(b.stateCode));
}

/**
 * PT filing cadence + deadline per state. PT has no national file format —
 * each state runs its own portal and return form, so this is what drives the
 * compliance calendar (there's no ECR/MC-style upload to generate).
 *
 * `dueDay` is the day of the *following* month the monthly return + payment
 * are due; 'last' means the last calendar day of that month.
 *
 * Monthly-cadence states only — matches PT_STATE_SLABS. Annual states (e.g.
 * Maharashtra employers under ₹1L yearly liability) and half-yearly states
 * (Tamil Nadu, West Bengal) are deferred until those code paths exist.
 */
interface PtFilingConfig {
  cadence: 'monthly';
  dueDay: number | 'last';
  form: string;
  portal: string;
}

const PT_STATE_FILING: Record<string, PtFilingConfig> = {
  // Maharashtra: monthly return Form III-B, due the last day of the next month.
  '27': { cadence: 'monthly', dueDay: 'last', form: 'III-B', portal: 'mahagst.gov.in' },
  // Karnataka: monthly return Form 5A, due the 20th of the next month.
  '29': { cadence: 'monthly', dueDay: 20, form: '5A', portal: 'gst.kar.nic.in' },
};

export interface PtDueDate {
  /** ISO date (YYYY-MM-DD) the return + payment are due. */
  date: string;
  cadence: 'monthly';
  form: string;
  portal: string;
}

/**
 * When the PT return for a given payroll month must be filed. Returns null for
 * states with no PT levy or no filing config yet — the caller skips them in
 * the compliance calendar.
 */
export function ptDueDate(
  stateCode: string | null | undefined,
  year: number,
  month: number,
): PtDueDate | null {
  if (!stateCode) return null;
  const cfg = PT_STATE_FILING[stateCode];
  if (!cfg) return null;

  // Monthly returns are due in the month after the payroll month.
  const dueYear = month === 12 ? year + 1 : year;
  const dueMonth = month === 12 ? 1 : month + 1;
  const lastDay = new Date(Date.UTC(dueYear, dueMonth, 0)).getUTCDate();
  const day = cfg.dueDay === 'last' ? lastDay : Math.min(cfg.dueDay, lastDay);

  return {
    date: `${dueYear}-${String(dueMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    cadence: cfg.cadence,
    form: cfg.form,
    portal: cfg.portal,
  };
}

export interface NewRegimeTaxBreakdown {
  taxableIncome: number;
  taxBeforeRebate: number;
  rebate87A: number;
  taxAfterRebate: number;
  cess: number;
  totalTax: number;
}

/**
 * Annual income-tax under the new regime, no declarations: standard deduction,
 * slabs, 87A rebate, 4% health & education cess. Returns the full breakdown —
 * Form 16 Part B prints each line, the monthly TDS estimator just needs the
 * total.
 */
export function computeNewRegimeTaxBreakdown(annualGross: number): NewRegimeTaxBreakdown {
  const taxableIncome = Math.max(0, annualGross - STANDARD_DEDUCTION);

  let taxBeforeRebate = 0;
  let prev = 0;
  for (const slab of NEW_REGIME_SLABS) {
    if (taxableIncome <= prev) break;
    const chunk = Math.min(taxableIncome, slab.upto) - prev;
    if (chunk > 0) taxBeforeRebate += chunk * slab.rate;
    prev = slab.upto;
  }

  const rebate87A = taxableIncome <= SECTION_87A_REBATE_LIMIT
    ? Math.min(SECTION_87A_MAX_REBATE, taxBeforeRebate)
    : 0;
  const taxAfterRebate = taxBeforeRebate - rebate87A;
  const cess = taxAfterRebate * 0.04;

  return {
    taxableIncome: round(taxableIncome),
    taxBeforeRebate: round(taxBeforeRebate),
    rebate87A: round(rebate87A),
    taxAfterRebate: round(taxAfterRebate),
    cess: round(cess),
    totalTax: round(taxAfterRebate + cess),
  };
}

/** Annual new-regime tax — just the final figure. See computeNewRegimeTaxBreakdown. */
export function computeNewRegimeAnnualTax(annualGross: number): number {
  return computeNewRegimeTaxBreakdown(annualGross).totalTax;
}

/** Financial-year months strictly before the given calendar month, for the
 *  FY (Apr–Mar) that month falls in. Apr–Dec → FY starts Apr of `year`;
 *  Jan–Mar → FY starts Apr of `year − 1`. Used to gather TDS paid so far. */
export function fyMonthsBefore(
  year: number,
  month: number,
): Array<{ year: number; month: number }> {
  const start = month >= 4 ? { year, month: 4 } : { year: year - 1, month: 4 };
  const out: Array<{ year: number; month: number }> = [];
  let y = start.year;
  let m = start.month;
  while (y < year || (y === year && m < month)) {
    out.push({ year: y, month: m });
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

export interface TdsContext {
  /** Taxable gross actually paid to this employee earlier in the FY. */
  fyIncomeSoFar: number;
  /** This payslip's gross. */
  currentMonthGross: number;
  /** Expected full monthly gross for each remaining month after this one. */
  futureMonthGross: number;
  /** Months left in the FY, including the current month (1–12). */
  remainingMonths: number;
  /** TDS already deducted from this employee earlier in the FY. */
  tdsPaidSoFar: number;
}

/**
 * Monthly TDS under the new regime, no declarations.
 *
 * Projects annual income from what's actually been paid plus the expected
 * remaining months, computes the annual tax, then spreads the *still-unpaid*
 * portion evenly over the remaining months. This self-corrects: a mid-year
 * bonus or hike is absorbed by later months, and the final month
 * (`remainingMonths = 1`) settles the exact annual liability.
 */
export function calcMonthlyTdsNewRegime(ctx: TdsContext): number {
  const { fyIncomeSoFar, currentMonthGross, futureMonthGross, remainingMonths, tdsPaidSoFar } = ctx;
  if (remainingMonths <= 0) return 0;

  const projectedAnnual =
    fyIncomeSoFar + currentMonthGross + futureMonthGross * (remainingMonths - 1);
  const annualTax = computeNewRegimeAnnualTax(projectedAnnual);

  return round(Math.max(0, (annualTax - tdsPaidSoFar) / remainingMonths));
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
