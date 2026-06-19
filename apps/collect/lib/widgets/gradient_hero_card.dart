import 'package:flutter/material.dart';
import '../theme/dhenu_tokens.dart';

/// Emerald gradient surface for the month-earnings hero and the referral card.
/// White content sits on a brand gradient (lighter in dark mode) with the
/// brand-tinted lift shadow. Compose the eyebrow / value / sparkline / footer
/// as the [child]; this just owns the gradient, radius, shadow and padding.
class GradientHeroCard extends StatelessWidget {
  const GradientHeroCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(DhenuSpacing.xl),
    this.onTap,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final decoration = BoxDecoration(
      gradient: LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: isDark
            ? const [DhenuColors.brandDark, DhenuColors.brandPressedDark]
            : const [DhenuColors.brand, DhenuColors.brandPressed],
      ),
      borderRadius: BorderRadius.circular(DhenuRadii.cardLg),
      boxShadow: DhenuShadows.brand,
    );
    final content = Padding(padding: padding, child: child);
    if (onTap == null) return DecoratedBox(decoration: decoration, child: content);
    return DecoratedBox(
      decoration: decoration,
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(DhenuRadii.cardLg),
          child: content,
        ),
      ),
    );
  }
}
