// Receipts (GRN) list — 3-col stats strip, search bar, status filter
// pills, list of GRN tiles with a footer row showing line count + PO
// ref + total value. Tap a tile to drill into the GRN detail screen.
// The `+` button on the appbar pushes the full-screen "New GRN" flow
// (AI invoice scan + manual entry; replaced the old bottom-sheet modal).

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_slidable/flutter_slidable.dart';
import 'package:go_router/go_router.dart';

import '../../api/inventory_models.dart';
import '../../api/inventory_repo.dart';
import '../../providers/inventory_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_snack.dart';
import '../../widgets/swipe_action.dart';
import 'widgets/inv_colors.dart';
import 'widgets/inv_primitives.dart';

class InventoryGrnScreen extends ConsumerStatefulWidget {
  const InventoryGrnScreen({super.key});
  @override
  ConsumerState<InventoryGrnScreen> createState() => _InventoryGrnScreenState();
}

class _InventoryGrnScreenState extends ConsumerState<InventoryGrnScreen> {
  String _search = '';
  /// `null` = All, otherwise a GRN status enum value.
  String? _statusFilter;
  final _searchCtrl = TextEditingController();

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  List<InvGrn> _applyFilters(List<InvGrn> all) {
    var out = all;
    if (_statusFilter != null) {
      out = out.where((g) => g.status == _statusFilter).toList();
    }
    final q = _search.trim().toLowerCase();
    if (q.isNotEmpty) {
      out = out.where((g) =>
        g.grnNo.toLowerCase().contains(q) ||
        (g.vendorName?.toLowerCase().contains(q) ?? false) ||
        g.warehouseName.toLowerCase().contains(q) ||
        (g.poNumber?.toLowerCase().contains(q) ?? false),
      ).toList();
    }
    return out;
  }

  Future<void> _refresh() async {
    ref.invalidate(invGrnListProvider(null));
    await Future<void>.delayed(const Duration(milliseconds: 200));
  }

  /// Push the full-screen "New GRN" flow. It invalidates the GRN list
  /// + KPI providers itself on successful post, so we just navigate.
  void _openNewGrn() => context.push('/inventory/grn/new');

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final rows = ref.watch(invGrnListProvider(null));

    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: InvPlainAppBar(
        title: 'Receipts (GRN)',
        onBack: () => context.pop(),
        trailing: _AddButton(onTap: _openNewGrn),
      ),
      body: RefreshIndicator(
        color: InvColors.brand(context),
        onRefresh: _refresh,
        child: rows.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text('Failed to load: $e',
                  style: RunqText.caption.copyWith(color: t.muted),
                  textAlign: TextAlign.center),
            ),
          ),
          data: (list) {
            final filtered = _applyFilters(list);
            return CustomScrollView(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                SliverToBoxAdapter(child: _StatsStrip(all: list)),
                SliverToBoxAdapter(child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                  child: InvSearchBar(
                    controller: _searchCtrl,
                    onChanged: (v) => setState(() => _search = v),
                    hint: 'GRN number, vendor, PO ref…',
                  ),
                )),
                SliverToBoxAdapter(child: _StatusPills(
                  selected: _statusFilter,
                  onSelect: (s) => setState(() => _statusFilter = s),
                )),
                if (filtered.isEmpty)
                  SliverFillRemaining(
                    hasScrollBody: false,
                    child: InvEmptyState(
                      icon: Icons.inventory_2_outlined,
                      title: list.isEmpty ? 'No GRNs yet' : 'No matches',
                      subtitle: list.isEmpty
                          ? 'Receive your first delivery to get started'
                          : 'Try a different search or filter',
                      actionLabel: '+ New GRN',
                      onAction: _openNewGrn,
                    ),
                  )
                else
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 120),
                    sliver: SliverList.separated(
                      itemCount: filtered.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemBuilder: (_, i) => _GrnTile(grn: filtered[i]),
                    ),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}

// ── App-bar `+` button (amber square 32×32, radius 8) ─────────────────────

class _AddButton extends StatelessWidget {
  const _AddButton({required this.onTap});
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: Material(
        color: InvColors.brand(context),
        borderRadius: BorderRadius.circular(8),
        child: InkWell(
          borderRadius: BorderRadius.circular(8),
          onTap: onTap,
          child: const SizedBox(
            width: 32,
            height: 32,
            child: Icon(Icons.add, color: Colors.white, size: 18),
          ),
        ),
      ),
    );
  }
}

// ── Stats strip ───────────────────────────────────────────────────────────

class _StatsStrip extends StatelessWidget {
  const _StatsStrip({required this.all});
  final List<InvGrn> all;

  @override
  Widget build(BuildContext context) {
    final today = DateTime.now().toIso8601String().substring(0, 10);
    var todayN = 0;
    var monthN = 0;
    var todayValue = 0.0;
    final thisMonth = today.substring(0, 7);
    for (final g in all) {
      if (g.receivedDate == today) {
        todayN++;
        if (g.status == 'posted') todayValue += g.totalValue;
      }
      if (g.receivedDate.startsWith(thisMonth)) monthN++;
    }
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      // IntrinsicHeight bounds the row's height to its tallest child — slivers
      // pass infinite height, so without this `stretch` blows up to h=Infinity.
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(child: InvKpiCard(label: 'Today', value: '$todayN', sub: 'receipts')),
            const SizedBox(width: 8),
            Expanded(child: InvKpiCard(label: 'This Month', value: '$monthN', sub: 'total')),
            const SizedBox(width: 8),
            Expanded(child: InvKpiCard(
              label: 'Today Val.',
              value: compactINR(todayValue),
              sub: 'received',
            )),
          ],
        ),
      ),
    );
  }
}

// ── Status filter pills ───────────────────────────────────────────────────

class _StatusPills extends StatelessWidget {
  const _StatusPills({required this.selected, required this.onSelect});
  final String? selected;
  final ValueChanged<String?> onSelect;
  static const _opts = <(String?, String)>[
    (null, 'All'),
    ('posted', 'Posted'),
    ('draft', 'Draft'),
    ('cancelled', 'Cancelled'),
  ];
  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 40,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
        children: [
          for (var i = 0; i < _opts.length; i++) ...[
            if (i > 0) const SizedBox(width: 6),
            InvFilterPill(
              label: _opts[i].$2,
              active: selected == _opts[i].$1,
              onTap: () => onSelect(_opts[i].$1),
            ),
          ],
        ],
      ),
    );
  }
}

// ── GRN tile (per handoff) ────────────────────────────────────────────────

class _GrnTile extends ConsumerWidget {
  const _GrnTile({required this.grn});
  final InvGrn grn;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final meta = <InvDocMeta>[
      InvDocMeta(Icons.calendar_today_outlined, prettyShortDate(grn.receivedDate)),
      InvDocMeta(Icons.warehouse_outlined, grn.warehouseName),
      if ((grn.poNumber ?? '').isNotEmpty)
        InvDocMeta(Icons.receipt_long_outlined, grn.poNumber!),
    ];
    final tile = InvDocListTile(
      leadingIcon: Icons.inventory_2_outlined,
      title: grn.grnNo,
      subtitle: grn.vendorName,
      statusPill: InvStatusPill(status: grn.status),
      meta: meta,
      valueLabel: '${grn.lineCount} ${grn.lineCount == 1 ? 'line' : 'lines'}',
      valueText: indianINR(grn.totalValue),
      onTap: () => context.push('/inventory/grn/${grn.id}'),
    );

    final actions = _buildActions(context, ref);
    if (actions.isEmpty) return tile;
    return Slidable(
      groupTag: 'inv-grn',
      key: ValueKey('grn-${grn.id}'),
      endActionPane: ActionPane(
        motion: const BehindMotion(),
        extentRatio: actions.length == 1 ? 0.28 : 0.52,
        children: actions,
      ),
      child: tile,
    );
  }

  /// Swipe actions per status. We only expose destructive paths where the
  /// server permits a clean reversal: draft GRNs can be edited or hard-
  /// discarded (no ledger impact); posted GRNs offer a reason-prompted
  /// cancel that reverses stock + JE; cancelled rows have no actions.
  List<Widget> _buildActions(BuildContext context, WidgetRef ref) {
    switch (grn.status) {
      case 'draft':
        return [
          SwipeAction(
            icon: Icons.edit_outlined,
            label: 'Edit',
            color: RunqColors.indigo,
            onTap: () async => context.push('/inventory/grn/${grn.id}'),
          ),
          SwipeAction(
            icon: Icons.delete_outline_rounded,
            label: 'Delete',
            color: RunqColors.redInk,
            onTap: () => _delete(context, ref),
          ),
        ];
      case 'posted':
        return [
          SwipeAction(
            icon: Icons.cancel_outlined,
            label: 'Cancel',
            color: RunqColors.redInk,
            onTap: () => _cancelPosted(context, ref),
          ),
        ];
      default:
        return const [];
    }
  }

  Future<void> _refresh(WidgetRef ref) async {
    ref.invalidate(invGrnListProvider(null));
    ref.invalidate(invGrnDetailProvider(grn.id));
  }

  Future<void> _delete(BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (dctx) => AlertDialog(
        title: const Text('Delete draft GRN?'),
        content: Text('${grn.grnNo} will be discarded. This cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dctx, false), child: const Text('Keep')),
          TextButton(
            onPressed: () => Navigator.pop(dctx, true),
            style: TextButton.styleFrom(foregroundColor: RunqColors.redInk),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await inventoryRepo.cancelGrn(grn.id, 'Draft discarded from list');
      await _refresh(ref);
      if (!context.mounted) return;
      showRunqSnack(context, 'Deleted ${grn.grnNo}', kind: SnackKind.success);
    } catch (e) {
      if (!context.mounted) return;
      showRunqSnack(context, "Couldn't delete: $e", kind: SnackKind.error);
    }
  }

  Future<void> _cancelPosted(BuildContext context, WidgetRef ref) async {
    final ctrl = TextEditingController();
    final reason = await showDialog<String>(
      context: context,
      builder: (dctx) => AlertDialog(
        title: const Text('Cancel GRN?'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${grn.grnNo} will be reversed (stock + journal).'),
            const SizedBox(height: 12),
            TextField(
              controller: ctrl,
              autofocus: true,
              maxLength: 500,
              decoration: const InputDecoration(
                labelText: 'Reason',
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dctx), child: const Text('Back')),
          TextButton(
            onPressed: () {
              final r = ctrl.text.trim();
              if (r.isEmpty) return;
              Navigator.pop(dctx, r);
            },
            style: TextButton.styleFrom(foregroundColor: RunqColors.redInk),
            child: const Text('Cancel GRN'),
          ),
        ],
      ),
    );
    if (reason == null || reason.isEmpty) return;
    try {
      await inventoryRepo.cancelGrn(grn.id, reason);
      await _refresh(ref);
      if (!context.mounted) return;
      showRunqSnack(context, 'Cancelled ${grn.grnNo}', kind: SnackKind.success);
    } catch (e) {
      if (!context.mounted) return;
      showRunqSnack(context, "Couldn't cancel: $e", kind: SnackKind.error);
    }
  }
}

