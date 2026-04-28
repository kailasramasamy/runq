import 'package:flutter/material.dart';
import '../theme/runq_tokens.dart';

class RunqCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final double radius;
  final VoidCallback? onTap;
  final Color? color;
  final Gradient? gradient;
  final Border? border;

  const RunqCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(RunqSpacing.cardPad),
    this.radius = RunqRadii.card,
    this.onTap,
    this.color,
    this.gradient,
    this.border,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final effectiveBorder = border ?? Border.all(color: t.hairline, width: 0.5);
    final container = Container(
      decoration: BoxDecoration(
        color: gradient == null ? (color ?? t.surface) : null,
        gradient: gradient,
        borderRadius: BorderRadius.circular(radius),
        border: effectiveBorder,
        boxShadow: RunqShadows.card,
      ),
      padding: padding,
      child: child,
    );
    if (onTap == null) return container;
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(radius),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(radius),
        child: container,
      ),
    );
  }
}
