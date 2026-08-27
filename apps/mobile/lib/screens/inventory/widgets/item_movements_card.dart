// "Recent Movements" preview on the item detail screen — the last few stock
// changes with the document behind each, and a tap-through to the full audit
// trail. Fetches the same paged endpoint the trail screen uses, so opening
// the trail from here is a cache hit.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../api/inventory_movement_models.dart';
import '../../../providers/inventory_providers.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import 'inv_colors.dart';
import 'inv_primitives.dart';

const _previewCount = 3;

class ItemMovementsCard extends ConsumerWidget {
  const ItemMovementsCard({
    super.key,
    required this.itemId,
    required this.onViewAll,
  });
  final String itemId;
  final VoidCallback onViewAll;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final async = ref.watch(
      invItemMovementsProvider(InvMovementQuery(itemId: itemId)),
    );

    return async.when(
      loading: () => InvCard(
        child: Text('Loading movements…',
            style: RunqText.caption.copyWith(color: t.muted)),
      ),
      // A failed audit trail must not take the item page down with it — the
      // rest of the screen is still useful.
      error: (_, _) => InvCard(
        child: Text('Movements unavailable',
            style: RunqText.caption.copyWith(color: t.muted)),
      ),
      data: (page) {
        if (page.rows.isEmpty) {
          return InvCard(
            child: Text('No stock movements yet',
                style: RunqText.caption.copyWith(color: t.muted)),
          );
        }
        final rows = page.rows.take(_previewCount).toList();
        return InvCard(
          onTap: onViewAll,
          child: Column(
            children: [
              for (var i = 0; i < rows.length; i++) ...[
                if (i > 0) Divider(height: 14, color: t.hairlineSoft),
                _PreviewRow(row: rows[i]),
              ],
            ],
          ),
        );
      },
    );
  }
}

class _PreviewRow extends StatelessWidget {
  const _PreviewRow({required this.row});
  final InvMovementRow row;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final tone = row.isIn ? InvColors.success : InvColors.error;
    final label = invMovementLabels[row.movementType] ?? row.movementType;
    final doc = row.doc;

    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                doc == null ? label : '$label · ${doc.no}',
                style: RunqText.body.copyWith(fontWeight: FontWeight.w600),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              Text(
                [
                  '${prettyShortDate(row.movedAt.toIso8601String().substring(0, 10))}'
                      ', ${prettyTime(row.postedAt)}',
                  doc?.party ?? doc?.note,
                ].whereType<String>().join(' · '),
                style: RunqText.caption.copyWith(color: t.muted),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
        const SizedBox(width: 8),
        Text(
          '${row.isIn ? '+' : '−'}'
              '${row.qty.toStringAsFixed(row.qty == row.qty.roundToDouble() ? 0 : 2)}',
          style: RunqText.body.copyWith(color: tone, fontWeight: FontWeight.w700),
        ),
      ],
    );
  }
}
