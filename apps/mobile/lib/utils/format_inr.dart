String formatINR(
  num? value, {
  bool compact = false,
  bool signed = false,
  bool currency = true,
  bool paise = false,
}) {
  if (value == null || value.isNaN) return '—';
  final neg = value < 0;
  final abs = value.abs();
  final body = compact ? _compact(abs) : _grouped(abs, keepPaise: paise);
  final sign = neg ? '−' : (signed ? '+' : '');
  return '${currency ? '₹' : ''}$sign$body';
}

/// Compact money for chart labels and axes, held to three significant figures
/// so a crowded axis stays readable: 64,900 → ₹65k, 1,240 → ₹1.2k.
///
/// Differs from `formatINR(compact: true)`, which keeps two decimals on the
/// lakh and crore scales. The decimal only survives below 10 of a unit, where
/// dropping it would round ₹6.7L to ₹7L and lose thirty thousand rupees.
String formatChartINR(num? value) {
  if (value == null || value.isNaN) return '—';
  final abs = value.abs();
  final sign = value < 0 ? '−' : '';
  String unit(num scaled, String suffix) {
    final text = scaled >= 10
        ? scaled.round().toString()
        : _trim(scaled.toStringAsFixed(1));
    return '$sign₹$text$suffix';
  }

  if (abs >= 10000000) return unit(abs / 10000000, 'Cr');
  if (abs >= 100000) return unit(abs / 100000, 'L');
  if (abs >= 1000) return unit(abs / 1000, 'k');
  return '$sign₹${abs.round()}';
}

String _compact(num abs) {
  if (abs >= 10000000) return '${_trim((abs / 10000000).toStringAsFixed(2))}Cr';
  if (abs >= 100000) return '${_trim((abs / 100000).toStringAsFixed(2))}L';
  if (abs >= 1000) return '${_trim((abs / 1000).toStringAsFixed(1))}k';
  return abs.toStringAsFixed(0);
}

String _grouped(num abs, {bool keepPaise = false}) {
  // Preserve paise: format to 2 decimals first so the fractional part isn't
  // lost, then group the integer part Indian-style. By default trailing
  // zeros are trimmed so whole-rupee values render as "₹648". When
  // [keepPaise] is true (e.g. detail/ledger views) the two decimals are
  // always rendered: "₹648.00".
  final fixed = abs.toStringAsFixed(2);
  final dot = fixed.indexOf('.');
  final intPart = dot >= 0 ? fixed.substring(0, dot) : fixed;
  var fracPart = dot >= 0 ? fixed.substring(dot + 1) : '';
  if (!keepPaise) {
    fracPart = fracPart.replaceFirst(RegExp(r'0+$'), '');
  }

  String grouped;
  if (intPart.length <= 3) {
    grouped = intPart;
  } else {
    final last3 = intPart.substring(intPart.length - 3);
    final rest = intPart.substring(0, intPart.length - 3);
    final groupedRest = rest.replaceAllMapped(
      RegExp(r'(\d)(?=(\d\d)+$)'),
      (m) => '${m[1]},',
    );
    grouped = '$groupedRest,$last3';
  }

  return fracPart.isEmpty ? grouped : '$grouped.$fracPart';
}

String _trim(String n) {
  if (n.contains('.')) {
    n = n.replaceFirst(RegExp(r'0+$'), '');
    if (n.endsWith('.')) n = n.substring(0, n.length - 1);
  }
  return n;
}
