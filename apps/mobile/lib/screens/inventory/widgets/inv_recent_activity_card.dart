// Recent stock movements, as a card.
//
// Lifted out of the Home screen so the Movements hub can show the same
// thing: the hub is the screen named after movements, and until now it
// listed only the *kinds* of movement — every actual entry was another tap
// away. Home keeps its short read (5); the hub shows the full ten the
// endpoint already returns.
//
// One widget rather than two so the row chrome, the empty copy and the
// "See all" destination can't drift apart between the two screens.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../api/inventory_models.dart';
import '../../../providers/inventory_providers.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import '../../../utils/format_qty.dart';
import 'inv_primitives.dart';

/// The last [limit] ledger entries, newest first, under a "See all" header.
///
/// The provider fetches ten regardless — the cap is a display choice, so a
/// caller asking for more than the endpoint returns simply gets what there
/// is rather than an empty tail.
class InvRecentActivityCard extends ConsumerWidget {
  const InvRecentActivityCard({
    super.key,
    this.limit = 5,
    this.title = 'Recent Activity',
  });

  final int limit;
  final String title;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(invRecentActivityProvider);
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        InvSectionHeader(
          title: title,
          action: 'See all',
          actionIcon: Icons.history_rounded,
          onAction: () => context.push('/inventory/activity?period=7d'),
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
            error: (_, _) => InvCard(
              child: Text(
                'Could not load activity',
                style: RunqText.caption.copyWith(color: t.muted),
              ),
            ),
            data: (rows) {
              if (rows.isEmpty) {
                return InvCard(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    child: Text(
                      'No movements yet — receive or dispatch stock to see '
                      'entries here.',
                      style: RunqText.caption.copyWith(color: t.muted),
                    ),
                  ),
                );
              }
              final top = rows.take(limit).toList();
              return InvCard(
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 4,
                ),
                child: Column(
                  children: [
                    for (var i = 0; i < top.length; i++) ...[
                      invActivityRow(top[i]),
                      if (i < top.length - 1)
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

/// Shared mapper from `InvActivity` → `InvActivityRow` so every surface
/// showing the feed renders identical chrome.
Widget invActivityRow(InvActivity a) => InvActivityRow(
  type: a.iconKey,
  refLabel: a.itemName,
  unit: a.itemUnit,
  description: '${_sourceLabel(a.movementType)} · ${a.warehouseName}',
  amount: _signedQty(a),
  time: _relativeTime(a.movedAt),
);

String _sourceLabel(String movementType) {
  switch (movementType) {
    case 'grn':
      return 'GRN';
    case 'dn':
      return 'Delivery';
    case 'transfer_in':
      return 'Transfer in';
    case 'transfer_out':
      return 'Transfer out';
    case 'adjustment':
      return 'Adjustment';
    case 'stock_take':
      return 'Stock take';
    default:
      return movementType;
  }
}

/// Signed magnitude only — the unit rides with the item name, so repeating
/// it here would print it twice on the same row. It is still passed to
/// [formatItemQty], which uses it to decide measured (decimals) vs counted.
String _signedQty(InvActivity a) {
  final q = a.signedQty;
  final str = formatItemQty(q.abs(), null, unit: a.itemUnit);
  if (q > 0) return '+$str';
  if (q < 0) return '-$str';
  return str;
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
