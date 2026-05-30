// Manufacturing module brand palette. Rose — chosen to read as
// "production / heat / output" and to stay visually distinct from
// the Finance indigo, HR teal, Inventory amber, and Purchase violet.
// Mirrors `PurColors` (same shape; same accessor contract).
//
// When you need a theme-aware brand colour (dark mode wants the lighter
// rose for AA contrast on dark surfaces), use `MfgColors.brand(context)`.

library;

import 'package:flutter/material.dart';

class MfgColors {
  /// Primary manufacturing brand — saturated rose. Use for solid-fill
  /// buttons, gradient strokes, and any surface paired with dark text.
  static const rose = Color(0xFFE11D48);

  /// Darker rose for gradient depth and hovered/pressed states.
  static const roseDeep = Color(0xFFBE123C);

  /// Even darker — used at the start of hero gradients.
  static const roseDarkest = Color(0xFF9F1239);

  /// Lighter rose — for text/icon contexts on dark surfaces.
  static const roseLight = Color(0xFFFDA4AF);

  /// 10% rose wash — backgrounds for active pills, suggestion chips,
  /// inline helper banners. Always layer over `t.surface`.
  static Color get roseSubtle => rose.withValues(alpha: 0.10);

  /// Stronger rose wash for tinted KPI / summary cards — reads as the
  /// manufacturing brand at a glance without losing text contrast.
  static Color get roseTint => rose.withValues(alpha: 0.16);

  /// Rose hairline for tinted cards — matches [roseTint].
  static Color get roseHairline => rose.withValues(alpha: 0.32);

  /// Gradient anchors for hero cards (WO header, dashboard KPI strip).
  static const heroGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF9F1239), Color(0xFFF43F5E)],
  );

  /// Deeper variant for headers that sit on long pages.
  static const profileGradient = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [Color(0xFF9F1239), Color(0xFFE11D48)],
  );

  /// Theme-aware brand colour for text/icon contexts. Returns the
  /// saturated rose in light mode, [roseLight] in dark mode so AA
  /// contrast holds on dark surfaces.
  static Color brand(BuildContext context) =>
      Theme.of(context).brightness == Brightness.dark ? roseLight : rose;

  // ── Status palette ──────────────────────────────────────────────────────
  // Paired bg/fg tokens used by StatusPill, UrgencyPill, and inline status
  // chips across the manufacturing module.

  static const success = Color(0xFF16A34A);
  static Color get successBg => success.withValues(alpha: 0.10);

  static const error = Color(0xFFDC2626);
  static Color get errorBg => error.withValues(alpha: 0.10);

  static const info = Color(0xFF2563EB);
  static Color get infoBg => info.withValues(alpha: 0.10);

  /// Pre-warning urgency — sits between rose and red.
  static const orangeAlert = Color(0xFFEA580C);
  static Color get orangeAlertBg => orangeAlert.withValues(alpha: 0.10);
}
