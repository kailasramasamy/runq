import 'package:flutter/material.dart';
import '../theme/runq_theme.dart';

class RqAvatar extends StatelessWidget {
  final String name;
  final String? short;
  final double size;
  final bool square;
  const RqAvatar({super.key, required this.name, this.short, this.size = 36, this.square = false});

  Color _hueColor(double l, double c) {
    final s = short ?? name;
    final code = s.isEmpty ? 65 : s.codeUnitAt(0) + (s.length > 1 ? s.codeUnitAt(1) : 0);
    final hues = [232, 12, 156, 268, 38, 198, 88];
    final h = hues[code % hues.length];
    return _oklchApprox(l, c, h);
  }

  // Approximate OKLCH→RGB by mapping hue to HSL with adjusted lightness.
  Color _oklchApprox(double l, double c, int h) {
    final hsl = HSLColor.fromAHSL(1.0, h.toDouble(), c * 2, l);
    return hsl.toColor();
  }

  String get _initials {
    final s = (short ?? name).trim();
    if (s.isEmpty) return '?';
    return s.length >= 2 ? s.substring(0, 2).toUpperCase() : s.toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    // Light: pale tinted bg + dark tinted text.
    // Dark:  deep tinted bg + light tinted text.
    final bg = isDark ? _hueColor(0.22, 0.06) : _hueColor(0.94, 0.04);
    final fg = isDark ? _hueColor(0.82, 0.10) : _hueColor(0.40, 0.13);
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(square ? 8 : size / 2),
      ),
      child: Text(
        _initials,
        style: RunqText.bodyStrong.copyWith(
          color: fg,
          fontSize: size * 0.36,
          letterSpacing: 0.01 * size * 0.36,
        ),
      ),
    );
  }
}
