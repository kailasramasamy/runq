// Inventory home — KPI strip + quick actions. Kept deliberately calm so
// the godown floor can scan it in one glance.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/inventory_models.dart';
import '../../providers/inventory_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/inv_colors.dart';

class InventoryHomeScreen extends ConsumerWidget {
  const InventoryHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final kpisAsync = ref.watch(invKpisProvider);
    final t = RT(context);

    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: AppBar(
        title: Text('Inventory', style: RunqText.h3.copyWith(color: t.ink)),
        elevation: 0,
      ),
      body: RefreshIndicator(
        color: InvColors.brand(context),
        onRefresh: () async {
          ref.invalidate(invKpisProvider);
          await Future<void>.delayed(const Duration(milliseconds: 200));
        },
        child: ListView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          children: [
            kpisAsync.when(
              loading: () => const _KpiSkeleton(),
              error: (_, __) => Text('Failed to load', style: RunqText.body.copyWith(color: t.muted)),
              data: (k) => _KpiStrip(k: k),
            ),
            const SizedBox(height: 20),
            Text('Quick actions', style: RunqText.label.copyWith(color: t.muted)),
            const SizedBox(height: 8),
            _ActionTile(
              icon: Icons.add_box_outlined,
              title: 'Receive stock',
              subtitle: 'Create a GRN when stock arrives',
              onTap: () => context.push('/inventory/grn/new'),
            ),
            _ActionTile(
              icon: Icons.local_shipping_outlined,
              title: 'Dispatch stock',
              subtitle: 'Create a delivery note',
              onTap: () => context.push('/inventory/delivery/new'),
            ),
            _ActionTile(
              icon: Icons.inventory_2_outlined,
              title: 'On-hand stock',
              subtitle: 'See live qty by warehouse',
              onTap: () => context.push('/inventory/on-hand'),
            ),
            _ActionTile(
              icon: Icons.receipt_long_outlined,
              title: 'Recent receipts',
              subtitle: 'GRN history',
              onTap: () => context.push('/inventory/grn'),
            ),
            _ActionTile(
              icon: Icons.outbound_outlined,
              title: 'Recent dispatches',
              subtitle: 'Delivery note history',
              onTap: () => context.push('/inventory/delivery'),
            ),
          ],
        ),
      ),
    );
  }
}

class _KpiStrip extends StatelessWidget {
  const _KpiStrip({required this.k});
  final InvKpis k;
  @override
  Widget build(BuildContext context) {
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      childAspectRatio: 1.7,
      crossAxisSpacing: 12,
      mainAxisSpacing: 12,
      children: [
        _KpiCard(label: 'Stock value', value: '₹${_compactINR(k.totalValue)}'),
        _KpiCard(label: 'SKU rows', value: k.activeRows.toString()),
        _KpiCard(label: 'Low stock', value: k.lowStockCount.toString(), accent: k.lowStockCount > 0),
        _KpiCard(label: 'Today receipts', value: k.todayGrns.toString()),
      ],
    );
  }
}

class _KpiCard extends StatelessWidget {
  const _KpiCard({required this.label, required this.value, this.accent = false});
  final String label;
  final String value;
  final bool accent;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: t.surface,
        border: Border.all(color: t.hairline),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: RunqText.label.copyWith(color: t.muted)),
          Text(
            value,
            style: RunqText.numberLg.copyWith(
              color: accent ? InvColors.brand(context) : t.ink,
            ),
          ),
        ],
      ),
    );
  }
}

class _ActionTile extends StatelessWidget {
  const _ActionTile({
    required this.icon, required this.title, required this.subtitle, required this.onTap,
  });
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: t.surface,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              border: Border.all(color: t.hairlineSoft),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                Container(
                  width: 38, height: 38,
                  decoration: BoxDecoration(
                    color: InvColors.amberSubtle,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(icon, size: 20, color: InvColors.brand(context)),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, style: RunqText.bodyStrong.copyWith(color: t.ink)),
                      const SizedBox(height: 2),
                      Text(subtitle, style: RunqText.caption.copyWith(color: t.muted)),
                    ],
                  ),
                ),
                Icon(Icons.chevron_right, color: t.muted2),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _KpiSkeleton extends StatelessWidget {
  const _KpiSkeleton();
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      childAspectRatio: 1.7,
      crossAxisSpacing: 12,
      mainAxisSpacing: 12,
      children: List.generate(4, (_) => Container(
        decoration: BoxDecoration(
          color: t.bgWarmer,
          borderRadius: BorderRadius.circular(14),
        ),
      )),
    );
  }
}

String _compactINR(double v) {
  if (v >= 10000000) return '${(v / 10000000).toStringAsFixed(2)} Cr';
  if (v >= 100000) return '${(v / 100000).toStringAsFixed(2)} L';
  if (v >= 1000) return '${(v / 1000).toStringAsFixed(1)} K';
  return v.toStringAsFixed(0);
}
