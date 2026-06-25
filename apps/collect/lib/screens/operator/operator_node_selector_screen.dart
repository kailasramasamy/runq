import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/auth_provider.dart';
import '../../providers/mp_context_provider.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../widgets/operator_switcher.dart';

/// Landing screen for a field-operator assigned to more than one centre: a
/// greeting plus a card per directly-assigned node. Picking one sets
/// [mpActiveNodeProvider]; the home dispatcher then renders that node's shell.
class OperatorNodeSelectorScreen extends ConsumerWidget {
  const OperatorNodeSelectorScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    return Scaffold(
      backgroundColor: t.surface,
      body: SafeArea(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const _Header(),
          Expanded(
            child: OperatorNodeList(
              onPick: (n) => ref.read(mpActiveNodeProvider.notifier).state = n,
            ),
          ),
        ]),
      ),
    );
  }
}

class _Header extends ConsumerWidget {
  const _Header();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    final name = ref.watch(authProvider).user?.name?.trim();
    final greeting = (name == null || name.isEmpty) ? 'Namaste' : 'Namaste, $name';
    return Padding(
      padding: const EdgeInsets.fromLTRB(
          DhenuSpacing.screen, DhenuSpacing.lg, DhenuSpacing.sm, DhenuSpacing.sm),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(greeting, style: DhenuText.h1.copyWith(color: t.ink)),
            const SizedBox(height: DhenuSpacing.xs),
            Text('Choose a centre to operate', style: DhenuText.body.copyWith(color: t.inkSoft)),
          ]),
        ),
        IconButton(
          onPressed: () => ref.read(authProvider.notifier).logout(),
          icon: const Icon(DhenuIcons.logout),
          color: t.inkSoft,
          tooltip: 'Log out',
        ),
      ]),
    );
  }
}
