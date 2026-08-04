import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'runq_tokens.dart';

/// System-bar styles that carry icon brightness and nothing else.
///
/// Every colour field on [SystemUiOverlayStyle] — `statusBarColor`,
/// `systemNavigationBarColor`, `systemNavigationBarDividerColor`,
/// `systemNavigationBarContrastEnforced` — routes to a `Window` setter that
/// Android deprecated in API 35 and ignores under edge-to-edge, which is what
/// Play Console reports as "uses deprecated APIs or parameters for edge-to-edge".
/// Brightness maps to `WindowInsetsController.setSystemBarsAppearance`, which
/// is current. Flutter's own `SystemUiOverlayStyle.light`/`.dark` constants set
/// a black nav bar, so prefer these instead of those.
class RunqSystemBars {
  /// Light icons — for a dark background behind the bars.
  static const lightIcons = SystemUiOverlayStyle(
    statusBarIconBrightness: Brightness.light,
    statusBarBrightness: Brightness.dark,
    systemNavigationBarIconBrightness: Brightness.light,
  );

  /// Dark icons — for a light background behind the bars.
  static const darkIcons = SystemUiOverlayStyle(
    statusBarIconBrightness: Brightness.dark,
    statusBarBrightness: Brightness.light,
    systemNavigationBarIconBrightness: Brightness.dark,
  );

  static SystemUiOverlayStyle forBrightness(Brightness b) =>
      b == Brightness.dark ? lightIcons : darkIcons;
}

class RunqText {
  // Color is intentionally omitted so each style inherits the theme's
  // textTheme color. Sites that want a brand-fixed color (white on indigo,
  // status pill ink) override via copyWith(color: ...).
  static TextStyle display = GoogleFonts.publicSans(
    fontSize: 34, fontWeight: FontWeight.w700, height: 1.05,
    letterSpacing: -0.02 * 34,
    fontFeatures: const [FontFeature.tabularFigures()],
  );
  static TextStyle h1 = GoogleFonts.publicSans(
    fontSize: 28, fontWeight: FontWeight.w700, height: 1.1,
    fontFeatures: const [FontFeature.tabularFigures()],
  );
  static TextStyle h2 = GoogleFonts.publicSans(fontSize: 22, fontWeight: FontWeight.w700, height: 1.15);
  static TextStyle h3 = GoogleFonts.publicSans(fontSize: 18, fontWeight: FontWeight.w600, height: 1.2);
  static TextStyle h4 = GoogleFonts.publicSans(fontSize: 16, fontWeight: FontWeight.w600, height: 1.25);
  static TextStyle numberLg = GoogleFonts.publicSans(
    fontSize: 24, fontWeight: FontWeight.w700, height: 1.2,
    fontFeatures: const [FontFeature.tabularFigures()],
  );
  static TextStyle body = GoogleFonts.publicSans(fontSize: 15, fontWeight: FontWeight.w500, height: 1.4);
  static TextStyle bodyStrong = GoogleFonts.publicSans(fontSize: 15, fontWeight: FontWeight.w600, height: 1.4);
  static TextStyle caption = GoogleFonts.publicSans(fontSize: 12, fontWeight: FontWeight.w500, height: 1.35);
  static TextStyle label = GoogleFonts.publicSans(
    fontSize: 11, fontWeight: FontWeight.w600, height: 1.3,
    letterSpacing: 0.04 * 11,
  );
  static TextStyle micro = GoogleFonts.publicSans(
    fontSize: 10, fontWeight: FontWeight.w700, height: 1.2,
    letterSpacing: 0.06 * 10,
  );
  static TextStyle tabular({double size = 14, FontWeight w = FontWeight.w600, Color? color}) =>
      GoogleFonts.publicSans(
        fontSize: size, fontWeight: w, color: color,
        fontFeatures: const [FontFeature.tabularFigures()],
      );
}

class RunqTheme {
  static ThemeData light() => _build(Brightness.light);
  static ThemeData dark() => _build(Brightness.dark);

  static ThemeData _build(Brightness brightness) {
    final isDark = brightness == Brightness.dark;
    final tokens = isDark ? RunqTokens.dark : RunqTokens.light;
    final scheme = ColorScheme.fromSeed(seedColor: RunqColors.indigo, brightness: brightness).copyWith(
      primary: RunqColors.indigo,
      secondary: RunqColors.accent,
      surface: tokens.surface,
      onSurface: tokens.ink,
    );
    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      scaffoldBackgroundColor: tokens.bgWarm,
      textTheme: GoogleFonts.publicSansTextTheme().apply(
        bodyColor: tokens.ink,
        displayColor: tokens.ink,
      ),
      splashColor: RunqColors.indigo.withValues(alpha: 0.06),
      highlightColor: RunqColors.indigo.withValues(alpha: 0.04),
      iconTheme: IconThemeData(color: tokens.ink, size: 22),
      appBarTheme: AppBarTheme(
        backgroundColor: tokens.bgWarm,
        elevation: 0,
        scrolledUnderElevation: 0,
        surfaceTintColor: Colors.transparent,
        titleTextStyle: RunqText.h2.copyWith(color: tokens.ink),
        iconTheme: IconThemeData(color: tokens.ink),
        centerTitle: false,
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: RunqColors.indigo,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          textStyle: RunqText.bodyStrong,
        ),
      ),
      extensions: <ThemeExtension<dynamic>>[tokens],
    );
  }
}
