import 'package:flutter/material.dart';

class RunqColors {
  static const indigo = Color(0xFF4F46E5);
  static const indigoDeep = Color(0xFF3730A3);
  static const indigoDarkest = Color(0xFF1E1B4B);
  static const indigoDeep2 = Color(0xFF312E81);
  static const indigoLight = Color(0xFFA5B4FC);
  static const accent = Color(0xFF7C3AED);

  // Light tokens — kept as constants for any const decoration/style outside a build context.
  // Theme-aware code should use `RT(context).<token>` so it flips in dark mode.
  static const ink = Color(0xFF1A1714);
  static const ink2 = Color(0xFF3F3A33);
  static const muted = Color(0xFF7B7468);
  static const muted2 = Color(0xFF9C9489);
  static const bgWarm = Color(0xFFF7F5F1);
  static const bgWarmer = Color(0xFFECE9E2);
  static const surface = Color(0xFFFFFFFF);
  static const hairline = Color(0x14141210);
  static const hairlineSoft = Color(0x0F141210);

  // Status (designed pairs — kept for both themes)
  static const greenBg = Color(0xFFD1FAE5);
  static const greenInk = Color(0xFF047857);
  static const amberBg = Color(0xFFFEF3C7);
  static const amberInk = Color(0xFF92400E);
  static const redBg = Color(0xFFFEE2E2);
  static const redInk = Color(0xFFB91C1C);
  static const blueBg = Color(0xFFDBEAFE);
  static const blueInk = Color(0xFF1E40AF);
  static const purpleBg = Color(0xFFEDE9FE);
  static const purpleInk = Color(0xFF5B21B6);
  static const grayBg = Color(0xFFF3F4F6);
  static const grayInk = Color(0xFF6B7280);

  static const whatsapp = Color(0xFF25D366);

  static const heroGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [indigoDarkest, indigoDeep2, indigoDeep],
    stops: [0, 0.6, 1],
  );

  static const overdueGradient = LinearGradient(
    begin: Alignment(-0.7, -1),
    end: Alignment(0.7, 1),
    colors: [Color(0xFFFEF3C7), Color(0xFFFDE68A)],
  );

  static const saveGradient = LinearGradient(
    begin: Alignment(-0.7, -1),
    end: Alignment(0.7, 1),
    colors: [Color(0xFFEDE9FE), Color(0xFFDDD6FE)],
  );

  static const gstGradient = LinearGradient(
    begin: Alignment(-0.7, -1),
    end: Alignment(0.7, 1),
    colors: [Color(0xFFECFDF5), Color(0xFFD1FAE5)],
  );

  static const cashCardGradient = LinearGradient(
    begin: Alignment(-0.7, -1),
    end: Alignment(0.7, 1),
    colors: [indigoDarkest, indigoDeep2],
  );
}

class RunqTokens extends ThemeExtension<RunqTokens> {
  final Color bgWarm, bgWarmer, surface, ink, ink2, muted, muted2, hairline, hairlineSoft, inputFill;
  /// Brand colour for text / icons / loading indicators / selected states. In
  /// dark mode this is intentionally LIGHTER than [RunqColors.indigo] to keep
  /// AA contrast against dark backgrounds — using #4F46E5 there fails WCAG
  /// and feels muddy. Use the raw [RunqColors.indigo] for filled buttons and
  /// hero panels (they pair white text with the saturated brand).
  final Color brand;
  /// Faint fill of the brand colour for badge backgrounds, focus rings, etc.
  final Color brandSubtle;
  const RunqTokens({
    required this.bgWarm,
    required this.bgWarmer,
    required this.surface,
    required this.ink,
    required this.ink2,
    required this.muted,
    required this.muted2,
    required this.hairline,
    required this.hairlineSoft,
    required this.inputFill,
    required this.brand,
    required this.brandSubtle,
  });

  static const light = RunqTokens(
    bgWarm: Color(0xFFF7F5F1),
    bgWarmer: Color(0xFFECE9E2),
    surface: Color(0xFFFFFFFF),
    ink: Color(0xFF1A1714),
    ink2: Color(0xFF3F3A33),
    muted: Color(0xFF7B7468),
    muted2: Color(0xFF9C9489),
    hairline: Color(0x14141210),
    hairlineSoft: Color(0x0F141210),
    inputFill: Color(0xFFF6F4F0),
    brand: Color(0xFF4F46E5),
    brandSubtle: Color(0x1F4F46E5),
  );

  static const dark = RunqTokens(
    bgWarm: Color(0xFF0F0E0C),
    bgWarmer: Color(0xFF18171A),
    surface: Color(0xFF1B1A18),
    ink: Color(0xFFF4F2EE),
    ink2: Color(0xFFD6D2CB),
    muted: Color(0xFFA1998D),
    muted2: Color(0xFF7B7468),
    hairline: Color(0x33FFFFFF),
    hairlineSoft: Color(0x1AFFFFFF),
    inputFill: Color(0xFF26241F),
    brand: Color(0xFFA5B4FC),
    brandSubtle: Color(0x33A5B4FC),
  );

  @override
  RunqTokens copyWith({
    Color? bgWarm, Color? bgWarmer, Color? surface, Color? ink, Color? ink2,
    Color? muted, Color? muted2, Color? hairline, Color? hairlineSoft, Color? inputFill,
    Color? brand, Color? brandSubtle,
  }) =>
      RunqTokens(
        bgWarm: bgWarm ?? this.bgWarm,
        bgWarmer: bgWarmer ?? this.bgWarmer,
        surface: surface ?? this.surface,
        ink: ink ?? this.ink,
        ink2: ink2 ?? this.ink2,
        muted: muted ?? this.muted,
        muted2: muted2 ?? this.muted2,
        hairline: hairline ?? this.hairline,
        hairlineSoft: hairlineSoft ?? this.hairlineSoft,
        inputFill: inputFill ?? this.inputFill,
        brand: brand ?? this.brand,
        brandSubtle: brandSubtle ?? this.brandSubtle,
      );

  @override
  RunqTokens lerp(ThemeExtension<RunqTokens>? other, double t) {
    if (other is! RunqTokens) return this;
    return RunqTokens(
      bgWarm: Color.lerp(bgWarm, other.bgWarm, t)!,
      bgWarmer: Color.lerp(bgWarmer, other.bgWarmer, t)!,
      surface: Color.lerp(surface, other.surface, t)!,
      ink: Color.lerp(ink, other.ink, t)!,
      ink2: Color.lerp(ink2, other.ink2, t)!,
      muted: Color.lerp(muted, other.muted, t)!,
      muted2: Color.lerp(muted2, other.muted2, t)!,
      hairline: Color.lerp(hairline, other.hairline, t)!,
      hairlineSoft: Color.lerp(hairlineSoft, other.hairlineSoft, t)!,
      inputFill: Color.lerp(inputFill, other.inputFill, t)!,
      brand: Color.lerp(brand, other.brand, t)!,
      brandSubtle: Color.lerp(brandSubtle, other.brandSubtle, t)!,
    );
  }
}

/// Shorthand: `RT(context).ink` → token in the active theme.
RunqTokens RT(BuildContext context) =>
    Theme.of(context).extension<RunqTokens>() ?? RunqTokens.light;

class RunqRadii {
  static const chip = 10.0;
  static const input = 12.0;
  static const smallCard = 14.0;
  static const card = 16.0;
  static const cardLg = 18.0;
  static const hero = 22.0;
}

class RunqSpacing {
  static const gutter = 16.0;
  static const cardPad = 16.0;
  static const cardGap = 12.0;
  static const sectionGap = 20.0;
}

class RunqShadows {
  static const card = <BoxShadow>[
    BoxShadow(color: Color(0x0A141210), blurRadius: 3, offset: Offset(0, 1)),
  ];
  static const tabBar = <BoxShadow>[
    BoxShadow(color: Color(0x14141210), blurRadius: 16, offset: Offset(0, 4)),
  ];
  static const fab = <BoxShadow>[
    BoxShadow(color: Color(0x664F46E5), blurRadius: 20, offset: Offset(0, 6)),
  ];
  static const sheet = <BoxShadow>[
    BoxShadow(color: Color(0x33141210), blurRadius: 40, offset: Offset(0, 12)),
  ];
}
