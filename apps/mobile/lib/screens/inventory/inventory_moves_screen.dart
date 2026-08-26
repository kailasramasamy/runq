// Moves Hub — the bot-nav tab that fans out to every transaction type
// (GRN, DN, transfer, adjustment, stock take, reorder). Mirrors the
// "Movements" screen in the design handoff: today summary cards, a status
// strip, a 2x3 action grid, then a recent-activity card.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/inventory_models.dart';
import '../../providers/inventory_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/inv_colors.dart';
import 'widgets/inv_primitives.dart';

class InventoryMovesScreen extends ConsumerWidget {
  const InventoryMovesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final kpisAsync = ref.watch(invKpisProvider);
    final t = RT(context);

    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: const InvPlainAppBar(title: 'Movements'),
      body: RefreshIndicator(
        color: InvColors.brand(context),
        onRefresh: () async {
          ref.invalidate(invKpisProvider);
          await Future<void>.delayed(const Duration(milliseconds: 200));
        },
        child: kpisAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(
            child: Text('Failed to load: $e',
                style: RunqText.caption.copyWith(color: t.muted)),
          ),
          data: (k) => _MovesBody(k: k),
        ),
      ),
    );
  }
}

class _MovesBody extends StatelessWidget {
  const _MovesBody({required this.k});
  final InvKpis k;

  @override
  Widget build(BuildContext context) {
    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.only(bottom: 120),
      children: [
        // ── Today IN / OUT hero row ──────────────────────────────────────
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
          // IntrinsicHeight bounds the row inside an unbounded sliver — without
          // it, `crossAxisAlignment: stretch` propagates h=Infinity to each card.
          child: IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(child: _TodayInCard(count: k.todayInCount, value: k.todayInValue)),
                const SizedBox(width: 8),
                Expanded(child: _TodayOutCard(count: k.todayOutCount, value: k.todayOutValue)),
              ],
            ),
          ),
        ),
        // ── Status strip ────────────────────────────────────────────────
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          child: Row(
            children: [
              Expanded(
                child: _StatusTile(
                  label: 'In Transit',
                  value: k.inTransitTransfers,
                  color: InvColors.info,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _StatusTile(
                  label: 'Pending',
                  value: k.pendingAdjustments,
                  color: InvColors.amberDeep,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _StatusTile(
                  label: 'Low Stock',
                  value: k.lowStockCount,
                  color: InvColors.orangeAlert,
                ),
              ),
            ],
          ),
        ),
        // ── Transaction types ───────────────────────────────────────────
        const InvSectionHeader(title: 'Transaction Types'),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: _ActionGrid(k: k),
        ),
        // Recent activity is deferred to batch 2 (needs the dashboard
        // recentActivity API wired through to a provider). The hub still
        // works without it — users can dive into any list to see history.
      ],
    );
  }
}

// ── Today IN — gradient hero card ────────────────────────────────────────

class _TodayInCard extends StatelessWidget {
  const _TodayInCard({required this.count, required this.value});
  final int count;
  final double value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [InvColors.amberDarkest, InvColors.amber],
        ),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            'TODAY IN',
            style: RunqText.label.copyWith(color: Colors.white.withValues(alpha: 0.75)),
          ),
          const SizedBox(height: 6),
          Text(
            '$count GRNs',
            style: RunqText.numberLg.copyWith(color: Colors.white, fontSize: 20),
          ),
          const SizedBox(height: 2),
          Text(
            compactINR(value),
            style: RunqText.caption.copyWith(color: Colors.white.withValues(alpha: 0.78)),
          ),
        ],
      ),
    );
  }
}

class _TodayOutCard extends StatelessWidget {
  const _TodayOutCard({required this.count, required this.value});
  final int count;
  final double value;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      decoration: BoxDecoration(
        color: t.surface,
        border: Border.all(color: t.hairline),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('TODAY OUT', style: RunqText.label.copyWith(color: t.muted)),
          const SizedBox(height: 6),
          Text(
            '$count DNs',
            style: RunqText.numberLg.copyWith(color: t.ink, fontSize: 20),
          ),
          const SizedBox(height: 2),
          Text(compactINR(value), style: RunqText.caption.copyWith(color: t.muted)),
        ],
      ),
    );
  }
}

class _StatusTile extends StatelessWidget {
  const _StatusTile({required this.label, required this.value, required this.color});
  final String label;
  final int value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: t.surface,
        border: Border.all(color: t.hairline),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label.toUpperCase(), style: RunqText.label.copyWith(color: t.muted)),
          const SizedBox(height: 4),
          Text(
            value.toString(),
            style: RunqText.h4.copyWith(color: color, height: 1.1),
          ),
        ],
      ),
    );
  }
}

class _ActionGrid extends StatelessWidget {
  const _ActionGrid({required this.k});
  final InvKpis k;

  @override
  Widget build(BuildContext context) {
    final tiles = [
      InvActionTile(
        icon: Icons.inventory_2_outlined,
        title: 'Receipts',
        subtitle: 'GRN list + receive',
        onTap: () => context.push('/inventory/grn'),
      ),
      InvActionTile(
        icon: Icons.local_shipping_outlined,
        title: 'Dispatches',
        subtitle: 'DN list + dispatch',
        onTap: () => context.push('/inventory/delivery'),
      ),
      InvActionTile(
        icon: Icons.alt_route_outlined,
        title: 'Transfers',
        subtitle: 'Between warehouses',
        badge: k.inTransitTransfers > 0 ? '${k.inTransitTransfers}' : null,
        onTap: () => context.push('/inventory/transfers'),
      ),
      InvActionTile(
        icon: Icons.tune_rounded,
        title: 'Adjustments',
        subtitle: 'Damage / free issue / found',
        badge: k.pendingAdjustments > 0 ? '${k.pendingAdjustments}' : null,
        onTap: () => context.push('/inventory/adjustments'),
      ),
      InvActionTile(
        icon: Icons.checklist_outlined,
        title: 'Stock Take',
        subtitle: 'Count sessions',
        onTap: () => context.push('/inventory/stock-take'),
      ),
      InvActionTile(
        icon: Icons.notifications_active_outlined,
        title: 'Reorder',
        subtitle: 'Low stock alerts',
        badge: k.lowStockCount > 0 ? '${k.lowStockCount}' : null,
        onTap: () => context.push('/inventory/alerts'),
      ),
    ];
    // Hand-laid 2-col grid (intrinsic-height per row) so each row sizes
    // to its tallest tile — GridView.count would clamp every tile to
    // one aspect ratio.
    final rows = <Widget>[];
    for (var i = 0; i < tiles.length; i += 2) {
      if (i > 0) rows.add(const SizedBox(height: 10));
      rows.add(
        IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(child: tiles[i]),
              const SizedBox(width: 10),
              Expanded(child: tiles[i + 1]),
            ],
          ),
        ),
      );
    }
    return Column(children: rows);
  }
}
