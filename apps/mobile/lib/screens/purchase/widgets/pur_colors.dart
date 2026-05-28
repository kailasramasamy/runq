// Purchase & Procurement module brand palette. Violet — chosen to read as
// "formal / contracts / procurement" and to stay visually distinct from
// the Finance indigo, HR teal, and Inventory amber. Mirrors `InvColors`
// (same shape; same accessor contract).
//
// When you need a theme-aware brand colour (dark mode wants the lighter
// violet for AA contrast on dark surfaces), use `PurColors.brand(context)`.

library;

import 'package:flutter/material.dart';

class PurColors {
  /// Primary procurement brand — saturated violet. Use for solid-fill
  /// buttons, gradient strokes, and any surface paired with dark text.
  static const violet = Color(0xFF7C3AED);

  /// Darker violet for gradient depth and hovered/pressed states.
  static const violetDeep = Color(0xFF6D28D9);

  /// Even darker — used at the start of hero gradients.
  static const violetDarkest = Color(0xFF5B21B6);

  /// Lighter violet — for text/icon contexts on dark surfaces.
  static const violetLight = Color(0xFFC4B5FD);

  /// 10% violet wash — backgrounds for active pills, suggestion chips,
  /// inline helper banners. Always layer over `t.surface`.
  static Color get violetSubtle => violet.withValues(alpha: 0.10);

  /// Stronger violet wash for tinted KPI / summary cards — reads as the
  /// procurement brand at a glance without losing text contrast.
  static Color get violetTint => violet.withValues(alpha: 0.16);

  /// Violet hairline for tinted cards — matches [violetTint].
  static Color get violetHairline => violet.withValues(alpha: 0.32);

  /// Gradient anchors for hero cards (PO header, dashboard KPI strip).
  static const heroGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF5B21B6), Color(0xFF8B5CF6)],
  );

  /// Deeper variant for headers that sit on long pages.
  static const profileGradient = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [Color(0xFF5B21B6), Color(0xFF7C3AED)],
  );

  /// Theme-aware brand colour for text/icon contexts. Returns the
  /// saturated violet in light mode, [violetLight] in dark mode so AA
  /// contrast holds on dark surfaces.
  static Color brand(BuildContext context) =>
      Theme.of(context).brightness == Brightness.dark ? violetLight : violet;

  // ── Status palette ──────────────────────────────────────────────────────
  // Paired bg/fg tokens used by StatusPill, UrgencyPill, and inline status
  // chips across the procurement module. Foreground colours are kept
  // saturated for legibility on the 10%-tint backgrounds. Re-using these
  // here (instead of leaning on RunqColors.greenBg / redBg etc) gives the
  // procurement pills consistent contrast — PO/GRN/match docs carry a lot
  // of small pills and we don't want each one mixing palettes.

  static const success = Color(0xFF16A34A);
  static Color get successBg => success.withValues(alpha: 0.10);

  static const error = Color(0xFFDC2626);
  static Color get errorBg => error.withValues(alpha: 0.10);

  static const info = Color(0xFF2563EB);
  static Color get infoBg => info.withValues(alpha: 0.10);

  /// Pre-warning urgency for partial-receipt / partial-match badges — sits
  /// between violet and red. Mirrors Inventory's `orangeAlert`.
  static const orangeAlert = Color(0xFFEA580C);
  static Color get orangeAlertBg => orangeAlert.withValues(alpha: 0.10);
}
