/**
 * Product pricing math (MRP-anchored flow).
 *
 * Used for physical products that carry a printed MRP — FMCG, retail,
 * pharma, construction materials, etc. The model:
 *
 *   Cost (COGM) ── manufacturer/seller's cost (sourcing + overhead)
 *     │
 *     ▼
 *   Basic Price ── taxable value invoiced to the buyer (excl. GST)
 *     │
 *     ▼
 *   + GST ─── tax collected on behalf of govt (not income)
 *     │
 *     ▼
 *   Landing Price ── total invoice value (incl. GST). What the seller pays.
 *     │
 *     ▼
 *   Seller Margin ── retailer/distributor's cut, applied as discount off MRP
 *     │
 *     ▼
 *   MRP ── consumer-printed price (always GST-inclusive in India)
 *
 * Convention: seller margin is calculated on MRP, i.e.
 *
 *     Landing Price = MRP × (1 − sellerMarginPct/100)
 *     Basic Price   = Landing Price / (1 + gstRatePct/100)
 *     GST Value     = Basic Price × gstRatePct/100
 *     Profit/unit   = Basic Price × (1 − schemePct/100) − Cost × (1 + freightPct/100)
 *
 * Trade scheme reduces the seller's effective revenue.
 * Freight/damages inflate the effective cost.
 *
 * For service items (consulting, hourly work, fixed-fee projects) use
 * calculateServicePricing instead — a simpler cost → selling price model
 * that doesn't involve MRP or seller margin.
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
 * Round a price up to a "psychological" retail price ending in 9
 * (49, 99, 149, …). Useful for translating a calculated MRP into a
 * print-worthy number.
 */
export function roundUpToPsychologicalPrice(mrp: number): number {
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

/**
 * Service pricing math — simpler than the product MRP flow.
 *
 * Services don't carry an MRP, don't have a seller margin discount,
 * and don't go through a COGM → Basic → Landing chain. They have a
 * single negotiable selling price (hourly rate, project fee, monthly
 * retainer), an internal cost (labour + overhead), and GST.
 *
 *     Basic Price     = Selling Price / (1 + gstRatePct/100)
 *     GST Value       = Basic Price × gstRatePct/100
 *     Profit per unit = Basic Price − Cost
 *     Net margin %    = Profit / Basic Price × 100
 *
 * "Per unit" here means per delivered unit of service (one hour, one
 * session, one retainer month), consistent with whatever `unit` the
 * tenant set on the item.
 */
export interface ServicePricingInputs {
  sellingPrice: number;
  cost: number;
  gstRatePct: number;
}

export interface ServicePricingResult {
  basicPrice: number;
  gstValue: number;
  profitPerUnit: number;
  netMarginPct: number;
  markupOnCostPct: number;
}

export function calculateServicePricing(inputs: ServicePricingInputs): ServicePricingResult {
  const { sellingPrice, cost, gstRatePct } = inputs;
  const basicPrice = sellingPrice / (1 + gstRatePct / 100);
  const gstValue = basicPrice * (gstRatePct / 100);
  const profitPerUnit = basicPrice - cost;
  const netMarginPct = basicPrice > 0 ? (profitPerUnit / basicPrice) * 100 : 0;
  const markupOnCostPct = cost > 0 ? (profitPerUnit / cost) * 100 : 0;
  return {
    basicPrice: round2(basicPrice),
    gstValue: round2(gstValue),
    profitPerUnit: round2(profitPerUnit),
    netMarginPct: round2(netMarginPct),
    markupOnCostPct: round2(markupOnCostPct),
  };
}
