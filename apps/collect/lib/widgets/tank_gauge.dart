import 'package:flutter/material.dart';
import '../theme/dhenu_tokens.dart';
import '../theme/dhenu_theme.dart';

/// Horizontal capacity fill bar for BMC / chilling / tanker capacity.
/// Shows "428 / 1000 L" above a rounded track.
/// Fill uses mint (DhenuColors.accent), turns gradeC if >100%.
class TankGauge extends StatelessWidget {
  const TankGauge({
    super.key,
    required this.current,
    required this.capacity,
    this.label,
  });

  final double current;
  final double capacity;

  /// Optional label shown below the numbers (e.g. "BMC Capacity").
  final String? label;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final hasBar = capacity > 0;
    final fill = hasBar ? (current / capacity).clamp(0.0, 1.5) : 0.0;
    final isOverflow = hasBar && current > capacity;
    final fillColor = isOverflow ? t.gradeC : DhenuColors.accent;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          children: [
            Text(
              _fmt(current),
              style: DhenuText.number(size: 18, color: t.ink),
            ),
            Text(
              ' / ${_fmt(capacity)} L',
              style: DhenuText.body.copyWith(color: t.inkSoft),
            ),
          ],
        ),
        if (label != null) ...[
          Text(label!, style: DhenuText.caption.copyWith(color: t.inkSoft)),
          const SizedBox(height: DhenuSpacing.sm),
        ] else
          const SizedBox(height: DhenuSpacing.sm),
        if (hasBar)
          LayoutBuilder(
            builder: (context, constraints) {
              final trackWidth = constraints.maxWidth;
              final barWidth = (trackWidth * (fill / 1.5).clamp(0.0, 1.0));
              return Container(
                height: 10,
                width: trackWidth,
                decoration: BoxDecoration(
                  color: t.hairline,
                  borderRadius: BorderRadius.circular(DhenuRadii.pill),
                ),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 400),
                    curve: Curves.easeOut,
                    width: barWidth,
                    decoration: BoxDecoration(
                      color: fillColor,
                      borderRadius: BorderRadius.circular(DhenuRadii.pill),
                    ),
                  ),
                ),
              );
            },
          ),
      ],
    );
  }

  static String _fmt(double v) {
    if (v == v.truncateToDouble()) return v.toInt().toString();
    return v.toStringAsFixed(1);
  }
}
