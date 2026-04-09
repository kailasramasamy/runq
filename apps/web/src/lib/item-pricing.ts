/**
 * FMCG manufacturer pricing math.
 *
 * The model:
 *
 *   COGM ── manufacturer's cost (already includes sourcing & overhead)
 *     │
 *     ▼
 *   Basic Price ── what the manufacturer invoices the seller (excl. GST)
 *     │            also called "taxable value" on the invoice
 *     ▼
 *   + GST ─── tax collected on behalf of govt (not income)
 *     │
 *     ▼
 *   Landing Price ── total invoice value (incl. GST). What the seller pays.
 *     │
 *     ▼
 *   Seller Margin ── retailer/distributor's cut, applied as a discount off MRP
 *     │
 *     ▼
 *   MRP ── consumer-printed price (always GST-inclusive in India)
 *
 * Industry convention: seller margin is calculated on MRP excl. GST, i.e.
 *
 *     Landing Price = MRP × (1 − sellerMarginPct/100)
 *     Basic Price   = Landing Price / (1 + gstRatePct/100)
 *     GST Value     = Basic Price × gstRatePct/100
 *     Profit/unit   = Basic Price × (1 − schemePct/100) − COGM × (1 + freightPct/100)
 *
 * Trade scheme reduces the manufacturer's effective revenue.
 * Freight/damages inflate the manufacturer's effective cost.
 */

export interface PricingInputs {
  mrp: number;
  sellerMarginPct: number;
  gstRatePct: number;
  cogm: number;
  schemePct?: number;
  freightPct?: number;
}

export interface PricingResult {
  basicPrice: number;
  gstValue: number;
  landingPrice: number;
  effectiveBasicPrice: number;
  effectiveCogm: number;
  profitPerUnit: number;
  netMarginPct: number;
  markupOnCostPct: number;
  sellerEarningsPerUnit: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function calculatePricing(inputs: PricingInputs): PricingResult {
  const { mrp, sellerMarginPct, gstRatePct, cogm } = inputs;
  const schemePct = inputs.schemePct ?? 0;
  const freightPct = inputs.freightPct ?? 0;

  const landingPrice = mrp * (1 - sellerMarginPct / 100);
  const basicPrice = landingPrice / (1 + gstRatePct / 100);
  const gstValue = basicPrice * (gstRatePct / 100);

  const effectiveBasicPrice = basicPrice * (1 - schemePct / 100);
  const effectiveCogm = cogm * (1 + freightPct / 100);
  const profitPerUnit = effectiveBasicPrice - effectiveCogm;

  const netMarginPct =
    effectiveBasicPrice > 0 ? (profitPerUnit / effectiveBasicPrice) * 100 : 0;
  const markupOnCostPct =
    effectiveCogm > 0 ? (profitPerUnit / effectiveCogm) * 100 : 0;
  const sellerEarningsPerUnit = mrp - landingPrice;

  return {
    basicPrice: round2(basicPrice),
    gstValue: round2(gstValue),
    landingPrice: round2(landingPrice),
    effectiveBasicPrice: round2(effectiveBasicPrice),
    effectiveCogm: round2(effectiveCogm),
    profitPerUnit: round2(profitPerUnit),
    netMarginPct: round2(netMarginPct),
    markupOnCostPct: round2(markupOnCostPct),
    sellerEarningsPerUnit: round2(sellerEarningsPerUnit),
  };
}

/**
 * Solve for the MRP that hits a target net-margin %.
 *
 *     target = (BP × (1 − s) − C × (1 + f)) / (BP × (1 − s))
 *     1 − target = C × (1 + f) / (BP × (1 − s))
 *     BP = C × (1 + f) / ((1 − s) × (1 − target))
 *     MRP = BP × (1 + g) / (1 − m)
 */
export function solveMrpForTargetMargin(
  cogm: number,
  sellerMarginPct: number,
  gstRatePct: number,
  targetNetMarginPct: number,
  schemePct = 0,
  freightPct = 0,
): number | null {
  const m = sellerMarginPct / 100;
  const g = gstRatePct / 100;
  const s = schemePct / 100;
  const f = freightPct / 100;
  const t = targetNetMarginPct / 100;

  if (t >= 1 || m >= 1 || s >= 1) return null;

  const basicPrice = (cogm * (1 + f)) / ((1 - s) * (1 - t));
  const mrp = (basicPrice * (1 + g)) / (1 - m);
  return round2(mrp);
}

/**
 * Solve for break-even MRP — the smallest MRP that still recovers cost.
 * Equivalent to solveMrpForTargetMargin with target = 0.
 */
export function solveBreakevenMrp(
  cogm: number,
  sellerMarginPct: number,
  gstRatePct: number,
  schemePct = 0,
  freightPct = 0,
): number | null {
  return solveMrpForTargetMargin(cogm, sellerMarginPct, gstRatePct, 0, schemePct, freightPct);
}

/**
 * Round MRP up to a "psychological" FMCG price ending in 9 (49, 99, 149, …).
 * Useful for translating a calculated number into a print-worthy price.
 */
export function roundUpToFmcgPrice(mrp: number): number {
  if (mrp <= 0) return 0;
  // Find the next number ending in 9 at or above mrp.
  const ceil = Math.ceil(mrp);
  const lastDigit = ceil % 10;
  if (lastDigit === 9) return ceil;
  return ceil + ((9 - lastDigit + 10) % 10);
}

export interface CogmRow {
  label: string;
  amount: number;
  note?: string;
}

export function sumCogmBreakdown(rows: CogmRow[] | null | undefined): number {
  if (!rows || rows.length === 0) return 0;
  return round2(rows.reduce((acc, r) => acc + (Number(r.amount) || 0), 0));
}
