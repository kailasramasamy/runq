import 'package:flutter/material.dart';
import '../theme/runq_tokens.dart';

class Sparkline extends StatelessWidget {
  final List<double> data;
  final Color stroke;
  final Color fill;
  final double height;
  const Sparkline({
    super.key,
    required this.data,
    this.stroke = RunqColors.indigoLight,
    this.fill = const Color(0x2E1E1B4B),
    this.height = 56,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: height,
      width: double.infinity,
      child: CustomPaint(painter: _SparkPainter(data: data, stroke: stroke, fill: fill)),
    );
  }
}

class _SparkPainter extends CustomPainter {
  final List<double> data;
  final Color stroke;
  final Color fill;
  _SparkPainter({required this.data, required this.stroke, required this.fill});

  @override
  void paint(Canvas canvas, Size size) {
    if (data.length < 2) return;
    final min = data.reduce((a, b) => a < b ? a : b);
    final max = data.reduce((a, b) => a > b ? a : b);
    final range = (max - min) == 0 ? 1.0 : (max - min);
    final step = size.width / (data.length - 1);
    final pts = <Offset>[];
    for (var i = 0; i < data.length; i++) {
      final x = i * step;
      final y = size.height - ((data[i] - min) / range) * (size.height - 4) - 2;
      pts.add(Offset(x, y));
    }
    final linePath = Path()..moveTo(pts.first.dx, pts.first.dy);
    for (final p in pts.skip(1)) {
      linePath.lineTo(p.dx, p.dy);
    }
    final fillPath = Path.from(linePath)
      ..lineTo(size.width, size.height)
      ..lineTo(0, size.height)
      ..close();

    canvas.drawPath(fillPath, Paint()..color = fill);
    canvas.drawPath(
      linePath,
      Paint()
        ..color = stroke
        ..strokeWidth = 2
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round
        ..style = PaintingStyle.stroke,
    );
    final last = pts.last;
    canvas.drawCircle(last, 6, Paint()..color = stroke.withValues(alpha: 0.3));
    canvas.drawCircle(last, 3.5, Paint()..color = stroke);
  }

  @override
  bool shouldRepaint(covariant _SparkPainter old) =>
      old.data != data || old.stroke != stroke || old.fill != fill;
}
