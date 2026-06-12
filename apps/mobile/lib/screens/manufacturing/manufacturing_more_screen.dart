// Manufacturing settings — profile card, branded production + reports
// destinations, and the shared Account group. Links route to existing
// manufacturing screens.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/settings_kit.dart';
import 'widgets/mfg_colors.dart';

class ManufacturingMoreScreen extends ConsumerWidget {
  const ManufacturingMoreScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final brand = MfgColors.brand(context);
    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: AppBar(
        title: const Text('Manufacturing settings'),
        leading: Navigator.of(context).canPop()
            ? IconButton(
                icon: const Icon(Icons.arrow_back_rounded),
                onPressed: () => Navigator.of(context).pop(),
              )
            : null,
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 140),
        physics: const BouncingScrollPhysics(),
        children: [
          SettingsProfileCard(
            accent: brand,
            moduleLabel: 'Manufacturing',
            onTap: () => context.push('/profile'),
          ),
          const SizedBox(height: 16),
          SettingsGroup(
            title: 'Production',
            accent: brand,
            rows: [
              // BOMs / Work orders are shell (bottom-nav) routes — use go() to
              // switch tabs. Pushing a shell route from this rootKey page
              // duplicates the ShellRoute page key.
              SettingsRow(Icons.account_tree_outlined, 'Bills of materials',
                  onTap: () => context.go('/manufacturing/boms')),
              SettingsRow(Icons.precision_manufacturing_outlined, 'Work orders',
                  onTap: () => context.go('/manufacturing/wos')),
            ],
          ),
          const SizedBox(height: 16),
          SettingsGroup(
            title: 'Reports',
            accent: brand,
            rows: [
              SettingsRow(Icons.summarize_outlined, 'Work-order summary',
                  onTap: () => context.push('/manufacturing/reports/wo-summary')),
              SettingsRow(Icons.show_chart_rounded, 'Yield trend',
                  onTap: () => context.push('/manufacturing/reports/yield-trend')),
            ],
          ),
          const SizedBox(height: 16),
          const AccountSettingsGroup(),
          const SizedBox(height: 16),
          Center(
            child: Text('runQ Manufacturing · v1.0',
                style: RunqText.caption.copyWith(color: t.muted2)),
          ),
        ],
      ),
    );
  }
}
