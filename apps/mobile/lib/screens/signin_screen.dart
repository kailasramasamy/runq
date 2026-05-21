import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import '../api/api_client.dart';
import '../providers/app_module_provider.dart';
import '../providers/app_role_provider.dart';
import '../providers/auth_provider.dart';
import '../providers/hr_providers.dart';
import '../theme/runq_theme.dart';

// Theme-aware colour palette for the sign-in screen. The whole screen used
// to be hardcoded dark; this palette mirrors the gradient/glow design but
// adapts to the system theme via Theme.of(context).brightness so the
// pre-auth screen no longer looks out of place when the OS is in light mode.
class _Palette {
  final Color bg;
  final List<Color> bgGradient;
  final Color glowIndigo;
  final Color glowViolet;
  final Color cardBg;
  final Color cardBorder;
  final Color cardShadow;
  final Color titleInk;
  final Color subtitleInk;
  final Color labelInk;
  final Color fieldBg;
  final Color fieldBorder;
  final Color fieldHint;
  final Color fieldText;
  final Color iconMuted;
  final Color linkInk;
  final Color subtleInk;
  final Color overlayIcons; // status bar icon brightness
  final Brightness statusBarIconBrightness;
  final Color sessionBg;
  final Color sessionBorder;
  final Color sessionText;
  final Color errorBg;
  final Color errorBorder;
  final Color errorText;
  final Color primaryBtn;
  const _Palette({
    required this.bg,
    required this.bgGradient,
    required this.glowIndigo,
    required this.glowViolet,
    required this.cardBg,
    required this.cardBorder,
    required this.cardShadow,
    required this.titleInk,
    required this.subtitleInk,
    required this.labelInk,
    required this.fieldBg,
    required this.fieldBorder,
    required this.fieldHint,
    required this.fieldText,
    required this.iconMuted,
    required this.linkInk,
    required this.subtleInk,
    required this.overlayIcons,
    required this.statusBarIconBrightness,
    required this.sessionBg,
    required this.sessionBorder,
    required this.sessionText,
    required this.errorBg,
    required this.errorBorder,
    required this.errorText,
    required this.primaryBtn,
  });

  static _Palette of(BuildContext context) {
    return Theme.of(context).brightness == Brightness.dark ? _dark : _light;
  }

  static const _dark = _Palette(
    bg: Color(0xFF09090B),
    bgGradient: [Color(0xFF09090B), Color(0xFF18181B), Color(0xFF1E1B4B)],
    glowIndigo: Color(0x736366F1),
    glowViolet: Color(0x4D7C3AED),
    cardBg: Color(0xC718181B),
    cardBorder: Color(0xFF27272A),
    cardShadow: Color(0x66000000),
    titleInk: Color(0xFFF4F4F5),
    subtitleInk: Color(0xFFA1A1AA),
    labelInk: Color(0xFFD4D4D8),
    fieldBg: Color(0xFF27272A),
    fieldBorder: Color(0xFF3F3F46),
    fieldHint: Color(0xFF71717A),
    fieldText: Color(0xFFF4F4F5),
    iconMuted: Color(0xFF71717A),
    linkInk: Color(0xFF818CF8),
    subtleInk: Color(0xFF52525B),
    overlayIcons: Color(0xFFFFFFFF),
    statusBarIconBrightness: Brightness.light,
    sessionBg: Color(0x80451A03),
    sessionBorder: Color(0xFF92400E),
    sessionText: Color(0xFFFCD34D),
    errorBg: Color(0x80450A0A),
    errorBorder: Color(0xFF7F1D1D),
    errorText: Color(0xFFFCA5A5),
    primaryBtn: Color(0xFF6366F1),
  );

  static const _light = _Palette(
    bg: Color(0xFFFAFAFA),
    bgGradient: [Color(0xFFFAFAFA), Color(0xFFF4F4F5), Color(0xFFE0E7FF)],
    glowIndigo: Color(0x336366F1),
    glowViolet: Color(0x267C3AED),
    cardBg: Color(0xF2FFFFFF),
    cardBorder: Color(0xFFE4E4E7),
    cardShadow: Color(0x14000000),
    titleInk: Color(0xFF18181B),
    subtitleInk: Color(0xFF52525B),
    labelInk: Color(0xFF52525B),
    fieldBg: Color(0xFFFFFFFF),
    fieldBorder: Color(0xFFD4D4D8),
    fieldHint: Color(0xFFA1A1AA),
    fieldText: Color(0xFF18181B),
    iconMuted: Color(0xFFA1A1AA),
    linkInk: Color(0xFF6366F1),
    subtleInk: Color(0xFFA1A1AA),
    overlayIcons: Color(0xFF18181B),
    statusBarIconBrightness: Brightness.dark,
    sessionBg: Color(0xFFFEF3C7),
    sessionBorder: Color(0xFFFCD34D),
    sessionText: Color(0xFF92400E),
    errorBg: Color(0xFFFEE2E2),
    errorBorder: Color(0xFFFCA5A5),
    errorText: Color(0xFFB91C1C),
    primaryBtn: Color(0xFF6366F1),
  );
}

class SignInScreen extends ConsumerStatefulWidget {
  final bool sessionExpired;
  const SignInScreen({super.key, this.sessionExpired = false});

  @override
  ConsumerState<SignInScreen> createState() => _SignInScreenState();
}

// Two-step phone + OTP sign-in. Step 1 captures phone and calls
// /auth/phone-otp/request (no-op today, future SMS dispatch); step 2
// captures the 6-digit OTP and calls /auth/phone-otp/verify which either
// returns a session for an existing user or auto-provisions a viewer-role
// user from a matching employee row.
enum _Step { phone, otp }

class _SignInScreenState extends ConsumerState<SignInScreen> with SingleTickerProviderStateMixin {
  final _phone = TextEditingController();
  final _otp = TextEditingController();
  _Step _step = _Step.phone;
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
    _phone.dispose();
    _otp.dispose();
    _enter.dispose();
    super.dispose();
  }

  Future<void> _requestOtp() async {
    FocusScope.of(context).unfocus();
    final phone = _phone.text.trim();
    // Server normalises (strips non-digits, drops a 91 country prefix), but
    // we still bail early on obviously-too-short input to save the round trip.
    if (phone.replaceAll(RegExp(r'\D'), '').length < 10) {
      setState(() => _error = 'Enter a valid 10-digit mobile number.');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await ref.read(authProvider.notifier).requestOtp(phone);
      if (!mounted) return;
      setState(() => _step = _Step.otp);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    } catch (e) {
      if (!mounted) return;
      debugPrint('[signin] requestOtp error: $e');
      setState(() => _error = kDebugMode
          ? 'Connection failed: $e'
          : 'Could not reach the server. Check your connection.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    if (_otp.text.trim().length != 6) {
      setState(() => _error = 'Enter the 6-digit OTP.');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await ref.read(authProvider.notifier).verifyOtp(_phone.text, _otp.text);
      if (!mounted) return;
      // Wait briefly for /hr/me so the landing matches role on first paint
      // — admins get Finance Home, everyone else gets HR Home. The router
      // redirect catches stragglers if HrMe takes longer than the budget.
      try {
        await ref.read(hrMeProvider.future).timeout(const Duration(milliseconds: 600));
      } catch (_) {}
      if (!mounted) return;
      final role = ref.read(appRoleProvider);
      // Non-admins always land in HR. Admins return to the module they
      // last used, so a sign-in mid-day doesn't yank them out of context.
      String landing;
      if (!role.canAccessFinance) {
        landing = '/hr/home';
      } else {
        landing = ref.read(appModuleProvider) == AppModule.hr ? '/hr/home' : '/home';
      }
      context.go(landing);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.statusCode == 401
          ? 'Invalid OTP. Try again.'
          : e.statusCode == 404
              ? 'No account found for this phone. Ask your admin to add you.'
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
    final p = _Palette.of(context);
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: p.statusBarIconBrightness,
      ),
      child: Scaffold(
        backgroundColor: p.bg,
        body: Stack(
          children: [
            Positioned.fill(child: _BackgroundGradient(palette: p)),
            Positioned.fill(child: _GlowBlobs(palette: p)),
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
                      _LogoBlock(fade: _logoFade, scale: _logoScale, palette: p),
                      const SizedBox(height: 28),
                      if (widget.sessionExpired)
                        FadeTransition(
                          opacity: _cardFade,
                          child: Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: _SessionExpiredBanner(palette: p),
                          ),
                        ),
                      SlideTransition(
                        position: _cardSlide,
                        child: FadeTransition(
                          opacity: _cardFade,
                          child: _SignInCard(
                            palette: p,
                            phone: _phone,
                            otp: _otp,
                            step: _step,
                            error: _error,
                            loading: _loading,
                            onRequestOtp: _requestOtp,
                            onVerifyOtp: _submit,
                            onChangePhone: () {
                              setState(() {
                                _step = _Step.phone;
                                _otp.clear();
                                _error = null;
                              });
                            },
                          ),
                        ),
                      ),
                      const SizedBox(height: 28),
                      FadeTransition(
                        opacity: _cardFade,
                        child: Center(
                          child: Text(
                            'runQ Finance v1',
                            style: RunqText.label.copyWith(color: p.subtleInk),
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
  final _Palette palette;
  const _BackgroundGradient({required this.palette});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: palette.bgGradient,
          stops: const [0, 0.55, 1],
        ),
      ),
    );
  }
}

class _GlowBlobs extends StatelessWidget {
  final _Palette palette;
  const _GlowBlobs({required this.palette});

  @override
  Widget build(BuildContext context) {
    return CustomPaint(painter: _GlowPainter(palette: palette));
  }
}

class _GlowPainter extends CustomPainter {
  final _Palette palette;
  _GlowPainter({required this.palette});

  @override
  void paint(Canvas canvas, Size size) {
    final p1 = Paint()
      ..shader = RadialGradient(
        colors: [palette.glowIndigo, const Color(0x00000000)],
      ).createShader(Rect.fromCircle(center: Offset(size.width * 0.85, size.height * 0.18), radius: size.width * 0.7));
    canvas.drawRect(Offset.zero & size, p1);
    final p2 = Paint()
      ..shader = RadialGradient(
        colors: [palette.glowViolet, const Color(0x00000000)],
      ).createShader(Rect.fromCircle(center: Offset(-size.width * 0.1, size.height * 0.85), radius: size.width * 0.8));
    canvas.drawRect(Offset.zero & size, p2);
  }

  @override
  bool shouldRepaint(covariant _GlowPainter old) => old.palette != palette;
}

class _LogoBlock extends StatelessWidget {
  final Animation<double> fade, scale;
  final _Palette palette;
  const _LogoBlock({required this.fade, required this.scale, required this.palette});

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
                style: RunqText.h4.copyWith(color: palette.titleInk),
              ),
              const SizedBox(height: 4),
              Text(
                'Finance & Accounting ERP',
                style: RunqText.body.copyWith(color: palette.subtitleInk),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _SessionExpiredBanner extends StatelessWidget {
  final _Palette palette;
  const _SessionExpiredBanner({required this.palette});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: palette.sessionBg,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: palette.sessionBorder, width: 0.5),
      ),
      child: Row(
        children: [
          Icon(Icons.info_outline_rounded, size: 16, color: palette.sessionText),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'Your session has expired. Please sign in again.',
              style: RunqText.caption.copyWith(color: palette.sessionText),
            ),
          ),
        ],
      ),
    );
  }
}

class _SignInCard extends StatelessWidget {
  final _Palette palette;
  final TextEditingController phone, otp;
  final _Step step;
  final String? error;
  final bool loading;
  final VoidCallback onRequestOtp;
  final VoidCallback onVerifyOtp;
  final VoidCallback onChangePhone;
  const _SignInCard({
    required this.palette,
    required this.phone,
    required this.otp,
    required this.step,
    required this.error,
    required this.loading,
    required this.onRequestOtp,
    required this.onVerifyOtp,
    required this.onChangePhone,
  });

  @override
  Widget build(BuildContext context) {
    final isPhoneStep = step == _Step.phone;
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: palette.cardBg,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: palette.cardBorder, width: 0.6),
        boxShadow: [
          BoxShadow(color: palette.cardShadow, blurRadius: 40, offset: const Offset(0, 20)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (isPhoneStep)
            _ThemedField(
              palette: palette,
              label: 'Mobile number',
              controller: phone,
              hint: '98765 43210',
              icon: Icons.phone_iphone_rounded,
              keyboardType: TextInputType.phone,
              autofillHints: const [AutofillHints.telephoneNumber],
              textInputAction: TextInputAction.done,
              onSubmitted: (_) => onRequestOtp(),
            )
          else ...[
            // Echo the phone the user just typed, with an inline "change"
            // affordance so a typo isn't fatal — going back resets the OTP
            // field and the error so the user lands cleanly on step 1 again.
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Row(
                children: [
                  Icon(Icons.phone_iphone_rounded, size: 16, color: palette.iconMuted),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      phone.text.trim(),
                      style: RunqText.body.copyWith(color: palette.fieldText),
                    ),
                  ),
                  GestureDetector(
                    onTap: loading ? null : onChangePhone,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 4),
                      child: Text(
                        'Change',
                        style: RunqText.bodyStrong.copyWith(color: palette.linkInk),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            _ThemedField(
              palette: palette,
              label: 'One-time password',
              controller: otp,
              hint: '••••••',
              icon: Icons.lock_outline_rounded,
              keyboardType: TextInputType.number,
              textInputAction: TextInputAction.done,
              onSubmitted: (_) => onVerifyOtp(),
            ),
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                'Test mode: use 123456',
                style: RunqText.caption.copyWith(color: palette.subtitleInk),
              ),
            ),
          ],
          if (error != null) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: palette.errorBg,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: palette.errorBorder, width: 0.5),
              ),
              child: Row(
                children: [
                  Icon(Icons.error_outline_rounded, size: 14, color: palette.errorText),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      error!,
                      style: RunqText.caption.copyWith(color: palette.errorText),
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
              onPressed: loading ? null : (isPhoneStep ? onRequestOtp : onVerifyOtp),
              style: FilledButton.styleFrom(
                backgroundColor: palette.primaryBtn,
                disabledBackgroundColor: palette.primaryBtn.withValues(alpha: 0.6),
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
                        Icon(isPhoneStep ? Icons.arrow_forward_rounded : Icons.login_rounded, size: 16),
                        const SizedBox(width: 8),
                        Text(
                          isPhoneStep ? 'Send OTP' : 'Sign in',
                          style: RunqText.bodyStrong.copyWith(color: Colors.white),
                        ),
                      ],
                    ),
            ),
          ),
          const SizedBox(height: 14),
          Center(
            child: GestureDetector(
              onTap: () => _openContactPage(context),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Text.rich(
                  TextSpan(
                    style: RunqText.caption.copyWith(color: palette.subtitleInk),
                    children: [
                      const TextSpan(text: 'New to runQ? '),
                      TextSpan(
                        text: 'Request access',
                        style: RunqText.bodyStrong.copyWith(color: palette.linkInk),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

Future<void> _openContactPage(BuildContext context) async {
  final uri = Uri.parse('https://www.runq.in/contact');
  final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
  if (!ok && context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Visit www.runq.in/contact to get in touch.')),
    );
  }
}

class _ThemedField extends StatelessWidget {
  final _Palette palette;
  final String label, hint;
  final IconData icon;
  final TextEditingController controller;
  final TextInputType? keyboardType;
  final List<String>? autofillHints;
  final TextInputAction? textInputAction;
  final ValueChanged<String>? onSubmitted;
  const _ThemedField({
    required this.palette,
    required this.label,
    required this.hint,
    required this.icon,
    required this.controller,
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
          style: RunqText.bodyStrong.copyWith(color: palette.labelInk),
        ),
        const SizedBox(height: 6),
        Container(
          decoration: BoxDecoration(
            color: palette.fieldBg,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: palette.fieldBorder, width: 0.5),
          ),
          child: TextField(
            controller: controller,
            keyboardType: keyboardType,
            autofillHints: autofillHints,
            textInputAction: textInputAction,
            onSubmitted: onSubmitted,
            // Default is 20px — too tight here. Pushes the focused field up
            // enough that the Sign-in button + signup link stay visible
            // above the keypad without manual scrolling.
            scrollPadding: const EdgeInsets.only(bottom: 140),
            style: RunqText.body.copyWith(color: palette.fieldText),
            cursorColor: palette.linkInk,
            decoration: InputDecoration(
              prefixIcon: Padding(
                padding: const EdgeInsets.only(left: 12, right: 8),
                child: Icon(icon, size: 18, color: palette.iconMuted),
              ),
              prefixIconConstraints: const BoxConstraints(minWidth: 0, minHeight: 0),
              hintText: hint,
              hintStyle: RunqText.body.copyWith(color: palette.fieldHint),
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
