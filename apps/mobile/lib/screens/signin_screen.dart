import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';
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

// Two-step phone-OTP sign-in:
//   - `phone` — enter the mobile number; we send an SMS code via Firebase.
//   - `otp`   — enter the 6-digit code Firebase texted, which proves ownership
//               of the number and signs the matching employee in.
enum _Step { phone, otp }

// Seconds to wait before the "Resend code" link becomes tappable again.
const _resendCooldown = 30;

class _SignInScreenState extends ConsumerState<SignInScreen> with SingleTickerProviderStateMixin {
  final _phone = TextEditingController();
  final _otp = TextEditingController();
  _Step _step = _Step.phone;
  bool _loading = false;
  String? _error;
  Timer? _resendTimer;
  int _resendIn = 0;

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
    _resendTimer?.cancel();
    _enter.dispose();
    super.dispose();
  }

  // Request (or resend) the SMS code for the entered number. The server sends
  // it via MSG91; on success we advance to the code step and start the resend
  // cooldown. A 404 means the number isn't on file.
  Future<void> _sendCode() async {
    FocusScope.of(context).unfocus();
    if (_phone.text.replaceAll(RegExp(r'\D'), '').length != 10) {
      setState(() => _error = 'Enter a valid 10-digit mobile number.');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await ref.read(authProvider.notifier).requestOtp(_phone.text);
      if (!mounted) return;
      setState(() {
        _loading = false;
        _step = _Step.otp;
      });
      _startResendCountdown();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.statusCode == 404
            ? 'No employee found for this number. Ask your admin to add you.'
            : e.message;
      });
    } catch (e) {
      if (!mounted) return;
      debugPrint('[signin] sendCode error: $e');
      setState(() {
        _loading = false;
        _error = 'Could not send the code. Check your connection and try again.';
      });
    }
  }

  // Verify the typed 6-digit code, then land on success.
  Future<void> _verify() async {
    FocusScope.of(context).unfocus();
    if (_otp.text.trim().length != 6) {
      setState(() => _error = 'Enter the 6-digit code from the SMS.');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await ref.read(authProvider.notifier).submitOtp(_otp.text);
      if (!mounted) return;
      await _land();
    } on ApiException catch (e) {
      if (!mounted) return;
      _otp.clear();
      setState(() => _error = e.statusCode == 404
          ? 'No employee found for this number. Ask your admin to add you.'
          : e.message);
    } catch (e) {
      if (!mounted) return;
      _otp.clear();
      debugPrint('[signin] verify error: $e');
      setState(() => _error = 'Could not reach the server. Check your connection.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _startResendCountdown() {
    _resendTimer?.cancel();
    setState(() => _resendIn = _resendCooldown);
    _resendTimer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return t.cancel();
      setState(() => _resendIn -= 1);
      if (_resendIn <= 0) t.cancel();
    });
  }

  // Return to the number step to correct a typo or use a different phone.
  void _editNumber() => setState(() {
        _step = _Step.phone;
        _otp.clear();
        _error = null;
        _resendTimer?.cancel();
        _resendIn = 0;
      });

  // Wait briefly for /hr/me so the landing matches role on first paint —
  // admins get Finance Home, everyone else gets HR Home. The router redirect
  // catches stragglers if HrMe takes longer than the budget.
  Future<void> _land() async {
    try {
      await ref.read(hrMeProvider.future).timeout(const Duration(milliseconds: 600));
    } catch (_) {}
    if (!mounted) return;
    final role = ref.read(appRoleProvider);
    // Non-admins always land in HR. Admins return to the module they last
    // used, so a sign-in mid-day doesn't yank them out of context.
    final String landing;
    if (!role.canAccessFinance) {
      landing = '/hr/home';
    } else {
      landing = ref.read(appModuleProvider) == AppModule.hr ? '/hr/home' : '/home';
    }
    context.go(landing);
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
        // Keep the body full-height when the keyboard opens so the gradient
        // spans the whole screen seamlessly behind the keypad instead of
        // being squeezed above it. The scroll view below absorbs the
        // keyboard inset itself via viewInsets.bottom padding.
        resizeToAvoidBottomInset: false,
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
                            resendIn: _resendIn,
                            onSendCode: _sendCode,
                            onVerify: _verify,
                            onResend: _sendCode,
                            onEditNumber: _editNumber,
                          ),
                        ),
                      ),
                      const SizedBox(height: 24),
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
                'Run your business, end to end',
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
  final int resendIn;
  final VoidCallback onSendCode;
  final VoidCallback onVerify;
  final VoidCallback onResend;
  final VoidCallback onEditNumber;
  const _SignInCard({
    required this.palette,
    required this.phone,
    required this.otp,
    required this.step,
    required this.error,
    required this.loading,
    required this.resendIn,
    required this.onSendCode,
    required this.onVerify,
    required this.onResend,
    required this.onEditNumber,
  });

  @override
  Widget build(BuildContext context) {
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
          if (step == _Step.phone) ..._phoneBody() else ..._otpBody(),
          if (error != null) ...[
            const SizedBox(height: 14),
            _ErrorBanner(palette: palette, message: error!),
          ],
        ],
      ),
    );
  }

  List<Widget> _phoneBody() {
    return [
      Padding(
        padding: const EdgeInsets.only(bottom: 14),
        child: Text(
          'Enter your mobile number and we\'ll text you a one-time code.',
          style: RunqText.caption.copyWith(color: palette.subtitleInk),
        ),
      ),
      _ThemedField(
        palette: palette,
        label: 'Mobile number',
        controller: phone,
        hint: '98765 43210',
        icon: Icons.phone_iphone_rounded,
        keyboardType: TextInputType.phone,
        leadingText: '+91',
        autofillHints: const [AutofillHints.telephoneNumber],
        textInputAction: TextInputAction.done,
        inputFormatters: [
          FilteringTextInputFormatter.digitsOnly,
          LengthLimitingTextInputFormatter(10),
        ],
      ),
      const SizedBox(height: 18),
      _PrimaryButton(
        palette: palette,
        loading: loading,
        icon: Icons.sms_outlined,
        label: 'Send code',
        onPressed: loading ? null : onSendCode,
      ),
    ];
  }

  List<Widget> _otpBody() {
    return [
      Padding(
        padding: const EdgeInsets.only(bottom: 14),
        child: Text.rich(
          TextSpan(
            style: RunqText.caption.copyWith(color: palette.subtitleInk),
            children: [
              const TextSpan(text: 'Enter the 6-digit code sent to '),
              TextSpan(
                text: '+91 ${phone.text}',
                style: RunqText.caption.copyWith(color: palette.titleInk),
              ),
              const TextSpan(text: '.'),
            ],
          ),
        ),
      ),
      _OtpInput(
        palette: palette,
        controller: otp,
        loading: loading,
        label: 'Verification code',
        autofocus: true,
        onCompleted: onVerify,
      ),
      const SizedBox(height: 18),
      _PrimaryButton(
        palette: palette,
        loading: loading,
        icon: Icons.login_rounded,
        label: 'Verify & sign in',
        onPressed: loading ? null : onVerify,
      ),
      const SizedBox(height: 6),
      Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          TextButton(
            onPressed: loading ? null : onEditNumber,
            child: Text('Change number',
                style: RunqText.bodyStrong.copyWith(color: palette.linkInk)),
          ),
          TextButton(
            onPressed: (loading || resendIn > 0) ? null : onResend,
            child: Text(
              resendIn > 0 ? 'Resend in ${resendIn}s' : 'Resend code',
              style: RunqText.bodyStrong.copyWith(
                color: resendIn > 0 ? palette.subtleInk : palette.linkInk,
              ),
            ),
          ),
        ],
      ),
    ];
  }
}

// The card's primary action — a full-width brand-coloured pill with a spinner
// while [loading].
class _PrimaryButton extends StatelessWidget {
  final _Palette palette;
  final bool loading;
  final IconData icon;
  final String label;
  final VoidCallback? onPressed;
  const _PrimaryButton({
    required this.palette,
    required this.loading,
    required this.icon,
    required this.label,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 48,
      child: FilledButton(
        onPressed: onPressed,
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
                  Icon(icon, size: 16),
                  const SizedBox(width: 8),
                  Text(label, style: RunqText.bodyStrong.copyWith(color: Colors.white)),
                ],
              ),
      ),
    );
  }
}

class _ErrorBanner extends StatelessWidget {
  final _Palette palette;
  final String message;
  const _ErrorBanner({required this.palette, required this.message});

  @override
  Widget build(BuildContext context) {
    return Container(
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
            child: Text(message, style: RunqText.caption.copyWith(color: palette.errorText)),
          ),
        ],
      ),
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
  final String? leadingText;
  final List<TextInputFormatter>? inputFormatters;
  const _ThemedField({
    required this.palette,
    required this.label,
    required this.hint,
    required this.icon,
    required this.controller,
    this.keyboardType,
    this.autofillHints,
    this.textInputAction,
    this.leadingText,
    this.inputFormatters,
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
            inputFormatters: inputFormatters,
            // resizeToAvoidBottomInset is false, so the viewport runs full-height
            // behind the keypad; scrollPadding is measured from the screen
            // bottom, hence the keyboard height. Only a small margin on top —
            // the field sits well above the keypad and just needs the "Send
            // code" button below it clear. A larger value over-scrolls and
            // clips the logo off the top.
            scrollPadding: EdgeInsets.only(
                bottom: MediaQuery.of(context).viewInsets.bottom + 24),
            style: RunqText.body.copyWith(color: palette.fieldText),
            cursorColor: palette.linkInk,
            decoration: InputDecoration(
              prefixIcon: Padding(
                padding: const EdgeInsets.only(left: 12, right: 8),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(icon, size: 18, color: palette.iconMuted),
                    if (leadingText != null) ...[
                      const SizedBox(width: 8),
                      Text(
                        leadingText!,
                        style: RunqText.body.copyWith(color: palette.fieldText),
                      ),
                      const SizedBox(width: 8),
                      Container(width: 1, height: 18, color: palette.fieldBorder),
                    ],
                  ],
                ),
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

// Segmented 6-digit code entry. A single transparent TextField (sharing the
// parent's controller) captures keystrokes and SMS autofill, while six boxes
// render the digits and track the caret position. Fires onCompleted the
// moment the sixth digit lands so there's no extra tap to verify.
class _OtpInput extends StatefulWidget {
  final _Palette palette;
  final TextEditingController controller;
  final bool loading;
  final String label;
  final bool autofocus;
  final VoidCallback onCompleted;
  const _OtpInput({
    required this.palette,
    required this.controller,
    required this.loading,
    this.label = 'One-time code',
    this.autofocus = true,
    required this.onCompleted,
  });

  @override
  State<_OtpInput> createState() => _OtpInputState();
}

class _OtpInputState extends State<_OtpInput> {
  final _focus = FocusNode();

  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_refresh);
    _focus.addListener(_refresh);
  }

  void _refresh() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    widget.controller.removeListener(_refresh);
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.palette;
    final text = widget.controller.text;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          widget.label,
          style: RunqText.bodyStrong.copyWith(color: p.labelInk),
        ),
        const SizedBox(height: 6),
        Stack(
          children: [
            Row(
              children: List.generate(6, (i) {
                final filled = i < text.length;
                final active =
                    _focus.hasFocus && i == text.length && !widget.loading;
                return Expanded(
                  child: Padding(
                    padding: EdgeInsets.only(right: i == 5 ? 0 : 8),
                    child: Container(
                      height: 52,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: p.fieldBg,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                          color: active ? p.linkInk : p.fieldBorder,
                          width: active ? 1.5 : 0.5,
                        ),
                      ),
                      child: Text(
                        filled ? text[i] : '',
                        style: RunqText.h4.copyWith(color: p.fieldText),
                      ),
                    ),
                  ),
                );
              }),
            ),
            // Invisible field on top of the boxes: it owns the keyboard,
            // a tap anywhere on the row focuses it. readOnly (not disabled)
            // while loading so focus survives a failed auto-submit.
            Positioned.fill(
              child: Opacity(
                opacity: 0,
                child: TextField(
                  controller: widget.controller,
                  focusNode: _focus,
                  autofocus: widget.autofocus,
                  readOnly: widget.loading,
                  showCursor: false,
                  keyboardType: TextInputType.number,
                  textInputAction: TextInputAction.done,
                  autofillHints: const [AutofillHints.oneTimeCode],
                  // Keyboard height (viewport runs behind the keypad) plus a
                  // small margin for the verify button just below. Keep it
                  // small so focus doesn't over-scroll and clip the logo.
                  scrollPadding: EdgeInsets.only(
                      bottom: MediaQuery.of(context).viewInsets.bottom + 24),
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(6),
                  ],
                  decoration: const InputDecoration(
                    counterText: '',
                    border: InputBorder.none,
                  ),
                  onChanged: (v) {
                    if (v.length == 6 && !widget.loading) {
                      FocusScope.of(context).unfocus();
                      widget.onCompleted();
                    }
                  },
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}
