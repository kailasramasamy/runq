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
        top: false,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(
                DhenuSpacing.screen, DhenuSpacing.sm, DhenuSpacing.screen, 0),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(
                'Operate the app as any of your centres. Pick a category, then choose a centre to step into.',
                style: DhenuText.body.copyWith(color: t.inkSoft),
              ),
              const SizedBox(height: DhenuSpacing.md),
              const _TierLegend(),
            ]),
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

/// Compact key tying each tier icon to its meaning (VMCC / CC / PP).
class _TierLegend extends StatelessWidget {
  const _TierLegend();

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: DhenuSpacing.sm,
      runSpacing: DhenuSpacing.sm,
      children: const [
        _LegendChip(icon: DhenuIcons.store, label: 'VMCC'),
        _LegendChip(icon: DhenuIcons.snowflake, label: 'CC'),
        _LegendChip(icon: DhenuIcons.tankers, label: 'PP'),
      ],
    );
  }
}

class _LegendChip extends StatelessWidget {
  const _LegendChip({required this.icon, required this.label});
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    return Container(
      padding: const EdgeInsets.symmetric(
          horizontal: DhenuSpacing.md, vertical: DhenuSpacing.xs),
      decoration: BoxDecoration(
        color: t.brandSubtle,
        borderRadius: BorderRadius.circular(DhenuRadii.pill),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 14, color: t.brand),
        const SizedBox(width: DhenuSpacing.xs),
        Text(label,
            style: DhenuText.caption.copyWith(color: t.brand, fontWeight: FontWeight.w700)),
      ]),
    );
  }
}
