import 'package:flutter/material.dart';
import '../theme/dhenu_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/auth_provider.dart';
import '../theme/dhenu_theme.dart';
import '../theme/dhenu_tokens.dart';
import '../widgets/dhenu_states.dart';

/// Authenticated, but this account isn't set up for Dhenu (no
/// `milk_procurement` module grant, or an unrecognised role).
class NoAccessScreen extends ConsumerWidget {
  const NoAccessScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(DhenuSpacing.xl),
          child: DhenuEmptyState(
            icon: DhenuIcons.lock,
            title: 'No Dhenu access yet',
            subtitle: 'Ask your dairy administrator to enable milk procurement for your account.',
            action: TextButton(
              onPressed: () => ref.read(authProvider.notifier).logout(),
              child: Text('Sign out', style: DhenuText.label.copyWith(color: t.brand)),
            ),
          ),
        ),
      ),
    );
  }
}
