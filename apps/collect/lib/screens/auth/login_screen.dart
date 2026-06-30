import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import '../../theme/dhenu_icons.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';
import '../../api/api_client.dart';
import '../../api/api_config.dart';
import '../../providers/auth_provider.dart';
import '../../services/firebase_auth_service.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../widgets/dob_otp_field.dart';

/// Dhenu sign-in. Google/Apple are the primary path (reused from runq mobile);
/// phone + DOB is the no-Firebase fallback that lets field users (and tests)
/// sign in without a social account.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});
  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> with WidgetsBindingObserver {
  bool _busy = false;
  bool _phoneMode = false;
  String? _error;
  final _phone = TextEditingController();
  final _dob = TextEditingController();
  final _scroll = ScrollController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _phone.dispose();
    _dob.dispose();
    _scroll.dispose();
    super.dispose();
  }

  /// When the keyboard opens, scroll the form to the end so the phone field,
  /// secret code, and Sign-in button all clear the keypad.
  @override
  void didChangeMetrics() {
    if (!_phoneMode) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scroll.hasClients) return;
      // Stop a little short of the very bottom so the form sits just above the
      // keypad rather than scrolling the whole bottom padding into view.
      final target = (_scroll.position.maxScrollExtent - DhenuSpacing.x4)
          .clamp(0.0, _scroll.position.maxScrollExtent);
      _scroll.animateTo(
        target,
        duration: const Duration(milliseconds: 250),
        curve: Curves.easeOut,
      );
    });
  }

  Future<void> _run(Future<void> Function() action) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      // Network/timeout (server down, wrong host, off-network). Surface it
      // instead of dying as an unhandled exception with a silent spinner.
      setState(() => _error = kDebugMode
          ? "Can't reach the server at ${ApiConfig.baseUrl}. Is the API running and the phone on the same network?"
          : "Can't reach the server. Check your connection and try again.");
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _google() => _run(() async {
        final r = await ref.read(authProvider.notifier).signInWithGoogle();
        if (r == SocialResult.needsBinding && mounted) context.push('/bind');
      });

  Future<void> _apple() => _run(() async {
        final r = await ref.read(authProvider.notifier).signInWithApple();
        if (r == SocialResult.needsBinding && mounted) context.push('/bind');
      });

  Future<void> _phoneLogin() => _run(
        () => ref.read(authProvider.notifier).loginWithDob(_phone.text, _dob.text),
      );

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    return Scaffold(
      body: SafeArea(
        child: ListView(
          controller: _scroll,
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.xl, vertical: DhenuSpacing.x4),
          children: [
            const SizedBox(height: DhenuSpacing.x4),
            _logo(),
            const SizedBox(height: DhenuSpacing.md),
            Center(child: Text('dhenu', style: DhenuText.h1.copyWith(color: t.brand))),
            const SizedBox(height: DhenuSpacing.xs),
            Center(child: Text('Milk procurement, made fair', style: DhenuText.body.copyWith(color: t.inkSoft))),
            const SizedBox(height: DhenuSpacing.x4),
            _loginSection(t),
          ],
        ),
      ),
    );
  }

  /// Login controls live in their own card, set apart from the branding above
  /// so the action area reads as a distinct, focused section.
  Widget _loginSection(DhenuTokens t) => Container(
        padding: const EdgeInsets.all(DhenuSpacing.xl),
        decoration: BoxDecoration(
          color: t.card,
          borderRadius: BorderRadius.circular(DhenuRadii.cardLg),
          border: Border.all(color: t.hairline),
          boxShadow: DhenuShadows.card,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (_error != null) _errorBox(t),
            if (_phoneMode) ..._phoneForm(t) else ..._socialButtons(t),
          ],
        ),
      );

  Widget _logo() => Center(
        child: Container(
          width: 88,
          height: 88,
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(DhenuRadii.card),
            boxShadow: DhenuShadows.card,
          ),
          child: Image.asset('assets/branding/dhenu-app-logo.png', fit: BoxFit.cover),
        ),
      );

  Widget _errorBox(DhenuTokens t) => Container(
        margin: const EdgeInsets.only(bottom: DhenuSpacing.lg),
        padding: const EdgeInsets.all(DhenuSpacing.md),
        decoration: BoxDecoration(
          color: t.gradeC.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(DhenuRadii.input),
        ),
        child: Text(_error!, style: DhenuText.body.copyWith(color: t.gradeC)),
      );

  List<Widget> _socialButtons(DhenuTokens t) {
    // Google & Apple buttons follow each vendor's official sign-in branding
    // (white/neutral Google with the 4-colour "G"; black/white Apple button).
    final dark = Theme.of(context).brightness == Brightness.dark;
    final showApple = FirebaseAuthService.instance.appleSignInSupported;
    // iOS leads with Apple (Apple HIG); every other platform leads with Google.
    final appleFirst = showApple && defaultTargetPlatform == TargetPlatform.iOS;
    return [
      if (appleFirst) ...[
        _appleButton(dark),
        const SizedBox(height: DhenuSpacing.md),
        _googleButton(dark),
      ] else ...[
        _googleButton(dark),
        if (showApple) ...[
          const SizedBox(height: DhenuSpacing.md),
          _appleButton(dark),
        ],
      ],
      const SizedBox(height: DhenuSpacing.md),
      OutlinedButton.icon(
        onPressed: _busy ? null : () => setState(() => _phoneMode = true),
        icon: Icon(DhenuIcons.phone, color: t.brand),
        label: Text('Sign in with phone number', style: DhenuText.label.copyWith(color: t.brand)),
        style: OutlinedButton.styleFrom(
          minimumSize: const Size.fromHeight(DhenuSpacing.minTap),
          side: BorderSide(color: t.brand),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(DhenuRadii.button)),
        ),
      ),
      if (_busy) const Padding(
        padding: EdgeInsets.only(top: DhenuSpacing.lg),
        child: Center(child: CircularProgressIndicator()),
      ),
    ];
  }

  /// Google-branded button per Google's sign-in guidelines: white surface +
  /// #1F1F1F text in light mode, neutral dark surface + light text in dark mode,
  /// always with the official 4-colour "G".
  Widget _googleButton(bool dark) {
    final bg = dark ? const Color(0xFF131314) : Colors.white;
    final fg = dark ? const Color(0xFFE3E3E3) : const Color(0xFF1F1F1F);
    final stroke = dark ? const Color(0xFF8E918F) : const Color(0xFF747775);
    return OutlinedButton.icon(
      onPressed: _busy ? null : _google,
      icon: SvgPicture.asset('assets/branding/google-g.svg', width: 20, height: 20),
      label: Text('Continue with Google',
          style: DhenuText.label.copyWith(color: fg, fontWeight: FontWeight.w600)),
      style: OutlinedButton.styleFrom(
        backgroundColor: bg,
        minimumSize: const Size.fromHeight(DhenuSpacing.minTap),
        side: BorderSide(color: stroke),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(DhenuRadii.button)),
      ),
    );
  }

  /// Apple-branded button: black surface + white logo/text (light) or the white
  /// variant (dark), per Apple's Sign in with Apple guidelines — but sized to
  /// match the Google/phone buttons so all three read as one set. Uses the
  /// official Apple logo via the package's [AppleLogoPainter].
  Widget _appleButton(bool dark) {
    final bg = dark ? Colors.white : Colors.black;
    final fg = dark ? Colors.black : Colors.white;
    return OutlinedButton.icon(
      onPressed: _busy ? null : _apple,
      icon: SizedBox(
        width: 18 * 25 / 31,
        height: 18,
        child: CustomPaint(painter: AppleLogoPainter(color: fg)),
      ),
      label: Text('Continue with Apple',
          style: DhenuText.label.copyWith(color: fg, fontWeight: FontWeight.w600)),
      style: OutlinedButton.styleFrom(
        backgroundColor: bg,
        minimumSize: const Size.fromHeight(DhenuSpacing.minTap),
        side: BorderSide(color: dark ? const Color(0xFF8E918F) : Colors.black),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(DhenuRadii.button)),
      ),
    );
  }

  List<Widget> _phoneForm(DhenuTokens t) => [
        TextField(
          controller: _phone,
          keyboardType: TextInputType.phone,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(10)],
          decoration: const InputDecoration(
            labelText: 'Phone number',
            hintText: '10-digit mobile',
            prefixIcon: Icon(DhenuIcons.phone),
          ),
        ),
        const SizedBox(height: DhenuSpacing.lg),
        DobOtpField(
          controller: _dob,
          label: 'Secret code',
          icon: DhenuIcons.lock,
          dateHints: false,
        ),
        const SizedBox(height: DhenuSpacing.lg),
        FilledButton(onPressed: _busy ? null : _phoneLogin, child: const Text('Sign in')),
        const SizedBox(height: DhenuSpacing.sm),
        TextButton(
          onPressed: _busy ? null : () => setState(() => _phoneMode = false),
          child: Text('Back', style: DhenuText.label.copyWith(color: t.inkSoft)),
        ),
        if (_busy) const Padding(
          padding: EdgeInsets.only(top: DhenuSpacing.lg),
          child: Center(child: CircularProgressIndicator()),
        ),
      ];
}
