import 'package:flutter/material.dart';
import '../theme/dhenu_tokens.dart';

/// A proportional segment of a [BreakdownBar].
class BreakdownSegment {
  const BreakdownSegment(this.value, this.color);
  final double value;
  final Color color;
}

/// Horizontal segmented bar (payment breakdown): a pill split into colored
/// segments sized by value. Zero/negative segments are dropped.
class BreakdownBar extends StatelessWidget {
  const BreakdownBar({super.key, required this.segments, this.height = 10});

  final List<BreakdownSegment> segments;
  final double height;

  @override
  Widget build(BuildContext context) {
    final visible = segments.where((s) => s.value > 0).toList();
    final t = DT(context);
    return ClipRRect(
      borderRadius: BorderRadius.circular(DhenuRadii.pill),
      child: SizedBox(
        height: height,
        child: visible.isEmpty
            ? ColoredBox(color: t.hairline)
            : Row(
                children: [
                  for (final s in visible)
                    Expanded(
                      flex: (s.value * 1000).round().clamp(1, 1 << 30),
                      child: ColoredBox(color: s.color),
                    ),
                ],
              ),
      ),
    );
  }
}
