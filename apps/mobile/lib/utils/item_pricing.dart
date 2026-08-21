// Item pricing math — Dart port of apps/web/src/lib/item-pricing.ts.
//
// Products are MRP-anchored: the seller's margin is a discount off MRP,
// which fixes the landing (GST-inclusive) price, which back-solves the
// taxable basic price:
//
//     landing = mrp × (1 − sellerMargin/100)
//     basic   = landing / (1 + gstRate/100)
//     gst     = basic × gstRate/100
//     profit  = basic − cost
//
// Services skip MRP and margin entirely — the selling price is negotiated
// directly and the same back-solve applies.
//
// The web calculator also models trade scheme and freight percentages, but
// those are calculator-only knobs (never persisted on the item), so this
// port leaves them out rather than carrying dead parameters.

library;

double _round2(double n) => (n * 100).roundToDouble() / 100;

/// Derived pricing for a product, given the three inputs the user edits.
({double basicPrice, double gstValue, double landingPrice, double profitPerUnit, double netMarginPct})
    calcProductPricing({
  required double mrp,
  required double sellerMarginPct,
  required double gstRatePct,
  required double cost,
}) {
  final landing = mrp * (1 - sellerMarginPct / 100);
  final basic = landing / (1 + gstRatePct / 100);
  final gst = basic * (gstRatePct / 100);
  final profit = basic - cost;
  return (
    basicPrice: _round2(basic),
    gstValue: _round2(gst),
    landingPrice: _round2(landing),
    profitPerUnit: _round2(profit),
    netMarginPct: basic > 0 ? _round2(profit / basic * 100) : 0,
  );
}

/// Derived pricing for a service — no MRP, no seller margin.
({double basicPrice, double gstValue, double profitPerUnit, double netMarginPct})
    calcServicePricing({
  required double sellingPrice,
  required double gstRatePct,
  required double cost,
}) {
  final basic = sellingPrice / (1 + gstRatePct / 100);
  final gst = basic * (gstRatePct / 100);
  final profit = basic - cost;
  return (
    basicPrice: _round2(basic),
    gstValue: _round2(gst),
    profitPerUnit: _round2(profit),
    netMarginPct: basic > 0 ? _round2(profit / basic * 100) : 0,
  );
}
