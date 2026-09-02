// Inventory settings — profile card, branded stock/operations destinations,
// and the shared Account group. Links route to existing inventory screens; no
// heavy config lives here (the godown floor stays glanceable).

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/settings_kit.dart';
import 'widgets/inv_colors.dart';

class InventoryMoreScreen extends ConsumerWidget {
  const InventoryMoreScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final brand = InvColors.brand(context);
    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: AppBar(
        title: const Text('Inventory settings'),
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
            moduleLabel: 'Inventory',
            onTap: () => context.push('/profile'),
          ),
          const SizedBox(height: 16),
          SettingsGroup(
            title: 'Stock',
            accent: brand,
            rows: [
              // On-hand / Moves / Alerts / Expiry are shell (bottom-nav)
              // routes — use go() to switch tabs. Pushing a shell route from
              // this rootKey page duplicates the ShellRoute page key.
              SettingsRow(Icons.today_outlined, 'Day summary',
                  onTap: () => context.push('/inventory/day')),
              SettingsRow(Icons.trending_up_rounded, 'Analytics',
                  onTap: () => context.go('/inventory/analytics')),
              SettingsRow(Icons.inventory_2_outlined, 'Items',
                  onTap: () => context.push('/inventory/items')),
              SettingsRow(Icons.visibility_outlined, 'On-hand stock',
                  onTap: () => context.go('/inventory/on-hand')),
              SettingsRow(Icons.swap_vert_rounded, 'Stock movements',
                  onTap: () => context.go('/inventory/moves')),
              SettingsRow(Icons.warning_amber_rounded, 'Low-stock alerts',
                  onTap: () => context.go('/inventory/alerts')),
              SettingsRow(Icons.event_busy_outlined, 'Expiry report',
                  onTap: () => context.go('/inventory/reports/expiry')),
              SettingsRow(Icons.delete_outline, 'Write-offs & wastage',
                  onTap: () => context.push('/inventory/reports/write-offs')),
            ],
          ),
          const SizedBox(height: 16),
          SettingsGroup(
            title: 'Operations',
            accent: brand,
            rows: [
              SettingsRow(Icons.alt_route_outlined, 'Transfers',
                  onTap: () => context.push('/inventory/transfers')),
              SettingsRow(Icons.tune_rounded, 'Adjustments',
                  onTap: () => context.push('/inventory/adjustments')),
              SettingsRow(Icons.checklist_outlined, 'Stock take',
                  onTap: () => context.push('/inventory/stock-take')),
              SettingsRow(Icons.receipt_long_outlined, 'Activity feed',
                  onTap: () => context.push('/inventory/activity?period=7d')),
            ],
          ),
          const SizedBox(height: 16),
          const AccountSettingsGroup(),
          const SizedBox(height: 16),
          Center(
            child: Text('runQ Inventory · v1.0',
                style: RunqText.caption.copyWith(color: t.muted2)),
          ),
        ],
      ),
    );
  }
}
