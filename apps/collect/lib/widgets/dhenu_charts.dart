import 'dart:math' as math;
import 'package:flutter/material.dart';

/// Lightweight, dependency-free data-viz for the farmer redesign. All three are
/// pure `CustomPaint` so they cost nothing and theme via the colours passed in.

/// 14-day area+line sparkline (hero card). Stroke + a soft fill that fades to
/// transparent, with a dot on the latest point.
class Sparkline extends StatelessWidget {
  const Sparkline({
    super.key,
    required this.values,
    required this.color,
    this.strokeWidth = 2.4,
    this.height = 58,
  });

  final List<double> values;
  final Color color;
  final double strokeWidth;
  final double height;

  @override
  Widget build(BuildContext context) => SizedBox(
        height: height,
        width: double.infinity,
        child: CustomPaint(painter: _SparkPainter(values, color, strokeWidth)),
      );
}

class _SparkPainter extends CustomPainter {
  _SparkPainter(this.values, this.color, this.sw);
  final List<double> values;
  final Color color;
  final double sw;

  @override
  void paint(Canvas canvas, Size size) {
    if (values.length < 2) return;
    final maxV = values.reduce(math.max);
    final minV = values.reduce(math.min);
    final range = (maxV - minV).abs() < 1e-9 ? 1.0 : maxV - minV;
    final dx = size.width / (values.length - 1);
    final usableH = size.height - sw * 2;
    Offset pt(int i) => Offset(i * dx, size.height - sw - (values[i] - minV) / range * usableH);

    final line = Path()..moveTo(pt(0).dx, pt(0).dy);
    for (var i = 1; i < values.length; i++) {
      line.lineTo(pt(i).dx, pt(i).dy);
    }
    final area = Path.from(line)
      ..lineTo(size.width, size.height)
      ..lineTo(0, size.height)
      ..close();

    canvas.drawPath(
      area,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [color.withValues(alpha: 0.28), color.withValues(alpha: 0.0)],
        ).createShader(Offset.zero & size),
    );
    canvas.drawPath(
      line,
      Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = sw
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );
    canvas.drawCircle(pt(values.length - 1), 3.6, Paint()..color = color);
  }

  @override
  bool shouldRepaint(covariant _SparkPainter old) =>
      old.values != values || old.color != color || old.sw != sw;
}

/// Circular progress ring with an optional centred child (streak displays).
class ProgressRing extends StatelessWidget {
  const ProgressRing({
    super.key,
    required this.progress,
    required this.color,
    this.size = 48,
    this.strokeWidth = 4,
    this.trackColor,
    this.child,
  });

  final double progress; // 0..1
  final Color color;
  final double size;
  final double strokeWidth;
  final Color? trackColor;
  final Widget? child;

  @override
  Widget build(BuildContext context) => SizedBox(
        width: size,
        height: size,
        child: CustomPaint(
          painter: _RingPainter(
            progress.clamp(0, 1),
            color,
            strokeWidth,
            trackColor ?? color.withValues(alpha: 0.18),
          ),
          child: child == null ? null : Center(child: child),
        ),
      );
}

class _RingPainter extends CustomPainter {
  _RingPainter(this.progress, this.color, this.sw, this.track);
  final double progress;
  final Color color;
  final double sw;
  final Color track;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset(sw / 2, sw / 2) & Size(size.width - sw, size.height - sw);
    final base = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = sw
      ..strokeCap = StrokeCap.round;
    canvas.drawArc(rect, 0, 2 * math.pi, false, base..color = track);
    if (progress > 0) {
      canvas.drawArc(rect, -math.pi / 2, 2 * math.pi * progress, false, base..color = color);
    }
  }

  @override
  bool shouldRepaint(covariant _RingPainter old) =>
      old.progress != progress || old.color != color || old.track != track;
}

/// One bar of a [MiniBarChart] — a value and its (grade) colour.
class BarDatum {
  const BarDatum(this.value, this.color);
  final double value;
  final Color color;
}

/// Compact daily-volume bar chart (Collections). Bars scale to the max value,
/// with rounded tops and a fixed gap.
class MiniBarChart extends StatelessWidget {
  const MiniBarChart({super.key, required this.bars, this.height = 64, this.gap = 3});

  final List<BarDatum> bars;
  final double height;
  final double gap;

  @override
  Widget build(BuildContext context) => SizedBox(
        height: height,
        width: double.infinity,
        child: CustomPaint(painter: _BarPainter(bars, gap)),
      );
}

class _BarPainter extends CustomPainter {
  _BarPainter(this.bars, this.gap);
  final List<BarDatum> bars;
  final double gap;

  @override
  void paint(Canvas canvas, Size size) {
    if (bars.isEmpty) return;
    final maxV = bars.map((b) => b.value).fold<double>(0, math.max);
    final denom = maxV <= 0 ? 1.0 : maxV;
    final bw = (size.width - gap * (bars.length - 1)) / bars.length;
    final radius = Radius.circular(math.min(bw * 0.4, 3));
    for (var i = 0; i < bars.length; i++) {
      final h = (bars[i].value / denom) * size.height;
      final rect = Rect.fromLTWH(i * (bw + gap), size.height - h, bw, h);
      canvas.drawRRect(
        RRect.fromRectAndCorners(rect, topLeft: radius, topRight: radius),
        Paint()..color = bars[i].color,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _BarPainter old) => old.bars != bars || old.gap != gap;
}
