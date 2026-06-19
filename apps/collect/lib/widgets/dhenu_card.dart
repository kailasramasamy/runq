import 'package:flutter/material.dart';
import '../theme/dhenu_tokens.dart';

/// The standard Dhenu surface: card colour, soft rounding, hairline border —
/// the one card look used everywhere, so screens stop hand-rolling the same
/// `Container(decoration: BoxDecoration(color: t.card, …))`. Flips correctly in
/// light + dark via tokens. Pass [onTap] for a tappable card (ripple clipped to
/// the corner radius); [elevated] adds the soft ambient shadow.
class DhenuCard extends StatelessWidget {
  const DhenuCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(DhenuSpacing.lg),
    this.onTap,
    this.elevated = false,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;
  final bool elevated;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final decoration = BoxDecoration(
      color: t.card,
      borderRadius: BorderRadius.circular(DhenuRadii.card),
      border: Border.all(color: t.hairline),
      boxShadow: elevated ? DhenuShadows.card : null,
    );
    final content = Padding(padding: padding, child: child);
    if (onTap == null) return DecoratedBox(decoration: decoration, child: content);
    return DecoratedBox(
      decoration: decoration,
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(DhenuRadii.card),
          child: content,
        ),
      ),
    );
  }
}
