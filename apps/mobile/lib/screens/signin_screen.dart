import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';
import '../api/api_client.dart';
import '../providers/auth_provider.dart';
import '../theme/runq_theme.dart';

class SignInScreen extends ConsumerStatefulWidget {
  final bool sessionExpired;
  const SignInScreen({super.key, this.sessionExpired = false});

  @override
  ConsumerState<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends ConsumerState<SignInScreen> with SingleTickerProviderStateMixin {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _showPassword = false;
  bool _loading = false;
  String? _error;

  late final AnimationController _enter;
  late final Animation<double> _logoFade;
  late final Animation<double> _logoScale;
  late final Animation<Offset> _cardSlide;
  late final Animation<double> _cardFade;

  @override
  void initState() {
    super.initState();
    _enter = AnimationController(vsync: this, duration: const Duration(milliseconds: 760));
    _logoFade = CurvedAnimation(parent: _enter, curve: const Interval(0, 0.6, curve: Curves.easeOut));
    _logoScale = Tween<double>(begin: 0.85, end: 1.0)
        .chain(CurveTween(curve: Curves.easeOutCubic))
        .animate(CurvedAnimation(parent: _enter, curve: const Interval(0, 0.7)));
    _cardSlide = Tween<Offset>(begin: const Offset(0, 0.06), end: Offset.zero)
        .chain(CurveTween(curve: Curves.easeOutCubic))
        .animate(CurvedAnimation(parent: _enter, curve: const Interval(0.25, 1.0)));
    _cardFade = CurvedAnimation(parent: _enter, curve: const Interval(0.25, 1.0, curve: Curves.easeOut));
    _enter.forward();
  }

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _enter.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    if (_email.text.trim().isEmpty || _password.text.isEmpty) {
      setState(() => _error = 'Enter your email and password to continue.');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await ref.read(authProvider.notifier).login(_email.text, _password.text);
      if (!mounted) return;
      context.go('/home');
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.statusCode == 401
          ? 'Invalid email or password.'
          : e.message);
    } catch (e) {
      if (!mounted) return;
      // Surface the real error in debug so connectivity issues are diagnosable.
      debugPrint('[signin] network error: $e');
      setState(() => _error = kDebugMode
          ? 'Connection failed: $e'
          : 'Could not reach the server. Check your connection.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.light,
      ),
      child: Scaffold(
        backgroundColor: const Color(0xFF09090B),
        body: Stack(
          children: [
            const Positioned.fill(child: _BackgroundGradient()),
            const Positioned.fill(child: _GlowBlobs()),
            SafeArea(
              child: SingleChildScrollView(
                physics: const ClampingScrollPhysics(),
                padding: EdgeInsets.fromLTRB(
                  24, 32, 24, 32 + MediaQuery.of(context).viewInsets.bottom),
                child: ConstrainedBox(
                  constraints: BoxConstraints(
                    minHeight: MediaQuery.of(context).size.height -
                        MediaQuery.of(context).padding.vertical - 64,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const SizedBox(height: 24),
                      _LogoBlock(fade: _logoFade, scale: _logoScale),
                      const SizedBox(height: 28),
                      if (widget.sessionExpired)
                        FadeTransition(
                          opacity: _cardFade,
                          child: Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: const _SessionExpiredBanner(),
                          ),
                        ),
                      SlideTransition(
                        position: _cardSlide,
                        child: FadeTransition(
                          opacity: _cardFade,
                          child: _SignInCard(
                            email: _email,
                            password: _password,
                            showPassword: _showPassword,
                            onToggleShow: () => setState(() => _showPassword = !_showPassword),
                            error: _error,
                            loading: _loading,
                            onSubmit: _submit,
                          ),
                        ),
                      ),
                      const SizedBox(height: 28),
                      FadeTransition(
                        opacity: _cardFade,
                        child: Center(
                          child: Text(
                            'runQ Finance v1',
                            style: RunqText.caption.copyWith(
                              color: const Color(0xFF52525B),
                              fontSize: 11,
                              letterSpacing: 0.04 * 11,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _BackgroundGradient extends StatelessWidget {
  const _BackgroundGradient();

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF09090B), Color(0xFF18181B), Color(0xFF1E1B4B)],
          stops: [0, 0.55, 1],
        ),
      ),
    );
  }
}

class _GlowBlobs extends StatelessWidget {
  const _GlowBlobs();

  @override
  Widget build(BuildContext context) {
    return CustomPaint(painter: _GlowPainter());
  }
}

class _GlowPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final p1 = Paint()
      ..shader = RadialGradient(
        colors: [const Color(0xFF6366F1).withValues(alpha: 0.45), const Color(0x00000000)],
      ).createShader(Rect.fromCircle(center: Offset(size.width * 0.85, size.height * 0.18), radius: size.width * 0.7));
    canvas.drawRect(Offset.zero & size, p1);
    final p2 = Paint()
      ..shader = RadialGradient(
        colors: [const Color(0xFF7C3AED).withValues(alpha: 0.30), const Color(0x00000000)],
      ).createShader(Rect.fromCircle(center: Offset(-size.width * 0.1, size.height * 0.85), radius: size.width * 0.8));
    canvas.drawRect(Offset.zero & size, p2);
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => false;
}

class _LogoBlock extends StatelessWidget {
  final Animation<double> fade, scale;
  const _LogoBlock({required this.fade, required this.scale});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        FadeTransition(
          opacity: fade,
          child: ScaleTransition(
            scale: scale,
            child: Container(
              width: 76, height: 76,
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(color: Color(0x666366F1), blurRadius: 32, offset: Offset(0, 12)),
                ],
              ),
              child: ClipOval(
                child: SvgPicture.asset(
                  'assets/branding/runq-app-logo.svg',
                  width: 76, height: 76,
                ),
              ),
            ),
          ),
        ),
        const SizedBox(height: 18),
        FadeTransition(
          opacity: fade,
          child: Column(
            children: [
              Text(
                'Sign in to your workspace',
                style: RunqText.bodyStrong.copyWith(
                  color: const Color(0xFFF4F4F5),
                  fontSize: 17,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                'Finance & Accounting ERP',
                style: RunqText.caption.copyWith(color: const Color(0xFFA1A1AA), fontSize: 13),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _SessionExpiredBanner extends StatelessWidget {
  const _SessionExpiredBanner();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: const Color(0xFF451A03).withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFF92400E), width: 0.5),
      ),
      child: Row(
        children: [
          const Icon(Icons.info_outline_rounded, size: 16, color: Color(0xFFFCD34D)),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'Your session has expired. Please sign in again.',
              style: RunqText.caption.copyWith(color: const Color(0xFFFCD34D), fontSize: 12),
            ),
          ),
        ],
      ),
    );
  }
}

class _SignInCard extends StatelessWidget {
  final TextEditingController email, password;
  final bool showPassword;
  final VoidCallback onToggleShow;
  final String? error;
  final bool loading;
  final VoidCallback onSubmit;
  const _SignInCard({
    required this.email,
    required this.password,
    required this.showPassword,
    required this.onToggleShow,
    required this.error,
    required this.loading,
    required this.onSubmit,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: const Color(0xFF18181B).withValues(alpha: 0.78),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFF27272A), width: 0.6),
        boxShadow: const [
          BoxShadow(color: Color(0x66000000), blurRadius: 40, offset: Offset(0, 20)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _DarkField(
            label: 'Email',
            controller: email,
            hint: 'you@company.com',
            icon: Icons.alternate_email_rounded,
            keyboardType: TextInputType.emailAddress,
            autofillHints: const [AutofillHints.email],
            textInputAction: TextInputAction.next,
          ),
          const SizedBox(height: 14),
          _DarkField(
            label: 'Password',
            controller: password,
            hint: '••••••••',
            icon: Icons.lock_outline_rounded,
            obscure: !showPassword,
            suffix: GestureDetector(
              onTap: onToggleShow,
              child: Icon(
                showPassword ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                size: 18,
                color: const Color(0xFF71717A),
              ),
            ),
            autofillHints: const [AutofillHints.password],
            textInputAction: TextInputAction.done,
            onSubmitted: (_) => onSubmit(),
          ),
          const SizedBox(height: 10),
          Align(
            alignment: Alignment.centerRight,
            child: GestureDetector(
              onTap: () {},
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Text(
                  'Forgot password?',
                  style: RunqText.caption.copyWith(
                    color: const Color(0xFF818CF8),
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
            ),
          ),
          if (error != null) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: const Color(0xFF450A0A).withValues(alpha: 0.5),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: const Color(0xFF7F1D1D), width: 0.5),
              ),
              child: Row(
                children: [
                  const Icon(Icons.error_outline_rounded, size: 14, color: Color(0xFFFCA5A5)),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      error!,
                      style: RunqText.caption.copyWith(color: const Color(0xFFFCA5A5), fontSize: 12),
                    ),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 18),
          SizedBox(
            height: 48,
            child: FilledButton(
              onPressed: loading ? null : onSubmit,
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF6366F1),
                disabledBackgroundColor: const Color(0xFF6366F1).withValues(alpha: 0.6),
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: loading
                  ? const SizedBox(
                      width: 18, height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.login_rounded, size: 16),
                        const SizedBox(width: 8),
                        Text('Sign in', style: RunqText.bodyStrong.copyWith(color: Colors.white)),
                      ],
                    ),
            ),
          ),
          const SizedBox(height: 14),
          Center(
            child: Text.rich(
              TextSpan(
                style: RunqText.caption.copyWith(color: const Color(0xFF71717A), fontSize: 12),
                children: [
                  const TextSpan(text: 'New to runQ? '),
                  TextSpan(
                    text: 'Request access',
                    style: RunqText.caption.copyWith(
                      color: const Color(0xFF818CF8),
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _DarkField extends StatelessWidget {
  final String label, hint;
  final IconData icon;
  final TextEditingController controller;
  final bool obscure;
  final Widget? suffix;
  final TextInputType? keyboardType;
  final List<String>? autofillHints;
  final TextInputAction? textInputAction;
  final ValueChanged<String>? onSubmitted;
  const _DarkField({
    required this.label,
    required this.hint,
    required this.icon,
    required this.controller,
    this.obscure = false,
    this.suffix,
    this.keyboardType,
    this.autofillHints,
    this.textInputAction,
    this.onSubmitted,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: RunqText.caption.copyWith(
            color: const Color(0xFFD4D4D8),
            fontSize: 12,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 6),
        Container(
          decoration: BoxDecoration(
            color: const Color(0xFF27272A),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: const Color(0xFF3F3F46), width: 0.5),
          ),
          child: TextField(
            controller: controller,
            obscureText: obscure,
            keyboardType: keyboardType,
            autofillHints: autofillHints,
            textInputAction: textInputAction,
            onSubmitted: onSubmitted,
            style: RunqText.body.copyWith(color: const Color(0xFFF4F4F5), fontSize: 14),
            cursorColor: const Color(0xFF818CF8),
            decoration: InputDecoration(
              prefixIcon: Padding(
                padding: const EdgeInsets.only(left: 12, right: 8),
                child: Icon(icon, size: 18, color: const Color(0xFF71717A)),
              ),
              prefixIconConstraints: const BoxConstraints(minWidth: 0, minHeight: 0),
              suffixIcon: suffix == null
                  ? null
                  : Padding(padding: const EdgeInsets.only(right: 12), child: suffix),
              suffixIconConstraints: const BoxConstraints(minWidth: 0, minHeight: 0),
              hintText: hint,
              hintStyle: RunqText.body.copyWith(color: const Color(0xFF71717A), fontSize: 14),
              border: InputBorder.none,
              isDense: true,
              contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
            ),
          ),
        ),
      ],
    );
  }
}
