import 'package:intl/intl.dart';

/// Today's date as an ISO `yyyy-MM-dd` string (the API's collectionDate format).
String todayIso() => DateFormat('yyyy-MM-dd').format(DateTime.now());

/// ISO `yyyy-MM-dd` for a specific date (the API's collectionDate format).
String isoDate(DateTime d) => DateFormat('yyyy-MM-dd').format(d);

/// ISO `yyyy-MM-dd` for N days before today (history range starts).
String isoDaysAgo(int days) =>
    DateFormat('yyyy-MM-dd').format(DateTime.now().subtract(Duration(days: days)));

/// Current shift by clock — AM before noon, PM after. Spec §3 ShiftToggle
/// "defaults to the current shift by clock".
String currentShift() => DateTime.now().hour < 12 ? 'am' : 'pm';

// Indian digit grouping (3 then 2,2…): 1,69,281 — the `#,##,##0` pattern forces
// the lakh/crore secondary group that a plain `#,##0` pattern doesn't.
final _litres = NumberFormat('#,##,##0.0', 'en_IN');
final _litres2 = NumberFormat('#,##,##0.00', 'en_IN');
final _rupees = NumberFormat('#,##,##0', 'en_IN');
final _rupees2 = NumberFormat('#,##,##0.00', 'en_IN');

/// "142.5" / "142.5 L". Tabular figures handled by the text style.
String litres(num v, {bool unit = false}) => unit ? '${_litres.format(v)} L' : _litres.format(v);
String litres2(num v) => _litres2.format(v);

/// "₹ 6,840" — Indian grouping. [paise] keeps two decimals.
String rupees(num v, {bool paise = false}) => '₹ ${paise ? _rupees2.format(v) : _rupees.format(v)}';

/// FAT/SNF to one decimal.
String oneDp(num v) => v.toStringAsFixed(1);

/// "1 Jun" (no year) from an ISO date string — compact labels/legends.
String shortDate(String iso) {
  final d = DateTime.tryParse(iso);
  return d == null ? iso : DateFormat('d MMM').format(d);
}

/// "1 Jun 2026" from an ISO date string.
String prettyDate(String iso) {
  final d = DateTime.tryParse(iso);
  return d == null ? iso : DateFormat('d MMM yyyy').format(d);
}

/// "5 Jun 2026" — e.g. "member since".
String memberSinceLabel(DateTime d) => DateFormat('d MMM yyyy').format(d);
