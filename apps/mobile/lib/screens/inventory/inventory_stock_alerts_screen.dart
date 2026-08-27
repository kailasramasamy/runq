// Stock Alerts — the low-stock and out-of-stock list.
//
// Replaces the reorder-only alerts screen. The important difference is that
// an item with no reorder level configured still shows up here once it hits
// zero: a stockout is a stockout whether or not anyone set a threshold.
//
// Filters live in providers (see invAlertStatusProvider and friends) so the
// list refetches server-side rather than filtering a full payload on device.

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
import 'widgets/inv_stock_alert_tile.dart';

class InventoryStockAlertsScreen extends ConsumerStatefulWidget {
  const InventoryStockAlertsScreen({super.key, this.initialStatus});

  /// Which filter to open on — 'out' | 'low'. Null keeps whatever the
  /// provider already holds, which is how the tab itself opens.
  ///
  /// Arriving from a Low Stock tile and landing on "All" makes the user
  /// re-apply the filter they just expressed by tapping, so the callers
  /// that name a bucket pass it through.
  final String? initialStatus;

  @override
  ConsumerState<InventoryStockAlertsScreen> createState() =>
      _InventoryStockAlertsScreenState();
}

class _InventoryStockAlertsScreenState
    extends ConsumerState<InventoryStockAlertsScreen> {
  final _searchCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    final want = widget.initialStatus;
    if (want == null) return;
    // After the frame: the filter providers drive invStockAlertsProvider, and
    // writing to them while this screen's first build is still running would
    // mutate a provider mid-build.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) ref.read(invAlertStatusProvider.notifier).state = want;
    });
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _refresh() async {
    ref.invalidate(invStockAlertsProvider);
    ref.invalidate(invStockAlertCountsProvider);
    await ref.read(invStockAlertsProvider.future);
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final rows = ref.watch(invStockAlertsProvider);
    final counts = ref.watch(invStockAlertCountsProvider);
    final status = ref.watch(invAlertStatusProvider);

    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: InvPlainAppBar(
        title: 'Stock Alerts',
        // Top-level tab — no back arrow inside the shell, but keep pop
        // working when the screen is reached via deep-link or push.
        onBack: Navigator.of(context).canPop() ? () => context.pop() : null,
        trailing: counts.maybeWhen(
          data: (c) => c.total == 0 ? null : _CountPill(count: c.total),
          orElse: () => null,
        ),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
            child: InvSearchBar(
              controller: _searchCtrl,
              onChanged: (v) =>
                  ref.read(invAlertSearchProvider.notifier).state = v,
              hint: 'Search by name or SKU…',
            ),
          ),
          _WarehouseStrip(
            selected: ref.watch(invAlertWarehouseProvider),
            onChanged: (id) =>
                ref.read(invAlertWarehouseProvider.notifier).state = id,
          ),
          Expanded(
            child: RefreshIndicator(
              color: InvColors.brand(context),
              onRefresh: _refresh,
              child: _Body(
                rows: rows,
                counts: counts,
                status: status,
                onSelectStatus: (s) =>
                    ref.read(invAlertStatusProvider.notifier).state = s,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({
    required this.rows,
    required this.counts,
    required this.status,
    required this.onSelectStatus,
  });

  final AsyncValue<List<InvStockAlert>> rows;
  final AsyncValue<InvStockAlertCounts> counts;
  final String status;
  final ValueChanged<String> onSelectStatus;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final c = counts.valueOrNull ?? const InvStockAlertCounts();
    final strip = SliverToBoxAdapter(
      child: InvAlertSummaryStrip(
        out: c.out,
        low: c.low,
        selected: status,
        onSelect: onSelectStatus,
      ),
    );

    return CustomScrollView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      physics: const AlwaysScrollableScrollPhysics(),
      slivers: [
        strip,
        ...rows.when(
          loading: () => const [
            SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.symmetric(vertical: 48),
                child: Center(child: CircularProgressIndicator()),
              ),
            ),
          ],
          error: (e, _) => [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text('Failed to load alerts: $e',
                    style: RunqText.caption.copyWith(color: t.muted),
                    textAlign: TextAlign.center),
              ),
            ),
          ],
          data: (list) => list.isEmpty
              ? [SliverToBoxAdapter(child: _Empty(status: status))]
              : _sections(list),
        ),
        const SliverToBoxAdapter(child: SizedBox(height: 120)),
      ],
    );
  }

  /// Out-of-stock first — it is the only bucket that is already costing a
  /// sale. Sections collapse to a single list when a filter is active.
  List<Widget> _sections(List<InvStockAlert> list) {
    final out = list.where((a) => a.isOut).toList();
    final low = list.where((a) => !a.isOut).toList();
    return [
      if (out.isNotEmpty) ...[
        SliverToBoxAdapter(
          child: InvSectionHeader(title: 'Out of stock (${out.length})', topPad: 12),
        ),
        _list(out),
      ],
      if (low.isNotEmpty) ...[
        SliverToBoxAdapter(
          child: InvSectionHeader(title: 'Running low (${low.length})', topPad: 12),
        ),
        _list(low),
      ],
    ];
  }

  /// One card per section with hairline-separated rows, rather than a
  /// floating card per item: at a glance the section is one block to scan
  /// down, not fifteen boxes to step over.
  ///
  /// Stays a lazy SliverList — an alert list can run to hundreds of rows on a
  /// tenant that never set thresholds — with the card drawn by DecoratedSliver
  /// around it.
  Widget _list(List<InvStockAlert> rows) => SliverPadding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        sliver: Builder(
          builder: (ctx) {
            final t = RT(ctx);
            return DecoratedSliver(
              decoration: BoxDecoration(
                color: t.surface,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: t.hairlineSoft),
              ),
              sliver: SliverList.separated(
                itemCount: rows.length,
                separatorBuilder: (ctx2, _) => Divider(
                  height: 1,
                  thickness: 1,
                  indent: 14,
                  endIndent: 14,
                  color: RT(ctx2).hairlineSoft,
                ),
                itemBuilder: (ctx2, i) => InvStockAlertTile(
                  alert: rows[i],
                  onTap: () => ctx2.push('/inventory/items/${rows[i].itemId}'),
                ),
              ),
            );
          },
        ),
      );
}

// ── Warehouse filter strip ───────────────────────────────────────────────

class _WarehouseStrip extends ConsumerWidget {
  const _WarehouseStrip({required this.selected, required this.onChanged});

  final String? selected;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final warehouses = ref.watch(invWarehousesProvider).valueOrNull ?? const [];
    // One warehouse means the filter can only ever be a no-op.
    if (warehouses.length < 2) return const SizedBox.shrink();
    return SizedBox(
      height: 38,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        children: [
          _Chip(
            label: 'All warehouses',
            active: selected == null,
            onTap: () => onChanged(null),
          ),
          for (final w in warehouses)
            _Chip(
              label: w.name,
              active: selected == w.id,
              onTap: () => onChanged(selected == w.id ? null : w.id),
            ),
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label, required this.active, required this.onTap});

  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = InvColors.brand(context);
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(99),
        child: Container(
          alignment: Alignment.center,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
          decoration: BoxDecoration(
            color: active ? brand.withValues(alpha: 0.12) : t.surface,
            border: Border.all(
              color: active ? brand.withValues(alpha: 0.6) : t.hairlineSoft,
            ),
            borderRadius: BorderRadius.circular(99),
          ),
          child: Text(
            label,
            style: RunqText.caption.copyWith(
              color: active ? brand : t.muted,
              fontWeight: active ? FontWeight.w700 : FontWeight.w500,
            ),
          ),
        ),
      ),
    );
  }
}

// ── Chrome ───────────────────────────────────────────────────────────────

class _CountPill extends StatelessWidget {
  const _CountPill({required this.count});
  final int count;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(right: 8),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: InvColors.errorBg,
        borderRadius: BorderRadius.circular(99),
      ),
      child: Text('$count items',
          style: RunqText.micro
              .copyWith(color: InvColors.error, letterSpacing: 0.3)),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty({required this.status});
  final String status;

  @override
  Widget build(BuildContext context) {
    final (title, sub) = switch (status) {
      'out' => ('Nothing is out of stock', 'Every tracked item has stock on hand.'),
      'low' => ('Nothing is running low', 'All stock sits above its reorder level.'),
      _ => ('Stock levels look healthy', 'No low or out-of-stock items right now.'),
    };
    return InvEmptyState(
      icon: Icons.check_circle_outline,
      title: title,
      subtitle: sub,
    );
  }
}
