String formatINR(num? value, {bool compact = false, bool signed = false, bool currency = true}) {
  if (value == null || value.isNaN) return '—';
  final neg = value < 0;
  final abs = value.abs();
  final body = compact ? _compact(abs) : _grouped(abs);
  final sign = neg ? '−' : (signed ? '+' : '');
  return '${currency ? '₹' : ''}$sign$body';
}

String _compact(num abs) {
  if (abs >= 10000000) return '${_trim((abs / 10000000).toStringAsFixed(2))}Cr';
  if (abs >= 100000) return '${_trim((abs / 100000).toStringAsFixed(2))}L';
  if (abs >= 1000) return '${_trim((abs / 1000).toStringAsFixed(1))}k';
  return abs.toStringAsFixed(0);
}

String _grouped(num abs) {
  final s = abs.round().toString();
  if (s.length <= 3) return s;
  final last3 = s.substring(s.length - 3);
  final rest = s.substring(0, s.length - 3);
  final groupedRest = rest.replaceAllMapped(
    RegExp(r'(\d)(?=(\d\d)+$)'),
    (m) => '${m[1]},',
  );
  return '$groupedRest,$last3';
}

String _trim(String n) {
  if (n.contains('.')) {
    n = n.replaceFirst(RegExp(r'0+$'), '');
    if (n.endsWith('.')) n = n.substring(0, n.length - 1);
  }
  return n;
}
