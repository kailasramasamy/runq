// Compact title that fades into a collapsing SliverAppBar's toolbar row.
//
// The employee-detail hero carries the name at display size, but that sits
// well below the toolbar and is the first thing clipped as the header
// collapses — so a scrolled-down screen showed a bare teal bar with no
// indication of whose record was open. This fills that gap.
//
// Opacity is driven by `FlexibleSpaceBarSettings`, the inherited widget
// SliverAppBar publishes on every scroll frame, so there is no scroll
// controller to wire up or keep in sync. Placed inside the FlexibleSpaceBar's
// `background`, it rebuilds as the extent changes.

library;

import 'package:flutter/material.dart';
import '../../../theme/runq_theme.dart';

/// Fraction of the collapsible range over which the title fades in. It stays
/// fully transparent until the header is inside this band of its minimum
/// extent, so the title only appears once the hero's own name has gone.
const _kFadeBand = 0.35;

class HrCollapsingTitle extends StatelessWidget {
  final String title;

  /// Second line — the employee code, in practice. Omitted when blank.
  final String? subtitle;

  const HrCollapsingTitle({super.key, required this.title, this.subtitle});

  /// 0 when the header is fully expanded, 1 when fully collapsed. Returns 0
  /// outside a FlexibleSpaceBar (nothing to collapse against) and for a
  /// degenerate range, so the title simply never shows rather than flickering.
  static double opacityFor(FlexibleSpaceBarSettings? s) {
    if (s == null) return 0;
    final range = s.maxExtent - s.minExtent;
    if (range <= 0) return 0;
    final expanded = ((s.currentExtent - s.minExtent) / range).clamp(0.0, 1.0);
    return ((_kFadeBand - expanded) / _kFadeBand).clamp(0.0, 1.0);
  }

  @override
  Widget build(BuildContext context) {
    final settings =
        context.dependOnInheritedWidgetOfExactType<FlexibleSpaceBarSettings>();
    final opacity = opacityFor(settings);
    // Fully transparent means fully inert — an invisible title must not eat
    // taps meant for the hero behind it.
    if (opacity == 0) return const SizedBox.shrink();

    final sub = subtitle?.trim() ?? '';
    return Opacity(
      opacity: opacity,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: RunqText.bodyStrong.copyWith(color: Colors.white),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          if (sub.isNotEmpty)
            Text(
              sub,
              style: RunqText.caption
                  .copyWith(color: Colors.white.withValues(alpha: 0.75)),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
        ],
      ),
    );
  }
}
