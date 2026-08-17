import 'package:flutter/material.dart';
import '../theme/dhenu_theme.dart';
import '../theme/dhenu_tokens.dart';

/// A quick-action card on an operator home: icon, label, and a brand-tinted
/// ground, lifting the grid off the flat card surfaces around it.
///
/// Two stops, both opaque, both the card colour mixed with the brand — nothing
/// else. Every softer-looking idea tried here (a mid stop, a radial glow, an
/// oversized watermark glyph) put an edge somewhere on the card: the extra stop
/// bands, the radial leaves a visible arc where it lands on the card colour,
/// and the watermark is a hard shape however faint it is. A straight two-stop
/// ramp is the only version with no edge anywhere.
class QuickLinkCard extends StatelessWidget {
  const QuickLinkCard({
    super.key,
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final a = t.brand;
    final radius = BorderRadius.circular(DhenuRadii.card);
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: radius,
        border: Border.all(color: t.hairline),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color.lerp(t.card, a, 0.13)!,
            Color.lerp(t.card, a, 0.01)!,
          ],
        ),
      ),
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          onTap: onTap,
          borderRadius: radius,
          child: Padding(
            padding: const EdgeInsets.symmetric(
                horizontal: DhenuSpacing.sm, vertical: DhenuSpacing.lg),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Container(
                width: 38,
                height: 38,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: a.withValues(alpha: 0.13),
                  borderRadius: BorderRadius.circular(DhenuRadii.input),
                ),
                child: Icon(icon, size: 20, color: a),
              ),
              const SizedBox(height: DhenuSpacing.sm),
              Text(label,
                  textAlign: TextAlign.center,
                  style: DhenuText.label.copyWith(color: t.ink)),
            ]),
          ),
        ),
      ),
    );
  }
}
