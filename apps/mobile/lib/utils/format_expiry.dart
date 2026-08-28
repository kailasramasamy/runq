// How long a batch has left, written short enough to sit on a row beside its
// quantity.
//
// An ISO date is ten characters of mostly-constant prefix — "exp 2026-08-31"
// pushed the quantity off the Record Production rows and truncated to
// "exp 2026-…", which tells the operator nothing at all. What they actually
// decide on is the gap, not the date: raw milk lives three days, so "2d" is
// both shorter and the thing being asked about. Real dates return once the gap
// is too far out to hold in your head.

library;

const _months = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/// A batch's expiry as a short label: 'expired', 'today', 'tomorrow', '2d',
/// then '31 Aug' — and a year once it is not this one.
///
/// [iso] is a `YYYY-MM-DD` date. Returns null for anything unparseable, so
/// callers can fall back to saying nothing rather than printing a broken date.
String? shortExpiry(String? iso, {DateTime? now}) {
  if (iso == null || iso.isEmpty) return null;
  final date = DateTime.tryParse(iso);
  if (date == null) return null;

  // Whole days between calendar dates, so an expiry at any hour today still
  // reads "today" rather than sliding to "tomorrow" after midday.
  final today = now ?? DateTime.now();
  final days = DateTime(date.year, date.month, date.day)
      .difference(DateTime(today.year, today.month, today.day))
      .inDays;

  if (days < 0) return 'expired';
  if (days == 0) return 'today';
  if (days == 1) return 'tomorrow';
  if (days <= 14) return '${days}d';
  final month = _months[date.month - 1];
  return date.year == today.year
      ? '${date.day} $month'
      : '${date.day} $month ${date.year % 100}';
}
