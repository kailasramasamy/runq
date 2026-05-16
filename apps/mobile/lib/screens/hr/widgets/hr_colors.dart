// HR module brand palette. Distinct from Finance indigo so HR feels like
// its own surface while still living inside the same app shell. Used
// instead of `RunqColors.indigo` everywhere inside `lib/screens/hr/*`.
//
// When you need a theme-aware read (e.g. dark mode needs a lighter teal
// for AA contrast on dark surfaces), use `HrColors.brand(context)` —
// `HrColors.teal` itself is the saturated brand colour suited for
// solid-fill buttons and gradients (paired with white text).

library;

import 'package:flutter/material.dart';

class HrColors {
  /// Primary HR brand — saturated teal. Use for solid-fill buttons,
  /// gradient strokes, and any surface that pairs with white text.
  static const teal = Color(0xFF0891B2);

  /// Darker teal for gradient depth and hovered/pressed states.
  static const tealDeep = Color(0xFF155E75);

  /// Even darker teal — used at the start of hero gradients for the
  /// "deep" anchor before fading toward [teal].
  static const tealDarkest = Color(0xFF164E63);

  /// Lighter teal — text/icon variant for dark mode where the saturated
  /// teal fails AA contrast on dark surfaces.
  static const tealLight = Color(0xFF67E8F9);

  /// 10% teal wash — backgrounds for active pills, suggestion chips,
  /// inline helper banners. Always layer over `t.surface`.
  static Color get tealSubtle => teal.withValues(alpha: 0.10);

  /// Gradient anchors for hero cards (payslip net pay, holiday card,
  /// payroll summary). Cyan→teal reads as fresh + on-brand.
  static const heroGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF0E7490), Color(0xFF06B6D4)],
  );

  /// Deeper variant — used for the employee-detail profile header where
  /// the gradient sits on top of a longer page and needs more weight.
  static const profileGradient = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [Color(0xFF164E63), Color(0xFF0E7490)],
  );

  /// Theme-aware brand colour for text/icon contexts. Returns the
  /// saturated teal in light mode, [tealLight] in dark mode so AA
  /// contrast holds on dark surfaces.
  static Color brand(BuildContext context) =>
      Theme.of(context).brightness == Brightness.dark ? tealLight : teal;
}
