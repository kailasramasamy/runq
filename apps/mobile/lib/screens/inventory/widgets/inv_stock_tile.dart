// Stock tile for the Stock on Hand list — item avatar, name + meta, a stock
// bar against the reorder level, and the qty/value column on the right.

library;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import '../../../utils/format_qty.dart';
import 'inv_colors.dart';
import 'inv_on_hand_sections.dart';
import 'inv_primitives.dart';

class InvStockTile extends StatelessWidget {
  const InvStockTile({super.key, required this.row});
  final OnHandGroup row;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final batches = row.batches.length;
    final metaBits = [
      if (row.itemSku?.isNotEmpty == true) row.itemSku!,
      row.warehouseName,
      // A single batch is worth naming; a hundred milk consignments are not,
      // so past one the tile states the count and defers to the item screen.
      if (batches == 1 && row.lead.batchNo.isNotEmpty)
        'Batch ${row.lead.batchNo}'
      else if (batches > 1)
        '$batches batches',
    ];
    final meta = metaBits.join(' · ');
    return InvCard(
      onTap: () => context.push('/inventory/items/${row.itemId}'),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Item avatar — bg-warmer square with neutral box icon.
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: t.bgWarmer,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(Icons.inventory_2_outlined, size: 17, color: t.muted),
          ),
          const SizedBox(width: 10),
          // Middle column — name + Low badge + meta + bar.
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // UOM trails the name — it qualifies the product, and
                    // under the bold quantity it read as a second number.
                    Expanded(
                      child: Text.rich(
                        TextSpan(
                          text: row.itemName,
                          style: RunqText.bodyStrong.copyWith(
                            color: t.ink,
                            fontSize: 14,
                          ),
                          children: [
                            if (row.itemUnit?.isNotEmpty == true)
                              TextSpan(
                                text: '  ${row.itemUnit}',
                                style: RunqText.caption.copyWith(
                                  color: t.muted2,
                                ),
                              ),
                          ],
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    if (row.isLow)
                      Container(
                        margin: const EdgeInsets.only(left: 6, top: 1),
                        padding: const EdgeInsets.symmetric(
                          horizontal: 6,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: InvColors.orangeAlertBg,
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          'Low',
                          style: RunqText.micro.copyWith(
                            color: InvColors.orangeAlert,
                            letterSpacing: 0.2,
                          ),
                        ),
                      ),
                    if (row.earliestExpiry != null)
                      _ExpiryPill(date: row.earliestExpiry!),
                  ],
                ),
                if (meta.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    meta,
                    style: RunqText.caption.copyWith(color: t.muted),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
                const SizedBox(height: 6),
                InvStockBar(
                  qty: row.qty,
                  reorderLevel: row.reorderLevel,
                  isLow: row.isLow,
                  // The threshold rides the bar as a badge — the row no longer
                  // needs a legend to say what the mark stands for.
                  markerLabel: row.reorderLevel == null
                      ? null
                      : formatItemQty(row.reorderLevel, row.itemClass),
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          // Right column — qty, value.
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                formatItemQty(row.qty, row.itemClass),
                style: RunqText.h4.copyWith(
                  color: row.isLow ? InvColors.orangeAlert : t.ink,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                compactINR(row.value),
                style: RunqText.caption.copyWith(color: t.muted2),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Per-row expiry pill. Sits beside the Low badge in the stock tile header.
/// Suppressed for batches outside the 7-day urgency window so the list
/// stays calm on non-perishable stock.
class _ExpiryPill extends StatelessWidget {
  const _ExpiryPill({required this.date});
  final String date;

  @override
  Widget build(BuildContext context) {
    final days = _daysFromToday(date);
    if (days == null || days > 7) return const SizedBox.shrink();
    final urgent = days <= 1;
    final bg = urgent ? InvColors.errorBg : InvColors.orangeAlertBg;
    final fg = urgent ? InvColors.error : InvColors.orangeAlert;
    final label = days < 0
        ? 'Expired'
        : days == 0
        ? 'Today'
        : days == 1
        ? 'Tomorrow'
        : '${days}d';
    return Container(
      margin: const EdgeInsets.only(left: 6, top: 1),
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        label,
        style: RunqText.micro.copyWith(color: fg, letterSpacing: 0.2),
      ),
    );
  }

  static int? _daysFromToday(String iso) {
    final d = DateTime.tryParse(iso);
    if (d == null) return null;
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    return d.difference(today).inDays;
  }
}
