import 'package:flutter/material.dart';
import '../theme/runq_theme.dart';

/// Compact bank brand mark.
///
/// Renders the logo URL provided by the API (resolved server-side when a
/// bank account is created), falling back to a colored initials avatar if
/// the URL is missing or the network image fails.
class BankLogo extends StatelessWidget {
  final String bankName;
  final String? logoUrl;
  final double size;
  const BankLogo({super.key, required this.bankName, this.logoUrl, this.size = 36});

  @override
  Widget build(BuildContext context) {
    final avatar = _Avatar(name: bankName, size: size);
    final url = logoUrl;
    if (url == null || url.isEmpty) return avatar;
    return ClipRRect(
      borderRadius: BorderRadius.circular(size * 0.28),
      child: Container(
        width: size,
        height: size,
        color: Colors.white, // most logos are transparent — give them a clean canvas
        child: Image.network(
          url,
          width: size,
          height: size,
          fit: BoxFit.contain,
          filterQuality: FilterQuality.medium,
          loadingBuilder: (ctx, child, progress) {
            if (progress == null) return child;
            return avatar;
          },
          errorBuilder: (_, __, ___) => avatar,
        ),
      ),
    );
  }
}

class _Avatar extends StatelessWidget {
  final String name;
  final double size;
  const _Avatar({required this.name, required this.size});

  @override
  Widget build(BuildContext context) {
    final brand = _colorFor(name);
    final initials = _initials(name);
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: brand,
        borderRadius: BorderRadius.circular(size * 0.28),
      ),
      child: Text(
        initials,
        style: RunqText.bodyStrong.copyWith(
          color: Colors.white,
          fontSize: size * 0.36,
          letterSpacing: 0.02 * size * 0.36,
        ),
      ),
    );
  }
}

const _bankColors = <String, Color>{
  'cash':  Color(0xFF65574A),
  'petty': Color(0xFF65574A),
};

Color _colorFor(String name) {
  final s = name.toLowerCase();
  for (final entry in _bankColors.entries) {
    if (s.contains(entry.key)) return entry.value;
  }
  // Hash-based fallback so unknown banks still get a stable distinct color.
  final hashHues = [232, 12, 156, 268, 38, 198, 88];
  final code = s.isEmpty ? 65 : s.codeUnitAt(0) + (s.length > 1 ? s.codeUnitAt(1) : 0);
  return HSLColor.fromAHSL(1.0, hashHues[code % hashHues.length].toDouble(), 0.55, 0.42).toColor();
}

String _initials(String name) {
  final s = name.trim();
  if (s.isEmpty) return '?';
  final parts = s.split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return s.substring(0, 1).toUpperCase();
  if (parts.length == 1) return parts[0].substring(0, parts[0].length >= 2 ? 2 : 1).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
