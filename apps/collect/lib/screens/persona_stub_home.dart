import 'package:flutter/material.dart';
import '../theme/dhenu_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/auth_provider.dart';
import '../theme/dhenu_theme.dart';
import '../theme/dhenu_tokens.dart';
import '../widgets/dhenu_states.dart';

/// Shared placeholder home for personas whose full dashboards land in a later
/// wave (CC/PP → B4, Farmer → B3/Wave 5, Admin → small). Carries a sign-out so
/// the auth loop is testable end-to-end today.
class PersonaStubHome extends ConsumerWidget {
  const PersonaStubHome({
    super.key,
    required this.title,
    required this.icon,
    required this.message,
  });

  final String title;
  final IconData icon;
  final String message;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(title, style: DhenuText.h2.copyWith(color: t.ink)),
        actions: [
          IconButton(
            onPressed: () => ref.read(authProvider.notifier).logout(),
            icon: const Icon(DhenuIcons.logout),
          ),
        ],
      ),
      body: Center(
        child: DhenuEmptyState(icon: icon, title: title, subtitle: message),
      ),
    );
  }
}
