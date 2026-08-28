// Home stock strips — "Finished Goods" and "Raw Materials Available".
// Both render the same 5-row card off GET /inventory/dashboard/stock-highlights;
// only the class bucket and the empty-state copy differ. Rows are ordered by
// last movement, so goods that just came off a production run sit on top.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../api/inventory_models.dart';
import '../../../providers/inventory_providers.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import '../../../utils/format_qty.dart';
import 'inv_colors.dart';
import 'inv_primitives.dart';

class InvStockHighlightsCard extends ConsumerWidget {
  const InvStockHighlightsCard({
    super.key,
    required this.title,
    required this.group,
    required this.emptyText,
    this.showValue = true,
  });

  final String title;

  /// Item-class bucket: 'finished' or 'inputs'.
  final String group;
  final String emptyText;

  /// Finished goods lead with stock value; inputs lead with the balance,
  /// where a rupee figure on a raw material means much less to the floor.
  final bool showValue;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(invStockHighlightsProvider(group));
    final t = RT(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        InvSectionHeader(
          title: title,
          action: 'See all →',
          onAction: () => context.push('/inventory/items?classGroup=$group'),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: async.when(
            loading: () => Container(
              height: 96,
              decoration: BoxDecoration(
                color: t.surface,
                border: Border.all(color: t.hairline),
                borderRadius: BorderRadius.circular(14),
              ),
            ),
            error: (_, __) => InvCard(
              child: Text(
                'Could not load stock',
                style: RunqText.caption.copyWith(color: t.muted),
              ),
            ),
            data: (rows) {
              if (rows.isEmpty) {
                return InvCard(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    child: Text(
                      emptyText,
                      style: RunqText.caption.copyWith(color: t.muted),
                    ),
                  ),
                );
              }
              return InvCard(
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 4,
                ),
                child: Column(
                  children: [
                    for (var i = 0; i < rows.length; i++) ...[
                      _HighlightRow(row: rows[i], showValue: showValue),
                      if (i < rows.length - 1)
                        Divider(
                          height: 1,
                          thickness: 0.5,
                          color: t.hairlineSoft,
                        ),
                    ],
                  ],
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

class _HighlightRow extends StatelessWidget {
  const _HighlightRow({required this.row, required this.showValue});
  final InvStockHighlight row;
  final bool showValue;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    // Below reorder is the one state worth colouring here — it's the
    // difference between "we have it" and "the line stops tomorrow".
    final low = row.isLow;
    return InkWell(
      onTap: () => context.push('/inventory/items/${row.itemId}'),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // UOM trails the name in muted type — it qualifies the
                  // product ("Ghee, sold in 500ml"), so it belongs with the
                  // name rather than buried in the meta line.
                  Text.rich(
                    TextSpan(
                      text: row.name,
                      style: RunqText.body.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                      children: [
                        if (row.unit != null && row.unit!.isNotEmpty)
                          TextSpan(
                            text: '  ${row.unit}',
                            style: RunqText.caption.copyWith(color: t.muted2),
                          ),
                      ],
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    _subtitle(row),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: RunqText.caption.copyWith(color: t.muted),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  _qtyLabel(row),
                  style: RunqText.body.copyWith(
                    fontWeight: FontWeight.w700,
                    color: low ? InvColors.orangeAlert : t.ink,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  low
                      ? 'Below reorder'
                      : showValue
                      ? _money(row.value)
                      : '',
                  style: RunqText.caption.copyWith(
                    color: low ? InvColors.orangeAlert : t.muted,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Meta line: SKU · last movement. The unit is not here — it trails the
/// product name, which is what it qualifies.
String _subtitle(InvStockHighlight r) {
  final parts = <String>[
    if (r.sku != null && r.sku!.isNotEmpty) r.sku!,
    if (r.lastMovementAt != null) _relativeTime(r.lastMovementAt!),
  ];
  return parts.isEmpty ? '—' : parts.join(' · ');
}

String _qtyLabel(InvStockHighlight r) =>
    formatItemQty(r.qty, r.itemClass, unit: r.unit);

String _money(double v) {
  if (v >= 10000000) return '₹${(v / 10000000).toStringAsFixed(2)} Cr';
  if (v >= 100000) return '₹${(v / 100000).toStringAsFixed(2)} L';
  if (v >= 1000) return '₹${(v / 1000).toStringAsFixed(1)} K';
  return '₹${v.toStringAsFixed(0)}';
}

String _relativeTime(DateTime when) {
  final diff = DateTime.now().difference(when);
  if (diff.inMinutes < 1) return 'just now';
  if (diff.inMinutes < 60) return '${diff.inMinutes}m';
  if (diff.inHours < 24) return '${diff.inHours}h';
  if (diff.inDays < 7) return '${diff.inDays}d';
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return '${when.day} ${months[when.month - 1]}';
}
