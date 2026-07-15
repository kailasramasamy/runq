import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/auth_provider.dart';
import '../../providers/locale_provider.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../widgets/language_picker.dart';
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
    final l = AppLocalizations.of(context);
    final expired = ref.watch(authProvider.select((s) => s.sessionExpired));
    return Scaffold(
      body: SafeArea(
        child: ListView(
          controller: _scroll,
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.xl, vertical: DhenuSpacing.x4),
          children: [
            // Language switch must be reachable BEFORE login — a Kannada-only
            // user can't read this screen to find a post-login picker.
            Align(alignment: Alignment.centerRight, child: _languageButton(t)),
            const SizedBox(height: DhenuSpacing.md),
            _logo(),
            const SizedBox(height: DhenuSpacing.md),
            Center(child: Text('dhenu', style: DhenuText.h1.copyWith(color: t.brand))),
            const SizedBox(height: DhenuSpacing.xs),
            Center(child: Text(l.authLoginTagline, style: DhenuText.body.copyWith(color: t.inkSoft))),
            const SizedBox(height: DhenuSpacing.x4),
            if (expired) _expiredBanner(t, l),
            _loginSection(t),
          ],
        ),
      ),
    );
  }

  /// Pre-login language switch: shows the current language's native label so
  /// it's recognizable in any locale (e.g. "ಕನ್ನಡ", not "Kannada").
  Widget _languageButton(DhenuTokens t) {
    final current = ref.watch(localeProvider);
    return OutlinedButton.icon(
      onPressed: () => showLanguagePicker(context, ref),
      icon: Icon(DhenuIcons.language, size: 16, color: t.inkSoft),
      label: Text(
        languageForCode(current.languageCode).nativeLabel,
        style: DhenuText.label.copyWith(color: t.ink),
      ),
      style: OutlinedButton.styleFrom(
        side: BorderSide(color: t.hairline),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(DhenuRadii.pill)),
      ),
    );
  }

  /// Shown when a session lapsed (token expired / 401). Re-auth is the same
  /// phone + OTP flow below — this just explains why they're back at login.
  Widget _expiredBanner(DhenuTokens t, AppLocalizations l) => Container(
        key: const ValueKey('login-expired-banner'),
        margin: const EdgeInsets.only(bottom: DhenuSpacing.lg),
        padding: const EdgeInsets.all(DhenuSpacing.md),
        decoration: BoxDecoration(
          color: t.brand.withValues(alpha: 0.10),
          borderRadius: BorderRadius.circular(DhenuRadii.input),
        ),
        child: Text(l.authLoginSessionExpired,
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
