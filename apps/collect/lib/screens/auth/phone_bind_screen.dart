import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../providers/auth_provider.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../widgets/phone_otp_form.dart';

/// First social login — link the just-signed-in Google/Apple identity to the
/// runq user by phone + OTP (the one-time ownership check). After this, the
/// social sign-in resolves directly and no bind is needed again.
class PhoneBindScreen extends ConsumerWidget {
  const PhoneBindScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    return Scaffold(
      appBar: AppBar(title: const Text("Verify it's you")),
      body: ListView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.all(DhenuSpacing.xl),
        children: [
          Text(
            'Enter your registered phone number to receive a one-time code and link this account.',
            style: DhenuText.body.copyWith(color: t.inkSoft),
          ),
          const SizedBox(height: DhenuSpacing.xl),
          _bindCard(t, ref, context),
        ],
      ),
    );
  }

  /// Bind controls in their own card, set apart from the explanatory copy above
  /// so the action area reads as a distinct, focused section.
  Widget _bindCard(DhenuTokens t, WidgetRef ref, BuildContext context) => Container(
        padding: const EdgeInsets.all(DhenuSpacing.xl),
        decoration: BoxDecoration(
          color: t.card,
          borderRadius: BorderRadius.circular(DhenuRadii.cardLg),
          border: Border.all(color: t.hairline),
          boxShadow: DhenuShadows.card,
        ),
        child: PhoneOtpForm(
          submitLabel: 'Link account',
          onRequestOtp: (phone) => ref.read(authProvider.notifier).requestOtp(phone),
          onSubmit: (phone, otp) async {
            await ref.read(authProvider.notifier).bindWithOtp(phone, otp);
            if (context.mounted) context.go('/home');
          },
        ),
      );
}
