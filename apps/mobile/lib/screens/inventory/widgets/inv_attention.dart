// "Needs attention" — the dispatch queue plus every open exception.
//
// Split out of inventory_home_screen.dart, which was over the file budget.
//
// This was a 2-column grid of boxed tiles. The list is dynamic — between one
// and seven entries depending on what is actually wrong — so the grid spent
// its time either half-empty on the last row or padding an odd count with a
// blank cell, and each tile stacked its number above its label, costing two
// lines to say one thing. A single column of one-line rows inside one card
// reads top-to-bottom regardless of how many there are, and fits roughly
// twice as many in the same height.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../api/inventory_models.dart';
import '../../../providers/inventory_providers.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import 'inv_colors.dart';
import 'inv_primitives.dart';

String _batches(int n) => n == 1 ? '1 batch' : '$n batches';

/// One exception: what it is on the left, how much of it on the right.
class _AttentionItem {
  const _AttentionItem({
    required this.icon,
    required this.color,
    required this.label,
    required this.value,
    required this.route,
  });
  final IconData icon;
  final Color color;
  final String label;
  final String value;
  final String route;
}

class InvNeedsAttention extends ConsumerWidget {
  const InvNeedsAttention({super.key, required this.k});
  final InvKpis k;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    // `total`, not `rows.length` — the queue request is capped at 100 rows.
    final pending = ref.watch(invPendingDispatchProvider).valueOrNull?.total;
    final shortages = ref.watch(invShortageCountProvider).valueOrNull ?? 0;
    final items = _items(context, t, pending, shortages);

    return Column(
      children: [
        const InvSectionHeader(title: 'Needs attention'),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: InvCard(
            padding: EdgeInsets.zero,
            // The rows are InkWells; without clipping their splash paints
            // over the card's rounded corners.
            child: ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: Column(
                children: [
                  for (var i = 0; i < items.length; i++) ...[
                    if (i > 0)
                      Divider(height: 1, thickness: 1, indent: 52, endIndent: 14,
                          color: t.hairlineSoft),
                    _AttentionRow(item: items[i]),
                  ],
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  /// Exceptions appear only when they exist — a list of zeroes trains the eye
  /// to skip the section, so an all-clear collapses to a single row.
  List<_AttentionItem> _items(
    BuildContext context,
    RunqTokens t,
    int? pending,
    int shortages,
  ) {
    final exceptions = [
      ..._shortageException(shortages),
      ..._stockExceptions(t),
      ..._queueExceptions(),
    ];
    return [
      _AttentionItem(
        icon: Icons.pending_actions_outlined,
        // Brand while work is outstanding, green once the queue is clear —
        // the row should read as "nothing to do", not as a bare zero.
        color: (pending ?? 0) > 0 ? InvColors.brand(context) : InvColors.success,
        label: switch (pending) {
          null => 'Pending dispatch',
          0 => 'All dispatched',
          1 => 'Invoice to dispatch',
          _ => 'Invoices to dispatch',
        },
        value: pending == null ? '—' : '$pending',
        route: '/inventory/pending-dispatch',
      ),
      ...exceptions,
      if (exceptions.isEmpty)
        const _AttentionItem(
          icon: Icons.check_circle_outline,
          color: InvColors.success,
          label: 'Nothing else pending',
          value: 'Clear',
          route: '/inventory/alerts',
        ),
    ];
  }

  /// Billed and not sent — the sharpest exception on this screen, because
  /// unlike a low-stock warning there is a customer already short.
  List<_AttentionItem> _shortageException(int shortages) => [
        if (shortages > 0)
          _AttentionItem(
            icon: Icons.error_outline,
            color: InvColors.error,
            label: shortages == 1 ? 'Line billed not sent' : 'Lines billed not sent',
            value: '$shortages',
            route: '/inventory/shortages',
          ),
      ];

  /// What is wrong with stock levels themselves.
  List<_AttentionItem> _stockExceptions(RunqTokens t) => [
      if (k.outOfStockCount > 0)
        _AttentionItem(
          icon: Icons.remove_shopping_cart_outlined,
          color: InvColors.error,
          label: 'Out of stock',
          value: '${k.outOfStockCount}',
          route: '/inventory/alerts?status=out',
        ),
      if (k.lowStockCount > 0)
        _AttentionItem(
          icon: Icons.warning_amber_rounded,
          color: InvColors.amberDeep,
          label: 'Below reorder level',
          value: '${k.lowStockCount}',
          route: '/inventory/alerts?status=low',
        ),
      // Expiry and dead stock lead with the amount, not the batch count: both
      // are money decisions (write-off risk, locked-up cash) and "12 batches"
      // gives an owner nothing to weigh them against. Low / out-of-stock stay
      // as counts — an out-of-stock line is worth ₹0 by definition, and for a
      // low line the on-hand value is not the story either.
      if (k.expiringSoon > 0)
        _AttentionItem(
          icon: Icons.schedule_rounded,
          color: InvColors.error,
          label: 'Expiring in 30d · ${_batches(k.expiringSoon)}',
          value: compactINR(k.expiringSoonValue),
          route: '/inventory/reports/expiry',
        ),
      if (k.deadStock > 0)
        _AttentionItem(
          icon: Icons.hourglass_bottom_rounded,
          color: t.muted,
          label: 'Unmoved 90+ days · ${_batches(k.deadStock)}',
          value: compactINR(k.deadStockValue),
          route: '/inventory/on-hand',
        ),
    ];

  /// What is sitting waiting on somebody.
  List<_AttentionItem> _queueExceptions() => [
      if (k.inTransitTransfers > 0)
        _AttentionItem(
          icon: Icons.alt_route_outlined,
          color: InvColors.info,
          label: 'Transfers in transit',
          value: '${k.inTransitTransfers}',
          route: '/inventory/transfers',
        ),
      if (k.pendingAdjustments > 0)
        _AttentionItem(
          icon: Icons.tune_rounded,
          color: InvColors.amberDeep,
          label: 'Adjustments to approve',
          value: '${k.pendingAdjustments}',
          route: '/inventory/adjustments',
        ),
    ];
}

class _AttentionRow extends StatelessWidget {
  const _AttentionRow({required this.item});
  final _AttentionItem item;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return InkWell(
      onTap: () => context.push(item.route),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
        child: Row(
          children: [
            Container(
              width: 28,
              height: 28,
              decoration: BoxDecoration(
                color: item.color.withValues(alpha: 0.10),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(item.icon, size: 15, color: item.color),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                item.label,
                style: RunqText.bodyStrong.copyWith(color: t.ink),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const SizedBox(width: 8),
            Text(
              item.value,
              style: RunqText.tabular(size: 15, w: FontWeight.w700, color: item.color),
            ),
            Icon(Icons.chevron_right_rounded, size: 18, color: t.muted2),
          ],
        ),
      ),
    );
  }
}
