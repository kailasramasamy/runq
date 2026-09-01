import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/app_module_provider.dart';
import '../providers/app_role_provider.dart';
import '../providers/auth_provider.dart';
import '../providers/hr_providers.dart';
import '../theme/runq_theme.dart';

class _Palette {
  final Color bg;
  final Color glow;
  final Color halo;
  final Color ring;
  final Color tagline;
  final Color dot;
  final Color shimmer;
  const _Palette({
    required this.bg,
    required this.glow,
    required this.halo,
    required this.ring,
    required this.tagline,
    required this.dot,
    required this.shimmer,
  });

  static _Palette of(BuildContext context) {
    return const _Palette(
      bg: Color(0xFF6366F1),
      glow: Color(0xFF818CF8),
      halo: Color(0x26FFFFFF),
      ring: Color(0x99FFFFFF),
      tagline: Color(0xD9FFFFFF),
      dot: Color(0xFFFFFFFF),
      shimmer: Color(0x80FFFFFF),
    );
  }
}

class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});

  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen> with TickerProviderStateMixin {
  late final AnimationController _ctrl;
  Ticker? _driver;
  static const _splashDurationMs = 2500;
  late final Animation<double> _logoScale;
  late final Animation<double> _logoFade;
  late final Animation<double> _taglineFade;
  late final Animation<double> _shimmerSweep;
  late final Animation<double> _exitOpacity;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 6500),
    );

    _logoScale = TweenSequence<double>([
      TweenSequenceItem(tween: Tween(begin: 0.55, end: 1.06).chain(CurveTween(curve: Curves.easeOutCubic)), weight: 30),
      TweenSequenceItem(tween: Tween(begin: 1.06, end: 1.0).chain(CurveTween(curve: Curves.easeOutCubic)), weight: 15),
      TweenSequenceItem(tween: ConstantTween(1.0), weight: 55),
    ]).animate(_ctrl);

    _logoFade = CurvedAnimation(parent: _ctrl, curve: const Interval(0, 0.25, curve: Curves.easeOut));
    _taglineFade = CurvedAnimation(parent: _ctrl, curve: const Interval(0.30, 0.55, curve: Curves.easeOut));
    _shimmerSweep = CurvedAnimation(parent: _ctrl, curve: const Interval(0.45, 0.95, curve: Curves.easeInOut));
    _exitOpacity = Tween<double>(begin: 1.0, end: 0.0)
        .animate(CurvedAnimation(parent: _ctrl, curve: const Interval(0.90, 1.0)));

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _driver = createTicker((elapsed) {
        final v = (elapsed.inMilliseconds / _splashDurationMs).clamp(0.0, 1.0);
        _ctrl.value = v;
        if (v >= 1.0) {
          _driver?.stop();
          _route();
        }
      })..start();
    });
  }

  Future<void> _route() async {
    if (!mounted) return;
    var auth = ref.read(authProvider);
    if (auth.isLoading) {
      await ref.read(authProvider.notifier).stream.firstWhere((s) => !s.isLoading);
    }
    if (!mounted) return;
    auth = ref.read(authProvider);
    if (auth.isAuthenticated) {
      context.go(await _resolveLanding());
    } else if (auth.sessionExpired) {
      context.go('/signin?session=expired');
    } else {
      context.go('/signin');
    }
  }

  /// Pick the landing route. Non-admins land in HR: every employee holds HR
  /// self-service, so it is the one surface all of them share. `technician`
  /// is the exception — it now has HR too, but the shop floor is where that
  /// persona actually works, so it opens on manufacturing. This is a landing
  /// preference, not an access limit. Admins return to whichever module they
  /// were last in, so hot-restart preserves context. Waits up to ~600ms for
  /// /hr/me so the role lookup doesn't race with the first paint.
  Future<String> _resolveLanding() async {
    if (ref.read(authProvider).user?.role == 'technician') {
      return AppModule.manufacturing.homeRoute;
    }
    try {
      await ref.read(hrMeProvider.future).timeout(const Duration(milliseconds: 600));
    } catch (_) {
      // Fall through to whatever role the provider already has.
    }
    final role = ref.read(appRoleProvider);
    if (!role.canAccessFinance) return '/hr/home';
    final lastModule = ref.read(appModuleProvider);
    return lastModule == AppModule.hr ? '/hr/home' : '/home';
  }

  @override
  void dispose() {
    _driver?.dispose();
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = _Palette.of(context);
    return Scaffold(
      backgroundColor: p.bg,
      body: AnimatedBuilder(
        animation: _ctrl,
        builder: (_, __) => Opacity(
          opacity: _exitOpacity.value,
          child: Stack(
            children: [
              Positioned.fill(child: CustomPaint(painter: _GradientGlow(_ctrl.value, p.glow))),
              Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    _Logo(
                      scale: _logoScale.value,
                      opacity: _logoFade.value,
                      shimmer: _shimmerSweep.value,
                      palette: p,
                    ),
                    const SizedBox(height: 28),
                    FadeTransition(
                      opacity: _taglineFade,
                      child: Text.rich(
                        TextSpan(
                          children: [
                            const TextSpan(text: 'Run your business,\n'),
                            TextSpan(
                              text: 'end to end',
                              style: RunqText.h2.copyWith(
                                color: p.dot,
                                fontWeight: FontWeight.w700,
                                letterSpacing: -0.2,
                              ),
                            ),
                          ],
                        ),
                        textAlign: TextAlign.center,
                        style: RunqText.h2.copyWith(
                          color: p.tagline,
                          letterSpacing: -0.2,
                          height: 1.2,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              Positioned(
                left: 0, right: 0,
                bottom: 56 + MediaQuery.of(context).padding.bottom,
                child: FadeTransition(
                  opacity: _taglineFade,
                  child: _LoadingDots(color: p.dot),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Logo extends StatelessWidget {
  final double scale, opacity, shimmer;
  final _Palette palette;
  const _Logo({required this.scale, required this.opacity, required this.shimmer, required this.palette});

  @override
  Widget build(BuildContext context) {
    return Transform.scale(
      scale: scale,
      child: Opacity(
        opacity: opacity,
        child: Stack(
          alignment: Alignment.center,
          children: [
            Container(
              width: 132, height: 132,
              decoration: BoxDecoration(color: palette.halo, shape: BoxShape.circle),
            ),
            Container(
              width: 104, height: 104,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: palette.ring, width: 2),
                boxShadow: const [
                  BoxShadow(color: Color(0x402E1B81), blurRadius: 32, offset: Offset(0, 12)),
                ],
              ),
              child: ClipOval(
                child: Image.asset(
                  'assets/branding/runq-app-logo.png',
                  width: 104, height: 104,
                  fit: BoxFit.cover,
                ),
              ),
            ),
            if (shimmer > 0 && shimmer < 1)
              Positioned.fill(
                child: ClipOval(
                  child: CustomPaint(painter: _ShimmerSweep(shimmer, palette.shimmer)),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _GradientGlow extends CustomPainter {
  final double t;
  final Color glow;
  _GradientGlow(this.t, this.glow);

  @override
  void paint(Canvas canvas, Size size) {
    final radius = size.shortestSide * (0.5 + 0.4 * t);
    final paint = Paint()
      ..shader = RadialGradient(
        colors: [
          glow.withValues(alpha: 0.45 * t),
          glow.withValues(alpha: 0),
        ],
      ).createShader(Rect.fromCircle(center: Offset(size.width / 2, size.height * 0.42), radius: radius));
    canvas.drawRect(Offset.zero & size, paint);
  }

  @override
  bool shouldRepaint(covariant _GradientGlow old) => old.t != t || old.glow != glow;
}

class _ShimmerSweep extends CustomPainter {
  final double t;
  final Color tint;
  _ShimmerSweep(this.t, this.tint);

  @override
  void paint(Canvas canvas, Size size) {
    final dx = (t * 2 - 1) * size.width;
    final rect = Rect.fromLTWH(dx, 0, size.width * 0.6, size.height);
    final paint = Paint()
      ..shader = LinearGradient(
        begin: Alignment.centerLeft,
        end: Alignment.centerRight,
        colors: [
          tint.withValues(alpha: 0),
          tint,
          tint.withValues(alpha: 0),
        ],
      ).createShader(rect)
      ..blendMode = BlendMode.srcOver;
    canvas.drawRect(Offset.zero & size, paint);
  }

  @override
  bool shouldRepaint(covariant _ShimmerSweep old) => old.t != t || old.tint != tint;
}

class _LoadingDots extends StatefulWidget {
  final Color color;
  const _LoadingDots({required this.color});

  @override
  State<_LoadingDots> createState() => _LoadingDotsState();
}

class _LoadingDotsState extends State<_LoadingDots> with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 1100))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (_, __) {
        return Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: List.generate(3, (i) {
            final phase = ((_c.value + i / 3) % 1.0);
            final scale = 0.6 + 0.4 * (1 - (phase * 2 - 1).abs());
            return Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: Transform.scale(
                scale: scale,
                child: Container(
                  width: 7, height: 7,
                  decoration: BoxDecoration(
                    color: widget.color.withValues(alpha: 0.5 + 0.5 * scale),
                    shape: BoxShape.circle,
                  ),
                ),
              ),
            );
          }),
        );
      },
    );
  }
}
