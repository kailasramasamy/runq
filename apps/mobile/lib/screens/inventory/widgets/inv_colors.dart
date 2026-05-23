// Inventory module brand palette. Amber — chosen to read as "warehouse
// floor / physical stock" and to stay visually distinct from the Finance
// indigo and HR teal. Mirrors `HrColors`.
//
// When you need a theme-aware read (dark mode wants a lighter amber for
// AA contrast on dark surfaces), use `InvColors.brand(context)`.

library;

import 'package:flutter/material.dart';

class InvColors {
  /// Primary inventory brand — saturated amber. Use for solid-fill
  /// buttons, gradient strokes, and any surface paired with dark text.
  static const amber = Color(0xFFD97706);

  /// Darker amber for gradient depth and hovered/pressed states.
  static const amberDeep = Color(0xFFB45309);

  /// Even darker — used at the start of hero gradients.
  static const amberDarkest = Color(0xFF92400E);

  /// Lighter amber — for text/icon contexts on dark surfaces.
  static const amberLight = Color(0xFFFCD34D);

  /// 10% amber wash — backgrounds for active pills, suggestion chips,
  /// inline helper banners. Always layer over `t.surface`.
  static Color get amberSubtle => amber.withValues(alpha: 0.10);

  /// Gradient anchors for hero cards (KPI strip, stock-value tiles).
  static const heroGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFFB45309), Color(0xFFF59E0B)],
  );

  /// Deeper variant for headers that sit on long pages.
  static const profileGradient = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [Color(0xFF92400E), Color(0xFFB45309)],
  );

  /// Theme-aware brand colour for text/icon contexts. Returns the
  /// saturated amber in light mode, [amberLight] in dark mode so AA
  /// contrast holds on dark surfaces.
  static Color brand(BuildContext context) =>
      Theme.of(context).brightness == Brightness.dark ? amberLight : amber;
}
