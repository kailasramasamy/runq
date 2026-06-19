import 'package:flutter/material.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';

/// Shown while the stored session is being restored (auth.isLoading). Emerald
/// brand gradient seamless with the native splash; the white milk drop pops in
/// and emits expanding ripple rings, with the wordmark fading up.
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key, this.animate = true});

  /// The one-shot intro (drop pop + wordmark fade). Pass false for the brief
  /// post-redirect loading state so it continues seamlessly from the first
  /// splash instead of re-popping the logo.
  final bool animate;

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> with SingleTickerProviderStateMixin {
  late final AnimationController _pulse =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 2200))..repeat();

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  /// The Dhenu drop logo, sized to sit within the 160px ripple field.
  Widget _logo() => Image.asset(
        'assets/branding/dhenu-splash-logo.png',
        width: 120,
        height: 120,
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
                // Drop + ripples
                SizedBox(
                  width: 160,
                  height: 160,
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      AnimatedBuilder(
                        animation: _pulse,
                        builder: (_, _) => CustomPaint(
                          size: const Size.square(160),
                          painter: _RipplePainter(_pulse.value),
                        ),
                      ),
                      if (widget.animate)
                        TweenAnimationBuilder<double>(
                          tween: Tween(begin: 0, end: 1),
                          duration: const Duration(milliseconds: 700),
                          curve: Curves.easeOutBack,
                          builder: (_, v, child) => Opacity(
                            opacity: v.clamp(0, 1),
                            child: Transform.scale(scale: 0.6 + v * 0.4, child: child),
                          ),
                          child: _logo(),
                        )
                      else
                        _logo(),
                    ],
                  ),
                ),
                const SizedBox(height: DhenuSpacing.md),
                if (widget.animate)
                  TweenAnimationBuilder<double>(
                    tween: Tween(begin: 0, end: 1),
                    duration: const Duration(milliseconds: 900),
                    curve: Curves.easeOut,
                    builder: (_, v, child) => Opacity(
                      opacity: v,
                      child: Transform.translate(offset: Offset(0, (1 - v) * 12), child: child),
                    ),
                    child: Text('dhenu', style: DhenuText.h1.copyWith(color: Colors.white)),
                  )
                else
                  Text('dhenu', style: DhenuText.h1.copyWith(color: Colors.white)),
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

/// Two expanding, fading white rings — evokes a milk drop rippling outward.
class _RipplePainter extends CustomPainter {
  _RipplePainter(this.t);
  final double t; // 0..1, repeating

  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    const minR = 44.0;
    final maxR = size.width / 2;
    for (var i = 0; i < 2; i++) {
      final phase = (t + i * 0.5) % 1.0;
      final radius = minR + phase * (maxR - minR);
      final opacity = (1 - phase) * 0.30;
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
