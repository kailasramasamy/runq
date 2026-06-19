import 'package:flutter/material.dart';
import '../theme/dhenu_tokens.dart';
import '../theme/dhenu_theme.dart';

/// The signature Dhenu surface — headline L/₹ figure, optional delta,
/// optional footer row (progress dots, sub-row, etc.).
class HeroNumberCard extends StatelessWidget {
  const HeroNumberCard({
    super.key,
    this.label,
    required this.primaryValue,
    this.secondaryValue,
    this.delta,
    this.footer,
    this.gradient,
  });

  /// When set, the card paints this gradient instead of the flat card fill and
  /// switches its text to white for contrast (e.g. the emerald PP hero).
  /// Footer colours are the caller's responsibility.
  final Gradient? gradient;

  /// Small uppercase caption above the number (e.g. "THIS CYCLE").
  final String? label;

  /// The main hero number (e.g. "142.5 L"). Rendered in DhenuText.hero.
  final String primaryValue;

  /// Secondary number shown side by side (e.g. "₹ 6,840"). Rendered in display.
  final String? secondaryValue;

  /// Delta line (e.g. "▲ 8% vs last cycle"). Starts with ▲ → gradeA green, else inkSoft.
  final String? delta;

  /// Optional footer widget (progress dots, sub-row, etc.).
  final Widget? footer;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final onGradient = gradient != null;
    final ink = onGradient ? Colors.white : t.ink;
    final inkSoft = onGradient ? Colors.white.withValues(alpha: 0.82) : t.inkSoft;
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: onGradient ? null : t.card,
        gradient: gradient,
        borderRadius: BorderRadius.circular(DhenuRadii.card),
        boxShadow: onGradient ? DhenuShadows.brand : DhenuShadows.card,
      ),
      padding: const EdgeInsets.all(DhenuSpacing.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          if (label != null) ...[
            Text(
              label!.toUpperCase(),
              style: DhenuText.caption.copyWith(
                color: inkSoft,
                letterSpacing: 1.1,
              ),
            ),
            const SizedBox(height: DhenuSpacing.sm),
          ],
          _NumberRow(
            primary: primaryValue,
            secondary: secondaryValue,
            ink: ink,
          ),
          if (delta != null) ...[
            const SizedBox(height: DhenuSpacing.xs),
            _DeltaLine(delta: delta!, t: t, overrideColor: onGradient ? Colors.white : null),
          ],
          if (footer != null) ...[
            const SizedBox(height: DhenuSpacing.md),
            footer!,
          ],
        ],
      ),
    );
  }
}

class _NumberRow extends StatelessWidget {
  const _NumberRow({
    required this.primary,
    required this.secondary,
    required this.ink,
  });

  final String primary;
  final String? secondary;
  final Color ink;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Text(primary, style: DhenuText.hero.copyWith(color: ink)),
        if (secondary != null) ...[
          const SizedBox(width: DhenuSpacing.lg),
          Padding(
            padding: const EdgeInsets.only(bottom: 3),
            child: Text(secondary!, style: DhenuText.display.copyWith(color: ink)),
          ),
        ],
      ],
    );
  }
}

class _DeltaLine extends StatelessWidget {
  const _DeltaLine({required this.delta, required this.t, this.overrideColor});

  final String delta;
  final DhenuTokens t;
  final Color? overrideColor;

  @override
  Widget build(BuildContext context) {
    final isPositive = delta.startsWith('▲');
    final color = overrideColor ?? (isPositive ? t.gradeA : t.inkSoft);
    return Text(delta, style: DhenuText.label.copyWith(color: color));
  }
}
