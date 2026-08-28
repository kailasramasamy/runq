// How much of something there is, written the way it is measured.
//
// Stock quantities are numeric(18,3), and every screen used to decide for
// itself how many of those decimals to show: some two, some three, some
// trimming trailing zeros and some not. The same 7.415 litres of raw milk
// therefore read as "7.42" on one screen and "7.415" on the next, which makes
// two screens showing the same number look like a discrepancy.
//
// The rule that settles it is not about decimals, it is about whether the
// thing is *counted* or *measured*:
//
//   • A finished good is counted. There are 22 pouches, never 22.35 of them,
//     so it reads bare and only shows decimals when a fraction really exists.
//   • A raw material is measured. Bulk milk arrives at 7.4 litres and the
//     plant floor works to one decimal, so a second one is noise the operator
//     has to read past.
//
// Note this rounds for display only — the ledger keeps all three decimals. A
// column of one-decimal figures may therefore not visibly add up to its own
// total, which is the accepted cost of showing the precision people work in.

library;

/// Item classes whose quantities are measured in bulk rather than counted.
const _measuredClasses = {'raw_material'};

/// Bare units of measure, as opposed to a pack size.
///
/// The distinction is the whole point: "litre" is a unit you measure in, while
/// "1L" is the size of a thing you count. Matched exactly, so "500ml" and "1L"
/// stay counted.
const _measuredUnits = {'litre', 'litres', 'ltr', 'l', 'kg', 'kgs', 'kilogram', 'kilograms'};

/// A stock quantity as its item wants it read.
///
/// Takes either signal, because neither is available everywhere. [itemClass]
/// is authoritative where a payload carries it; most do not, so [unit] stands
/// in — and for stock that is genuinely measured the two agree. Falling back
/// to the counted form is the safe default: showing a decimal too many is a
/// smaller error than hiding one.
String formatItemQty(num? qty, String? itemClass, {String? unit}) {
  if (qty == null) return '—';
  final v = qty.toDouble();
  if (v.isNaN || v.isInfinite) return '—';
  return isMeasured(itemClass, unit) ? formatMeasuredQty(v) : formatCountedQty(v);
}

/// Whether this item is measured rather than counted.
bool isMeasured(String? itemClass, String? unit) =>
    _measuredClasses.contains(itemClass) ||
    _measuredUnits.contains((unit ?? '').trim().toLowerCase());

/// One decimal, trailing zero dropped: 7.415 → "7.4", 90.500 → "90.5",
/// 12.000 → "12".
///
/// A remainder too small to show reads "<0.1" rather than "0". Rounding a
/// quantity that exists down to zero is the one error here worth guarding:
/// every other rounding is off by a tenth, but "0" says the shelf is empty
/// when it isn't, and that is a different sentence.
String formatMeasuredQty(num qty) {
  final v = qty.toDouble();
  if (v != 0 && v.abs() < 0.05) return v < 0 ? '>-0.1' : '<0.1';
  return _trim(v, 1);
}

/// Bare when whole, two decimals when not: 22 → "22", 22.5 → "22.5".
String formatCountedQty(num qty) => _trim(qty.toDouble(), 2);

/// Every decimal the column stores, for text the user can edit.
///
/// Display rounding is fine to read and fatal to type into: seeding an input
/// with a rounded 7.4 means submitting 7.4, quietly replacing the 7.415 that
/// was there. Fields keep the full precision; only labels round.
String formatExactQty(num qty) => _trim(qty.toDouble(), 3);

/// Fixed to [places], then stripped of the zeros that carry no information.
/// "7.40" says nothing "7.4" doesn't, and the extra glyph costs a column.
String _trim(double v, int places) {
  var s = v.toStringAsFixed(places);
  if (!s.contains('.')) return s;
  s = s.replaceFirst(RegExp(r'0+$'), '');
  return s.endsWith('.') ? s.substring(0, s.length - 1) : s;
}
