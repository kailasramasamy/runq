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

  /// Stronger amber wash for tinted KPI / summary cards — reads as the
  /// inventory brand at a glance without losing text contrast.
  static Color get amberTint => amber.withValues(alpha: 0.16);

  /// Amber hairline for tinted cards — matches [amberTint].
  static Color get amberHairline => amber.withValues(alpha: 0.32);

  /// Gradient anchors for hero cards (KPI strip, stock-value tiles). Deep
  /// burnt-orange into brand amber: dark enough that white text and the
  /// translucent-white KPI tiles read cleanly, and that a solid red alert
  /// tile still stands out against it.
  static const heroGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF7C2D12), Color(0xFFD97706)],
  );

  /// Deeper variant for headers that sit on long pages.
  static const profileGradient = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [Color(0xFF92400E), Color(0xFFB45309)],
  );

  /// The module brand orange, used for every accent (icons, active tabs,
  /// focus rings, FAB). Kept the same [amber] in both light and dark mode so
  /// the whole module — including the hard-amber bottom nav, hero and FAB —
  /// reads as one consistent colour. (Context retained for call-site
  /// compatibility and any future per-theme tuning.)
  static Color brand(BuildContext context) => amber;

  // ── Status palette ──────────────────────────────────────────────────────
  // Paired bg/fg tokens used by StatusPill, UrgencyPill, and inline status
  // chips across the inventory module. Foreground colours are kept
  // saturated for legibility on the 10%-tint backgrounds. Re-using these
  // here (instead of leaning on RunqColors.greenBg / redBg etc) gives the
  // inventory pills consistent contrast — Tally-style cards have a lot of
  // small pills and we don't want each one mixing palettes.

  static const success = Color(0xFF16A34A);
  static Color get successBg => success.withValues(alpha: 0.10);

  static const error = Color(0xFFDC2626);
  static Color get errorBg => error.withValues(alpha: 0.10);

  static const info = Color(0xFF2563EB);
  static Color get infoBg => info.withValues(alpha: 0.10);

  /// Pre-warning urgency for low-stock badges — sits between amber and red.
  static const orangeAlert = Color(0xFFEA580C);
  static Color get orangeAlertBg => orangeAlert.withValues(alpha: 0.10);
}
