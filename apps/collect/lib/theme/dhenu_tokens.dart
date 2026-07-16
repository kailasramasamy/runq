import 'package:flutter/material.dart';

/// Dhenu design tokens — a direct translation of `docs/dhenu-design-spec.md` §2.
///
/// This is Dhenu's OWN visual language (emerald + AM/PM + quality semantics),
/// deliberately NOT the runq ERP theme. Theme-aware code reads tokens via
/// `DT(context).<token>` so every colour flips correctly in dark mode
/// (per `feedback_dark_mode_support`). The const colours below are for
/// const decorations outside a build context only.
class DhenuColors {
  // Brand — emerald (agri trust, fresh). §2.1
  static const brand = Color(0xFF0F7A5A);
  static const brandDark = Color(0xFF2BAE85); // brand in dark mode
  static const brandPressed = Color(0xFF0B5E45);
  static const brandPressedDark = Color(0xFF1E8A68);
  static const accent = Color(0xFF3DDC97); // mint — active/highlight/progress

  // Shift semantics — ALWAYS amber (AM) / violet (PM) everywhere. §2.1
  static const am = Color(0xFFF5A524);
  static const amDark = Color(0xFFF7B64A);
  // Deeper amber for *small AM text* only (AA contrast on white); fills/bars
  // keep [am]. See handoff "Changes from current build".
  static const amDeep = Color(0xFFE0901A);
  static const pm = Color(0xFF6D5BD0);
  static const pmDark = Color(0xFF8C7BEA);

  // Quality / money semantics — green = good/money-in, red = deduction/poor. §2.1
  static const gradeA = Color(0xFF16A34A);
  static const gradeADark = Color(0xFF34D17B);
  /// Ink for text sitting ON the fixed amber gradient (both modes).
  static const amInk = Color(0xFF4A3300);
  static const gradeB = Color(0xFFF59E0B);
  static const gradeBDark = Color(0xFFFBBF4A);
  static const gradeC = Color(0xFFDC2626);
  static const gradeCDark = Color(0xFFF26A6A);
}

/// Theme-flipping token set. Use `DT(context).ink` etc.
class DhenuTokens extends ThemeExtension<DhenuTokens> {
  final Color surface; // app background (warm milk-white / warm near-black)
  final Color card; // cards, sheets
  final Color ink; // primary text/numbers
  final Color inkSoft; // secondary text
  final Color hairline; // borders, dividers
  final Color inputFill;

  /// Brand colour tuned for the active brightness (lighter in dark for AA).
  final Color brand;
  final Color brandPressed;

  /// Shift colours for the active brightness.
  final Color am;
  /// Deeper AM tone for small text (AA on light); `am` is for fills/bars.
  final Color amText;
  final Color pm;

  /// Quality colours for the active brightness.
  final Color gradeA;
  final Color gradeB;
  final Color gradeC;

  const DhenuTokens({
    required this.surface,
    required this.card,
    required this.ink,
    required this.inkSoft,
    required this.hairline,
    required this.inputFill,
    required this.brand,
    required this.brandPressed,
    required this.am,
    required this.amText,
    required this.pm,
    required this.gradeA,
    required this.gradeB,
    required this.gradeC,
  });

  static const light = DhenuTokens(
    surface: Color(0xFFFBFAF6),
    card: Color(0xFFFFFFFF),
    ink: Color(0xFF1A1D1A),
    inkSoft: Color(0xFF5B635C),
    hairline: Color(0xFFE9E7DF),
    inputFill: Color(0xFFFFFFFF),
    brand: DhenuColors.brand,
    brandPressed: DhenuColors.brandPressed,
    am: DhenuColors.am,
    amText: DhenuColors.amDeep,
    pm: DhenuColors.pm,
    gradeA: DhenuColors.gradeA,
    gradeB: DhenuColors.gradeB,
    gradeC: DhenuColors.gradeC,
  );

  static const dark = DhenuTokens(
    surface: Color(0xFF14150F),
    card: Color(0xFF1E201A),
    ink: Color(0xFFF2F3EE),
    inkSoft: Color(0xFFA6ADA4),
    hairline: Color(0xFF2C2F28),
    inputFill: Color(0xFF26241F),
    brand: DhenuColors.brandDark,
    brandPressed: DhenuColors.brandPressedDark,
    am: DhenuColors.amDark,
    amText: DhenuColors.amDark,
    pm: DhenuColors.pmDark,
    gradeA: DhenuColors.gradeADark,
    gradeB: DhenuColors.gradeBDark,
    gradeC: DhenuColors.gradeCDark,
  );

  /// Faint brand fill for badges / focus rings / selected states.
  Color get brandSubtle => brand.withValues(alpha: 0.12);

  @override
  DhenuTokens copyWith({
    Color? surface,
    Color? card,
    Color? ink,
    Color? inkSoft,
    Color? hairline,
    Color? inputFill,
    Color? brand,
    Color? brandPressed,
    Color? am,
    Color? amText,
    Color? pm,
    Color? gradeA,
    Color? gradeB,
    Color? gradeC,
  }) =>
      DhenuTokens(
        surface: surface ?? this.surface,
        card: card ?? this.card,
        ink: ink ?? this.ink,
        inkSoft: inkSoft ?? this.inkSoft,
        hairline: hairline ?? this.hairline,
        inputFill: inputFill ?? this.inputFill,
        brand: brand ?? this.brand,
        brandPressed: brandPressed ?? this.brandPressed,
        am: am ?? this.am,
        amText: amText ?? this.amText,
        pm: pm ?? this.pm,
        gradeA: gradeA ?? this.gradeA,
        gradeB: gradeB ?? this.gradeB,
        gradeC: gradeC ?? this.gradeC,
      );

  @override
  DhenuTokens lerp(ThemeExtension<DhenuTokens>? other, double t) {
    if (other is! DhenuTokens) return this;
    return DhenuTokens(
      surface: Color.lerp(surface, other.surface, t)!,
      card: Color.lerp(card, other.card, t)!,
      ink: Color.lerp(ink, other.ink, t)!,
      inkSoft: Color.lerp(inkSoft, other.inkSoft, t)!,
      hairline: Color.lerp(hairline, other.hairline, t)!,
      inputFill: Color.lerp(inputFill, other.inputFill, t)!,
      brand: Color.lerp(brand, other.brand, t)!,
      brandPressed: Color.lerp(brandPressed, other.brandPressed, t)!,
      am: Color.lerp(am, other.am, t)!,
      amText: Color.lerp(amText, other.amText, t)!,
      pm: Color.lerp(pm, other.pm, t)!,
      gradeA: Color.lerp(gradeA, other.gradeA, t)!,
      gradeB: Color.lerp(gradeB, other.gradeB, t)!,
      gradeC: Color.lerp(gradeC, other.gradeC, t)!,
    );
  }
}

/// Shorthand: `DT(context).ink` → token in the active theme.
// ignore: non_constant_identifier_names
DhenuTokens DT(BuildContext context) =>
    Theme.of(context).extension<DhenuTokens>() ?? DhenuTokens.light;

/// Spacing scale — 4px base. Screen padding 20, min tap target 56. §2.3
class DhenuSpacing {
  static const xs = 4.0;
  static const sm = 8.0;
  static const md = 12.0;
  static const lg = 16.0;
  static const xl = 20.0; // screen padding
  static const xxl = 24.0;
  static const x3 = 32.0;
  static const x4 = 40.0;
  static const screen = 20.0;
  static const minTap = 56.0;
  /// Bottom clearance under scrollable content so the last row clears a
  /// floating action button / bottom action bar.
  static const bottomGap = 80.0;
}

/// Radius scale. §2.3
class DhenuRadii {
  static const card = 20.0;
  static const cardLg = 24.0; // hero / net-payable cards
  static const button = 16.0;
  static const input = 14.0;
  static const pill = 999.0;
  static const sheet = 28.0;
}

/// Soft, low ambient elevation — one shadow, no harsh Material drops. §2.3
class DhenuShadows {
  static const card = <BoxShadow>[
    BoxShadow(color: Color(0x14000000), blurRadius: 16, offset: Offset(0, 4)),
  ];
  static const sheet = <BoxShadow>[
    BoxShadow(color: Color(0x33000000), blurRadius: 40, offset: Offset(0, 12)),
  ];
  /// Brand-tinted lift for the emerald hero / referral cards. rgba(12,90,65,.32)
  static const brand = <BoxShadow>[
    BoxShadow(color: Color(0x520C5A41), blurRadius: 30, offset: Offset(0, 14)),
  ];
}
