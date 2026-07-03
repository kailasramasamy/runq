import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/auth_provider.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../widgets/phone_otp_form.dart';

/// Dhenu sign-in — phone number + OTP (MSG91). Phone is the account identity for
/// the milk-procurement roster; there is no social sign-in.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});
  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> with WidgetsBindingObserver {
  final _scroll = ScrollController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _scroll.dispose();
    super.dispose();
  }

  /// When the keyboard opens, scroll the form to the end so the phone field,
  /// OTP code, and action button all clear the keypad.
  @override
  void didChangeMetrics() {
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

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final expired = ref.watch(authProvider.select((s) => s.sessionExpired));
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
            if (expired) _expiredBanner(t),
            _loginSection(t),
          ],
        ),
      ),
    );
  }

  /// Shown when a session lapsed (token expired / 401). Re-auth is the same
  /// phone + OTP flow below — this just explains why they're back at login.
  Widget _expiredBanner(DhenuTokens t) => Container(
        key: const ValueKey('login-expired-banner'),
        margin: const EdgeInsets.only(bottom: DhenuSpacing.lg),
        padding: const EdgeInsets.all(DhenuSpacing.md),
        decoration: BoxDecoration(
          color: t.brand.withValues(alpha: 0.10),
          borderRadius: BorderRadius.circular(DhenuRadii.input),
        ),
        child: Text('Your session expired. Sign in again with your phone number.',
            style: DhenuText.body.copyWith(color: t.ink)),
      );

  /// Login controls live in their own card, set apart from the branding above
  /// so the action area reads as a distinct, focused section.
  Widget _loginSection(DhenuTokens t) => Container(
        // Keyed so the banner appearing/disappearing above doesn't shift this
        // card's position in the ListView and rebuild PhoneOtpForm — which would
        // reset it from the OTP step back to the phone step mid-sign-in.
        key: const ValueKey('login-section'),
        padding: const EdgeInsets.all(DhenuSpacing.xl),
        decoration: BoxDecoration(
          color: t.card,
          borderRadius: BorderRadius.circular(DhenuRadii.cardLg),
          border: Border.all(color: t.hairline),
          boxShadow: DhenuShadows.card,
        ),
        child: PhoneOtpForm(
          onRequestOtp: (phone) {
            ref.read(authProvider.notifier).clearSessionExpired();
            return ref.read(authProvider.notifier).requestOtp(phone);
          },
          onSubmit: (phone, otp) => ref.read(authProvider.notifier).loginWithOtp(phone, otp),
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
}
