import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'dhenu_tokens.dart';

/// Dhenu type scale — spec §2.2. Inter (Latin) with tabular figures on for
/// every number; min body 16 for low-literacy legibility; numbers go big.
/// Colour is omitted so each style inherits the active theme's text colour —
/// sites that need brand-fixed colour (white on emerald) override via copyWith.
class DhenuText {
  static const _tabular = [FontFeature.tabularFigures()];

  /// The headline L / ₹ figure. 40 / 700 tabular.
  static TextStyle hero = GoogleFonts.inter(
    fontSize: 40, fontWeight: FontWeight.w700, height: 1.05, fontFeatures: _tabular,
  );

  /// Secondary big numbers. 32 / 700.
  static TextStyle display = GoogleFonts.inter(
    fontSize: 32, fontWeight: FontWeight.w700, height: 1.1, fontFeatures: _tabular,
  );

  /// Screen titles. 28 / 700.
  static TextStyle h1 = GoogleFonts.inter(fontSize: 28, fontWeight: FontWeight.w700, height: 1.1);

  /// Section heads. 22 / 600.
  static TextStyle h2 = GoogleFonts.inter(fontSize: 22, fontWeight: FontWeight.w600, height: 1.15);

  /// Card titles, list leads. 18 / 600.
  static TextStyle title = GoogleFonts.inter(fontSize: 18, fontWeight: FontWeight.w600, height: 1.2);

  /// Default text. 16 / 400.
  static TextStyle body = GoogleFonts.inter(fontSize: 16, fontWeight: FontWeight.w400, height: 1.4);

  /// Buttons, chips, captions-strong. 14 / 600.
  static TextStyle label = GoogleFonts.inter(fontSize: 14, fontWeight: FontWeight.w600, height: 1.3);

  /// Primary CTA label — kept at the 16 legibility floor for fat-target buttons.
  static TextStyle button = GoogleFonts.inter(fontSize: 16, fontWeight: FontWeight.w700, height: 1.2);

  /// Emoji glyphs (shift sun/moon etc) rendered as Text — sized via the scale.
  static TextStyle emoji = GoogleFonts.inter(fontSize: 18, height: 1.0);

  /// Timestamps, helper text. 12 / 500.
  static TextStyle caption = GoogleFonts.inter(fontSize: 12, fontWeight: FontWeight.w500, height: 1.35);

  /// A tabular number at an arbitrary size — for inline L / ₹ figures.
  static TextStyle number({double size = 16, FontWeight w = FontWeight.w700, Color? color}) =>
      GoogleFonts.inter(fontSize: size, fontWeight: w, color: color, fontFeatures: _tabular);
}

class DhenuTheme {
  static ThemeData light() => _build(Brightness.light);
  static ThemeData dark() => _build(Brightness.dark);

  static ThemeData _build(Brightness brightness) {
    final isDark = brightness == Brightness.dark;
    final t = isDark ? DhenuTokens.dark : DhenuTokens.light;
    final scheme = ColorScheme.fromSeed(
      seedColor: DhenuColors.brand,
      brightness: brightness,
    ).copyWith(
      primary: t.brand,
      secondary: DhenuColors.accent,
      surface: t.card,
      onSurface: t.ink,
    );
    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      scaffoldBackgroundColor: t.surface,
      textTheme: GoogleFonts.interTextTheme().apply(bodyColor: t.ink, displayColor: t.ink),
      splashColor: t.brand.withValues(alpha: 0.06),
      highlightColor: t.brand.withValues(alpha: 0.04),
      iconTheme: IconThemeData(color: t.ink, size: 24),
      appBarTheme: AppBarTheme(
        backgroundColor: t.surface,
        elevation: 0,
        scrolledUnderElevation: 0,
        surfaceTintColor: Colors.transparent,
        titleTextStyle: DhenuText.h2.copyWith(color: t.ink),
        iconTheme: IconThemeData(color: t.ink),
        centerTitle: false,
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: t.brand,
          foregroundColor: Colors.white,
          minimumSize: const Size.fromHeight(DhenuSpacing.minTap),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(DhenuRadii.button)),
          textStyle: DhenuText.button,
        ),
      ),
      // One filled, rounded, hairline-bordered look for every text field — so
      // screens never hand-roll an InputDecoration. Brand 2px focus ring, red
      // error border, comfortable padding for fat-finger field use.
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: t.inputFill,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.md + 2,
        ),
        hintStyle: DhenuText.body.copyWith(color: t.inkSoft),
        labelStyle: DhenuText.label.copyWith(color: t.inkSoft),
        floatingLabelStyle: DhenuText.label.copyWith(color: t.brand),
        suffixStyle: DhenuText.label.copyWith(color: t.inkSoft),
        prefixIconColor: t.inkSoft,
        suffixIconColor: t.inkSoft,
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(DhenuRadii.input),
          borderSide: BorderSide(color: t.hairline),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(DhenuRadii.input),
          borderSide: BorderSide(color: t.brand, width: 2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(DhenuRadii.input),
          borderSide: BorderSide(color: t.gradeC),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(DhenuRadii.input),
          borderSide: BorderSide(color: t.gradeC, width: 2),
        ),
        errorStyle: DhenuText.caption.copyWith(color: t.gradeC),
      ),
      extensions: <ThemeExtension<dynamic>>[t],
    );
  }
}
