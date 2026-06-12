// Purchase settings — profile card, branded procurement + bills/payments
// destinations, and the shared Account group. Links route to existing
// purchase screens.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/settings_kit.dart';
import 'widgets/pur_colors.dart';

class PurchaseMoreScreen extends ConsumerWidget {
  const PurchaseMoreScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final brand = PurColors.brand(context);
    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: AppBar(
        title: const Text('Purchase settings'),
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
            moduleLabel: 'Purchase',
            onTap: () => context.push('/profile'),
          ),
          const SizedBox(height: 16),
          SettingsGroup(
            title: 'Procurement',
            accent: brand,
            rows: [
              // POs / Direct / Match are shell (bottom-nav) routes — use go()
              // to switch tabs. Pushing a shell route from this rootKey page
              // duplicates the ShellRoute page key.
              SettingsRow(Icons.description_outlined, 'Purchase orders',
                  onTap: () => context.go('/purchase/pos')),
              SettingsRow(Icons.move_to_inbox_outlined, 'Direct receipts',
                  onTap: () => context.go('/purchase/direct')),
              SettingsRow(Icons.fact_check_outlined, '3-way match',
                  onTap: () => context.go('/purchase/match')),
            ],
          ),
          const SizedBox(height: 16),
          SettingsGroup(
            title: 'Bills & payments',
            accent: brand,
            rows: [
              SettingsRow(Icons.receipt_long_outlined, 'Bills',
                  onTap: () => context.push('/purchases/bills')),
              SettingsRow(Icons.payments_outlined, 'Pay runs',
                  onTap: () => context.push('/purchases/pay-runs')),
            ],
          ),
          const SizedBox(height: 16),
          const AccountSettingsGroup(),
          const SizedBox(height: 16),
          Center(
            child: Text('runQ Purchase · v1.0',
                style: RunqText.caption.copyWith(color: t.muted2)),
          ),
        ],
      ),
    );
  }
}
