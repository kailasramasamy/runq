import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/auth_provider.dart';
import '../../providers/mp_context_provider.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../widgets/centre_switcher.dart';
import '../../widgets/dhenu_card.dart';

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
          const Padding(
            padding: EdgeInsets.fromLTRB(
                DhenuSpacing.screen, DhenuSpacing.sm, DhenuSpacing.screen, 0),
            child: _IntroSection(),
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

/// Intro card: a one-line guide plus a labelled key decoding the three tier
/// icons/acronyms (VMCC / CC / PP) so an owner knows what each category means.
class _IntroSection extends StatelessWidget {
  const _IntroSection();

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    return DhenuCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(
          'Operate the app as any of your centres. Pick a category below, then choose a centre to step into.',
          style: DhenuText.body.copyWith(color: t.inkSoft),
        ),
        const SizedBox(height: DhenuSpacing.lg),
        Divider(height: 1, color: t.hairline),
        const SizedBox(height: DhenuSpacing.md),
        Text('WHAT THE ICONS MEAN',
            style: DhenuText.caption
                .copyWith(color: t.inkSoft, letterSpacing: 0.6, fontWeight: FontWeight.w700)),
        const SizedBox(height: DhenuSpacing.sm),
        const _LegendRow(
            icon: DhenuIcons.store, abbr: 'VMCC', meaning: 'Village collection centre'),
        const SizedBox(height: DhenuSpacing.sm),
        const _LegendRow(icon: DhenuIcons.snowflake, abbr: 'CC', meaning: 'Chilling centre'),
        const SizedBox(height: DhenuSpacing.sm),
        const _LegendRow(icon: DhenuIcons.tankers, abbr: 'PP', meaning: 'Processing plant'),
      ]),
    );
  }
}

class _LegendRow extends StatelessWidget {
  const _LegendRow({required this.icon, required this.abbr, required this.meaning});
  final IconData icon;
  final String abbr;
  final String meaning;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    return Row(children: [
      Container(
        width: 30,
        height: 30,
        decoration:
            BoxDecoration(color: t.brand.withValues(alpha: 0.12), shape: BoxShape.circle),
        child: Icon(icon, size: 16, color: t.brand),
      ),
      const SizedBox(width: DhenuSpacing.md),
      SizedBox(
        width: 56,
        child: Text(abbr,
            style: DhenuText.label.copyWith(color: t.ink, fontWeight: FontWeight.w700)),
      ),
      Expanded(
        child: Text(meaning, style: DhenuText.caption.copyWith(color: t.inkSoft)),
      ),
    ]);
  }
}
