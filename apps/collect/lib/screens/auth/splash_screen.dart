import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';

/// Shown while the stored session is being restored (auth.isLoading). Emerald
/// brand gradient seamless with the native splash. The milk drop falls in,
/// squashes and rebounds like liquid (with a ripple on impact), then breathes
/// gently while loading; the wordmark fades up after it lands.
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key, this.animate = true});

  /// The one-shot intro (drop fall + splash + wordmark). Pass false for the
  /// brief post-redirect loading state so it continues seamlessly (settled drop
  /// + ripples) instead of re-popping the logo.
  final bool animate;

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> with TickerProviderStateMixin {
  late final AnimationController _intro =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 1200));
  late final AnimationController _loop =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 2600));

  late final Animation<double> _opacity =
      CurvedAnimation(parent: _intro, curve: const Interval(0, 0.15));
  // Gravity fall from above into the centre.
  late final Animation<double> _fallY = Tween<double>(begin: -170.0, end: 0.0)
      .animate(CurvedAnimation(parent: _intro, curve: const Interval(0, 0.5, curve: Curves.easeIn)));
  // Squash-and-stretch on landing — reads as a liquid drop splatting & reforming.
  late final Animation<double> _scaleY = TweenSequence<double>([
    TweenSequenceItem(tween: Tween(begin: 1.0, end: 1.08).chain(CurveTween(curve: Curves.easeIn)), weight: 50),
    TweenSequenceItem(tween: Tween(begin: 1.08, end: 0.78).chain(CurveTween(curve: Curves.easeOut)), weight: 12),
    TweenSequenceItem(tween: Tween(begin: 0.78, end: 1.10).chain(CurveTween(curve: Curves.easeOut)), weight: 18),
    TweenSequenceItem(tween: Tween(begin: 1.10, end: 1.0).chain(CurveTween(curve: Curves.easeInOut)), weight: 20),
  ]).animate(_intro);
  late final Animation<double> _scaleX = TweenSequence<double>([
    TweenSequenceItem(tween: Tween(begin: 1.0, end: 0.95).chain(CurveTween(curve: Curves.easeIn)), weight: 50),
    TweenSequenceItem(tween: Tween(begin: 0.95, end: 1.20).chain(CurveTween(curve: Curves.easeOut)), weight: 12),
    TweenSequenceItem(tween: Tween(begin: 1.20, end: 0.92).chain(CurveTween(curve: Curves.easeOut)), weight: 18),
    TweenSequenceItem(tween: Tween(begin: 0.92, end: 1.0).chain(CurveTween(curve: Curves.easeInOut)), weight: 20),
  ]).animate(_intro);
  late final Animation<double> _word =
      CurvedAnimation(parent: _intro, curve: const Interval(0.55, 1.0, curve: Curves.easeOut));

  bool get _settled => !widget.animate || _intro.isCompleted;

  @override
  void initState() {
    super.initState();
    if (widget.animate) {
      _intro.forward();
      _intro.addStatusListener((s) {
        if (s == AnimationStatus.completed && mounted) _loop.repeat();
      });
    } else {
      _intro.value = 1.0;
      _loop.repeat();
    }
  }

  @override
  void dispose() {
    _intro.dispose();
    _loop.dispose();
    super.dispose();
  }

  Widget _drop() => SvgPicture.asset(
        'assets/branding/dhenu-milk-drop.svg',
        width: 116,
        height: 116,
      );

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final colors = isDark
        ? const [DhenuColors.brandDark, DhenuColors.brandPressedDark]
        : const [DhenuColors.brand, DhenuColors.brandPressed];

    return Scaffold(
      backgroundColor: colors.first,
      body: DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: colors,
          ),
        ),
        child: SafeArea(
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                SizedBox(
                  width: 180,
                  height: 180,
                  child: AnimatedBuilder(
                    animation: Listenable.merge([_intro, _loop]),
                    builder: (_, _) {
                      final breathing =
                          _settled ? 1 + math.sin(_loop.value * 2 * math.pi) * 0.03 : 1.0;
                      return Stack(
                        alignment: Alignment.center,
                        children: [
                          if (_settled)
                            CustomPaint(
                              size: const Size.square(180),
                              painter: _RipplePainter(_loop.value),
                            ),
                          Opacity(
                            opacity: _opacity.value,
                            child: Transform.translate(
                              offset: Offset(0, _fallY.value),
                              child: Transform.scale(
                                scaleX: _scaleX.value * breathing,
                                scaleY: _scaleY.value * breathing,
                                child: _drop(),
                              ),
                            ),
                          ),
                        ],
                      );
                    },
                  ),
                ),
                const SizedBox(height: DhenuSpacing.md),
                AnimatedBuilder(
                  animation: _word,
                  builder: (_, child) => Opacity(
                    opacity: _word.value,
                    child: Transform.translate(
                      offset: Offset(0, (1 - _word.value) * 12),
                      child: child,
                    ),
                  ),
                  child: Text('dhenu', style: DhenuText.h1.copyWith(color: Colors.white)),
                ),
                const SizedBox(height: DhenuSpacing.x3),
                SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(
                    strokeWidth: 2.5,
                    valueColor: AlwaysStoppedAnimation(Colors.white.withValues(alpha: 0.85)),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Two expanding, fading white rings from the drop's edge — a milk-drop ripple.
class _RipplePainter extends CustomPainter {
  _RipplePainter(this.t);
  final double t; // 0..1, repeating

  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    const minR = 58.0;
    final maxR = size.width / 2;
    for (var i = 0; i < 2; i++) {
      final phase = (t + i * 0.5) % 1.0;
      final radius = minR + phase * (maxR - minR);
      final opacity = (1 - phase) * 0.28;
      canvas.drawCircle(
        center,
        radius,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2
          ..color = Colors.white.withValues(alpha: opacity),
      );
    }
  }

  @override
  bool shouldRepaint(covariant _RipplePainter old) => old.t != t;
}
