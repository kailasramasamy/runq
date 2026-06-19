import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import '../../theme/dhenu_icons.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
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

class _LoginScreenState extends ConsumerState<LoginScreen> {
  bool _busy = false;
  bool _phoneMode = false;
  String? _error;
  final _phone = TextEditingController();
  final _dob = TextEditingController();

  @override
  void dispose() {
    _phone.dispose();
    _dob.dispose();
    super.dispose();
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
            if (_error != null) _errorBox(t),
            if (_phoneMode) ..._phoneForm(t) else ..._socialButtons(t),
          ],
        ),
      ),
    );
  }

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

  List<Widget> _socialButtons(DhenuTokens t) => [
        FilledButton.icon(
          onPressed: _busy ? null : _google,
          icon: const Icon(DhenuIcons.circleUser, color: Colors.white),
          label: const Text('Continue with Google'),
        ),
        if (FirebaseAuthService.instance.appleSignInSupported) ...[
          const SizedBox(height: DhenuSpacing.md),
          FilledButton.icon(
            onPressed: _busy ? null : _apple,
            icon: const Icon(DhenuIcons.apple, color: Colors.white),
            label: const Text('Continue with Apple'),
          ),
        ],
        const SizedBox(height: DhenuSpacing.lg),
        TextButton(
          onPressed: _busy ? null : () => setState(() => _phoneMode = true),
          child: Text('Sign in with phone number', style: DhenuText.label.copyWith(color: t.brand)),
        ),
        if (_busy) const Padding(
          padding: EdgeInsets.only(top: DhenuSpacing.lg),
          child: Center(child: CircularProgressIndicator()),
        ),
      ];

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
        DobOtpField(controller: _dob),
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
