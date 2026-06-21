import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/auth_provider.dart';
import '../../providers/mp_context_provider.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../widgets/centre_switcher.dart';

/// First screen an admin (owner/accountant/viewer) sees: pick a centre to
/// operate the app as. Selecting one sets [mpActiveNodeProvider]; the home
/// dispatcher then renders that node's VMCC/CC/PP shell.
class CentrePickerScreen extends ConsumerWidget {
  const CentrePickerScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    return Scaffold(
      appBar: AppBar(
        title: Text('Choose a centre', style: DhenuText.h2.copyWith(color: t.ink)),
        actions: [
          IconButton(
            onPressed: () => ref.read(authProvider.notifier).logout(),
            icon: const Icon(DhenuIcons.logout),
          ),
        ],
      ),
      body: SafeArea(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(
                DhenuSpacing.screen, DhenuSpacing.sm, DhenuSpacing.screen, 0),
            child: Text(
              'Operate the app as any of your collection centres, chilling centres or plants.',
              style: DhenuText.body.copyWith(color: t.inkSoft),
            ),
          ),
          Expanded(
            child: CentrePickerList(
              onPick: (n) => ref.read(mpActiveNodeProvider.notifier).state = n,
            ),
          ),
        ]),
      ),
    );
  }
}
