// Adjustment list — phase 2 mobile surface. Create + approve + post flows
// arrive in a focused round once the godown-floor scan UX settles.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/inventory_models.dart';
import '../../providers/inventory_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/inv_colors.dart';

const Map<String, String> _reasonLabels = {
  'damage': 'Damage', 'expiry': 'Expiry', 'theft': 'Theft', 'found': 'Found',
  'revaluation': 'Revaluation', 'correction': 'Correction', 'opening_balance': 'Opening',
};

class InventoryAdjustmentScreen extends ConsumerWidget {
  const InventoryAdjustmentScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final rows = ref.watch(invAdjustmentListProvider(null));
    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: AppBar(title: Text('Adjustments', style: RunqText.h3.copyWith(color: t.ink))),
      body: RefreshIndicator(
        color: InvColors.brand(context),
        onRefresh: () async {
          ref.invalidate(invAdjustmentListProvider(null));
          await Future<void>.delayed(const Duration(milliseconds: 200));
        },
        child: rows.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(child: Text('$e', style: RunqText.body.copyWith(color: t.muted))),
          data: (list) {
            if (list.isEmpty) {
              return ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: [
                  const SizedBox(height: 80),
                  Icon(Icons.tune, size: 48, color: t.muted2),
                  Center(child: Text('No adjustments yet', style: RunqText.bodyStrong.copyWith(color: t.muted))),
                  const SizedBox(height: 4),
                  Center(child: Text('Record damage / found / revaluation from the web app.',
                      style: RunqText.caption.copyWith(color: t.muted2), textAlign: TextAlign.center)),
                ],
              );
            }
            return ListView.separated(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              itemCount: list.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (_, i) => _AdjTile(adj: list[i]),
            );
          },
        ),
      ),
    );
  }
}

class _AdjTile extends StatelessWidget {
  const _AdjTile({required this.adj});
  final InvAdjustment adj;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final statusColor = switch (adj.status) {
      'posted' => Colors.green.shade700,
      'pending_approval' => Colors.orange.shade700,
      'cancelled' => Colors.red.shade700,
      _ => t.muted,
    };
    final delta = adj.totalValueDelta;
    final deltaColor = delta < 0
        ? Colors.red.shade700
        : delta > 0 ? Colors.green.shade700 : t.muted;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: t.surface,
        border: Border.all(color: t.hairlineSoft),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(adj.adjNo, style: RunqText.bodyStrong.copyWith(color: t.ink)),
                Text('${adj.adjustmentDate} · ${_reasonLabels[adj.reason] ?? adj.reason} · ${adj.warehouseName}',
                    style: RunqText.caption.copyWith(color: t.muted)),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                delta == 0 ? '—' : '${delta > 0 ? '+' : '-'}₹${delta.abs().toStringAsFixed(2)}',
                style: RunqText.bodyStrong.copyWith(color: deltaColor),
              ),
              const SizedBox(height: 2),
              Text(adj.status.toUpperCase().replaceAll('_', ' '),
                  style: RunqText.micro.copyWith(color: statusColor)),
            ],
          ),
        ],
      ),
    );
  }
}
