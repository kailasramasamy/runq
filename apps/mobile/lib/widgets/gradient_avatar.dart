import 'package:flutter/material.dart';
import '../theme/runq_tokens.dart';
import '../theme/runq_theme.dart';

/// Indigo→purple gradient avatar tile with white initials. Matches the
/// "Owner" brand-feel mark used on the dashboard header (36px) and the
/// profile hero (64px). Initials follow the customer/vendor convention:
/// first letter of first word + first letter of last word, uppercased.
class GradientAvatar extends StatelessWidget {
  final String name;
  final double size;
  /// Visual notch indicating presence. Decorative only — exclude from
  /// semantics on the parent.
  final bool showOnlineDot;
  final Color? onlineDotBorderColor;

  const GradientAvatar({
    super.key,
    required this.name,
    this.size = 36,
    this.showOnlineDot = false,
    this.onlineDotBorderColor,
  });

  String get _initials {
    final n = name.trim();
    if (n.isEmpty) return '?';
    final parts = n.split(RegExp(r'\s+')).where((s) => s.isNotEmpty).toList();
    if (parts.length == 1) {
      final p = parts.first;
      return p.length >= 2
          ? p.substring(0, 2).toUpperCase()
          : p.toUpperCase();
    }
    return (parts.first[0] + parts.last[0]).toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final radius = size <= 36 ? 12.0 : 18.0;
    final fontSize = size <= 36 ? 12.0 : 22.0;
    final shadowOpacity = size <= 36 ? 0.30 : 0.35;
    final shadowBlur = size <= 36 ? 6.0 : 18.0;
    final shadowOffsetY = size <= 36 ? 2.0 : 6.0;

    final tile = Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [RunqColors.indigo, RunqColors.accent],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(radius),
        boxShadow: [
          BoxShadow(
            color: RunqColors.indigo.withValues(alpha: shadowOpacity),
            blurRadius: shadowBlur,
            offset: Offset(0, shadowOffsetY),
          ),
        ],
      ),
      alignment: Alignment.center,
      child: Text(
        _initials,
        style: RunqText.bodyStrong.copyWith(
          color: Colors.white,
          fontSize: fontSize,
          letterSpacing: 0.02 * fontSize,
          fontWeight: FontWeight.w700,
        ),
      ),
    );

    if (!showOnlineDot) return tile;

    final t = RT(context);
    final dotBorder = onlineDotBorderColor ?? t.bgWarmer;
    return SizedBox(
      width: size + 6,
      height: size + 6,
      child: Stack(
        children: [
          Positioned(left: 0, top: 0, child: tile),
          Positioned(
            right: 0,
            bottom: 0,
            child: Container(
              width: 18,
              height: 18,
              decoration: BoxDecoration(
                color: const Color(0xFF16A34A),
                shape: BoxShape.circle,
                border: Border.all(color: dotBorder, width: 2.5),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
