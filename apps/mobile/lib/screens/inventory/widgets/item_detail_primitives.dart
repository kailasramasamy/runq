// Shared building blocks for the Inventory Item Detail cards — the
// label/value rows, badges and on-off chips that every section reuses.
// Split from item_detail_cards.dart to keep both files readable.

library;

import 'package:flutter/material.dart';

import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import 'inv_colors.dart';

/// Formats a stock / pack quantity — drops the decimals when the number is
/// whole so "12 kg" doesn't render as "12.00 kg".
String fmtQty(double q) =>
    q == q.roundToDouble() ? q.toStringAsFixed(0) : q.toStringAsFixed(2);

class ItemBadge extends StatelessWidget {
  const ItemBadge({super.key, required this.label, required this.bg, required this.fg});
  final String label;
  final Color bg;
  final Color fg;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
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
}

/// On-off chip for a tracking flag. Off states stay legible (muted, not
/// invisible) so "expiry is NOT tracked" reads as a deliberate answer.
class ItemTrackChip extends StatelessWidget {
  const ItemTrackChip({super.key, required this.label, required this.on});
  final String label;
  final bool on;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: on ? InvColors.successBg : t.bgWarmer,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            on ? Icons.check_circle_outline : Icons.remove_circle_outline,
            size: 13,
            color: on ? InvColors.success : t.muted2,
          ),
          const SizedBox(width: 4),
          Text(
            label,
            style: RunqText.micro.copyWith(
              color: on ? InvColors.success : t.muted2,
            ),
          ),
        ],
      ),
    );
  }
}

// ── Shared label/value primitives ────────────────────────────────────────

/// Vertical stack of [ItemKvRow]s separated by hairlines.
class ItemKvList extends StatelessWidget {
  const ItemKvList({super.key, required this.rows});
  final List<Widget> rows;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (var i = 0; i < rows.length; i++) ...[
          if (i > 0) Container(height: 1, color: t.hairlineSoft),
          rows[i],
        ],
      ],
    );
  }
}

/// One `label ————— value` line. [emphasis] bolds the value for the number
/// that matters most in the card (e.g. the landing price). Pass [expanded]
/// + [onToggle] to turn the row into a disclosure for a nested breakdown.
class ItemKvRow extends StatelessWidget {
  const ItemKvRow({
    super.key,
    required this.label,
    required this.value,
    this.emphasis = false,
    this.expanded,
    this.onToggle,
  });
  final String label;
  final String value;
  final bool emphasis;
  final bool? expanded;
  final VoidCallback? onToggle;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final row = Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Row(
              children: [
                Flexible(
                  child: Text(
                    label,
                    style: RunqText.caption.copyWith(
                      color: onToggle == null ? t.muted : InvColors.brand(context),
                    ),
                  ),
                ),
                if (expanded != null) ...[
                  const SizedBox(width: 2),
                  Icon(
                    expanded! ? Icons.expand_less : Icons.expand_more,
                    size: 16,
                    color: InvColors.brand(context),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 12),
          // Not Flexible: two flex children split the row between them, so
          // the value box shrank to its own text and stopped short of the
          // right edge — `textAlign` had nothing to align inside. Laying the
          // value out at its intrinsic width and letting the label absorb
          // the rest puts every figure flush right, which is what makes a
          // column of prices readable. Same shape as the net-profit row and
          // the COGM breakdown below.
          Text(
            value,
            textAlign: TextAlign.right,
            style: emphasis
                ? RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 14)
                : RunqText.body.copyWith(color: t.ink, fontSize: 14),
          ),
        ],
      ),
    );
    if (onToggle == null) return row;
    return InkWell(
      onTap: onToggle,
      borderRadius: BorderRadius.circular(6),
      child: row,
    );
  }
}
