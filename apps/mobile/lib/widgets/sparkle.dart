import 'package:flutter/material.dart';
import '../theme/runq_tokens.dart';

class Sparkle extends StatefulWidget {
  final double size;
  final Color color;
  final bool animated;
  const Sparkle({super.key, this.size = 14, this.color = RunqColors.accent, this.animated = false});

  @override
  State<Sparkle> createState() => _SparkleState();
}

class _SparkleState extends State<Sparkle> with SingleTickerProviderStateMixin {
  late AnimationController _c;

  @override
  void initState() {
    super.initState();
    _c = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2000),
    );
    if (widget.animated) _c.repeat(reverse: true);
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final icon = CustomPaint(
      size: Size.square(widget.size),
      painter: _SparklePainter(widget.color),
    );
    if (!widget.animated) return icon;
    return AnimatedBuilder(
      animation: _c,
      builder: (_, __) {
        final v = Curves.easeInOut.transform(_c.value);
        return Opacity(
          opacity: 0.6 + 0.4 * v,
          child: Transform.scale(scale: 1.0 + 0.15 * v, child: icon),
        );
      },
    );
  }
}

class _SparklePainter extends CustomPainter {
  final Color color;
  _SparklePainter(this.color);

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width;
    final paint = Paint()..color = color;
    final p1 = Path()
      ..moveTo(s * 0.5, s * 0.06)
      ..lineTo(s * 0.6, s * 0.34)
      ..lineTo(s * 0.88, s * 0.44)
      ..lineTo(s * 0.6, s * 0.54)
      ..lineTo(s * 0.5, s * 0.81)
      ..lineTo(s * 0.4, s * 0.54)
      ..lineTo(s * 0.12, s * 0.44)
      ..lineTo(s * 0.4, s * 0.34)
      ..close();
    canvas.drawPath(p1, paint);
    final p2 = Path()
      ..moveTo(s * 0.81, s * 0.69)
      ..lineTo(s * 0.85, s * 0.78)
      ..lineTo(s * 0.94, s * 0.81)
      ..lineTo(s * 0.85, s * 0.85)
      ..lineTo(s * 0.81, s * 0.94)
      ..lineTo(s * 0.78, s * 0.85)
      ..lineTo(s * 0.69, s * 0.81)
      ..lineTo(s * 0.78, s * 0.78)
      ..close();
    canvas.drawPath(p2, Paint()..color = color.withValues(alpha: 0.6));
  }

  @override
  bool shouldRepaint(covariant _SparklePainter old) => old.color != color;
}
