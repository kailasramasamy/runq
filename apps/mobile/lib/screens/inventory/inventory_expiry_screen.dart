// Batch expiry report — mirrors the web `inventory/reports/expiry` screen.
// Reuses `invExpiringProvider(withinDays)` so the perishables tile on the
// Mfg home and this screen share their cache for the overlapping window.

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

class InventoryExpiryScreen extends ConsumerStatefulWidget {
  const InventoryExpiryScreen({super.key});
  @override
  ConsumerState<InventoryExpiryScreen> createState() => _State();
}

class _State extends ConsumerState<InventoryExpiryScreen> {
  static const _windows = <int>[7, 15, 30, 60, 90, 180];
  int _withinDays = 7;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final async = ref.watch(invExpiringProvider(_withinDays));
    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: InvPlainAppBar(
        title: 'Batch expiry',
        onBack: Navigator.of(context).canPop() ? () => context.pop() : null,
      ),
      body: RefreshIndicator(
        color: InvColors.brand(context),
        onRefresh: () async {
          ref.invalidate(invExpiringProvider);
          await Future<void>.delayed(const Duration(milliseconds: 200));
        },
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          padding: const EdgeInsets.only(bottom: 120),
          children: [
            _WindowChips(
              selected: _withinDays,
              windows: _windows,
              onPick: (d) => setState(() => _withinDays = d),
            ),
            async.when(
              loading: () => const Padding(
                padding: EdgeInsets.symmetric(vertical: 48),
                child: Center(child: CircularProgressIndicator()),
              ),
              error: (e, _) => Padding(
                padding: const EdgeInsets.all(24),
                child: Text('Failed to load: $e',
                    style: RunqText.caption.copyWith(color: t.muted),
                    textAlign: TextAlign.center),
              ),
              data: (rows) {
                if (rows.isEmpty) {
                  return Padding(
                    padding: const EdgeInsets.all(32),
                    child: Text(
                      'No batches expiring within $_withinDays days.',
                      style: RunqText.caption.copyWith(color: t.muted),
                      textAlign: TextAlign.center,
                    ),
                  );
                }
                return Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Column(
                    children: [
                      for (final r in rows)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: _ExpiryTile(row: r),
                        ),
                    ],
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _WindowChips extends StatelessWidget {
  const _WindowChips({
    required this.selected,
    required this.windows,
    required this.onPick,
  });
  final int selected;
  final List<int> windows;
  final ValueChanged<int> onPick;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            for (final d in windows) ...[
              _Chip(
                label: 'Next ${d}d',
                active: d == selected,
                onTap: () => onPick(d),
              ),
              const SizedBox(width: 6),
            ],
          ],
        ),
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
    return Material(
      color: active ? brand.withValues(alpha: 0.10) : t.surface,
      borderRadius: BorderRadius.circular(99),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(99),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(99),
            border: Border.all(color: active ? brand : t.hairline),
          ),
          child: Text(
            label,
            style: RunqText.caption.copyWith(
              color: active ? brand : t.ink,
              fontWeight: active ? FontWeight.w600 : FontWeight.w500,
            ),
          ),
        ),
      ),
    );
  }
}

class _ExpiryTile extends StatelessWidget {
  const _ExpiryTile({required this.row});
  final InvExpiringBatch row;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final (bg, fg, label) = _urgency(row.daysToExpiry);
    return Material(
      color: t.surface,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: () => context.push('/inventory/items/${row.itemId}'),
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: t.hairline),
          ),
          child: Row(
            children: [
              Container(
                width: 36, height: 36,
                decoration: BoxDecoration(
                  color: t.bgWarmer,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(Icons.event_outlined, size: 17, color: t.muted),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            row.itemName,
                            style: RunqText.bodyStrong.copyWith(color: t.ink),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: bg,
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text(
                            label,
                            style: RunqText.caption.copyWith(
                              color: fg,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${_fmtQty(row.qty)} ${row.itemUnit ?? ''} · ${row.warehouseName}'
                      '${row.batchNo.isEmpty ? '' : ' · ${row.batchNo}'}'
                      ' · exp ${row.expiryDate}',
                      style: RunqText.caption.copyWith(color: t.muted),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  (Color, Color, String) _urgency(int days) {
    if (days < 0) return (InvColors.errorBg, InvColors.error, 'Expired');
    if (days == 0) return (InvColors.errorBg, InvColors.error, 'Today');
    if (days == 1) return (InvColors.orangeAlertBg, InvColors.orangeAlert, 'Tomorrow');
    if (days <= 7) return (InvColors.orangeAlertBg, InvColors.orangeAlert, '${days}d');
    final t2 = InvColors.orangeAlertBg.withValues(alpha: 0.40);
    return (t2, InvColors.orangeAlert, '${days}d');
  }
}

String _fmtQty(double v) =>
    v == v.truncateToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(3);
