// Batch rows that say what a batch actually is.
//
// A raw-material pool is not one number — it is yesterday's PM collection,
// this morning's intake, the balance nobody finished, and the milk poured back
// out of unsold packets. Every one of those is a `batch_no` on stock_on_hand
// and reads identically until the origin is spelled out, which is why a
// planner choosing milk for a paneer run could not tell them apart.
//
// The label comes from the API (`BatchOriginService`); everything here is
// presentation.

import 'package:flutter/material.dart';

import '../../../api/inventory_models.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import '../../../utils/format_expiry.dart';
import '../../../utils/format_qty.dart';
import 'inv_colors.dart';
import 'inv_primitives.dart';

/// Icon per origin kind — a glance should separate fresh intake from milk
/// that has already been through a packet.
IconData batchOriginIcon(String? kind) {
  switch (kind) {
    case 'mp_receipt':
      return Icons.local_shipping_outlined;
    case 'reclaim':
      return Icons.recycling_rounded;
    case 'grn':
      return Icons.inventory_2_outlined;
    case 'production':
      return Icons.precision_manufacturing_outlined;
    case 'transfer':
      return Icons.swap_horiz_rounded;
    case 'adjustment':
      return Icons.tune_rounded;
    case 'stock_take':
      return Icons.fact_check_outlined;
    case 'opening':
      return Icons.flag_outlined;
    default:
      return Icons.label_outline_rounded;
  }
}

/// Reclaimed stock is the one origin that must not be mistaken for fresh —
/// it has already spent time in a packet, so it carries the short date and
/// should be drawn first. Everything else reads in the neutral ink.
Color batchOriginColor(BuildContext context, String? kind) =>
    kind == 'reclaim' ? InvColors.orangeAlert : RT(context).muted;

/// What one batch is: provenance, how much is left of what arrived, and how
/// long it has. Rendered as a tappable row inside a pool card.
class BatchPoolRow extends StatelessWidget {
  const BatchPoolRow({
    super.key,
    required this.batchNo,
    required this.qty,
    this.unit,
    this.origin,
    this.expiryDate,
    this.value,
    this.partUsed = false,
    this.onTap,
  });

  final String batchNo;
  final double qty;
  final String? unit;
  final BatchOrigin? origin;
  final String? expiryDate;
  final double? value;

  /// Some of the batch is already drawn — this is a balance, not a full can.
  final bool partUsed;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final o = origin;
    final unitSuffix = unit != null && unit!.isNotEmpty ? ' $unit' : '';
    final expiry = shortExpiry(expiryDate);
    // Second line carries the batch number itself. It is the audit handle, not
    // the identity — so it sits under the label rather than replacing it.
    final sub = <String>[
      if (batchNo.isNotEmpty) batchNo,
      if (o?.detail != null && o!.detail!.isNotEmpty) o.detail!,
    ].join(' · ');

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Padding(
            padding: const EdgeInsets.only(top: 1),
            child: Icon(
              batchOriginIcon(o?.kind),
              size: 15,
              color: batchOriginColor(context, o?.kind),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(
                o?.label ?? (batchNo.isEmpty ? 'No batch' : batchNo),
                // Two lines: a long centre name plus date, shift and milk type
                // is more than one line of a phone, and the identity is the
                // one thing on the row that must never be cut short.
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: RunqText.caption.copyWith(
                  color: t.ink,
                  fontWeight: FontWeight.w600,
                ),
              ),
              if (sub.isNotEmpty) ...[
                const SizedBox(height: 2),
                Text(
                  sub,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: RunqText.micro.copyWith(color: t.muted2),
                ),
              ],
              if (partUsed || expiry != null || o?.hasMixedIntake == true) ...[
                const SizedBox(height: 4),
                Wrap(spacing: 6, runSpacing: 4, children: [
                  if (partUsed)
                    // How much has already gone, not how much arrived — the
                    // right-hand column already says what is left, so the
                    // received figure would only restate the same subtraction.
                    _BatchChip(
                      label: 'part-used · ${_trim((o?.receivedQty ?? qty) - qty, unit)}'
                          '$unitSuffix drawn',
                      tone: _ChipTone.neutral,
                    ),
                  if (expiry != null)
                    _BatchChip(label: expiry, tone: _expiryTone(expiryDate)),
                  // Stock the label does not account for. Left silent, an
                  // adjustment topping up a milk consignment reads as more of
                  // that collection — the batch says Indus CC while a fifth
                  // of it never came from there.
                  if (o?.hasMixedIntake == true)
                    _BatchChip(
                      label: '+${_trim(o!.addedQty!, unit)}$unitSuffix added separately',
                      tone: _ChipTone.warning,
                    ),
                ]),
              ],
            ]),
          ),
          const SizedBox(width: 8),
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Text(
              '${_trim(qty, unit)}$unitSuffix',
              style: RunqText.caption.copyWith(color: t.ink, fontWeight: FontWeight.w700),
            ),
            if (value != null)
              Text(
                value! > 0 ? compactINR(value!) : 'not costed',
                style: RunqText.micro.copyWith(color: t.muted2),
              ),
          ]),
          if (onTap != null) ...[
            const SizedBox(width: 2),
            Icon(Icons.chevron_right_rounded, size: 16, color: t.muted2),
          ],
        ]),
      ),
    );
  }

  static String _trim(double v, String? unit) => formatItemQty(v, null, unit: unit);
}

/// Expiry urgency, matching the on-hand list's 7-day window: today or past is
/// an error, inside a week is a warning, anything further is quiet.
_ChipTone _expiryTone(String? iso) {
  final date = iso == null ? null : DateTime.tryParse(iso);
  if (date == null) return _ChipTone.neutral;
  final now = DateTime.now();
  final days = DateTime(date.year, date.month, date.day)
      .difference(DateTime(now.year, now.month, now.day))
      .inDays;
  if (days <= 0) return _ChipTone.danger;
  if (days <= 7) return _ChipTone.warning;
  return _ChipTone.neutral;
}

enum _ChipTone { neutral, warning, danger }

class _BatchChip extends StatelessWidget {
  const _BatchChip({required this.label, required this.tone});
  final String label;
  final _ChipTone tone;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final (bg, fg) = switch (tone) {
      _ChipTone.danger => (InvColors.errorBg, InvColors.error),
      _ChipTone.warning => (InvColors.amberSubtle, InvColors.amberDeep),
      // `hairline` is already a low-alpha ink; re-setting its alpha to 0.5
      // turned it into a near-solid slab that swallowed the label.
      _ChipTone.neutral => (t.bgWarmer, t.muted),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(99)),
      child: Text(label, style: RunqText.micro.copyWith(color: fg)),
    );
  }
}

/// Header for a pool card: how many batches make up the total, so the number
/// at the top of an item is never mistaken for one homogeneous lot.
class BatchPoolHeader extends StatelessWidget {
  const BatchPoolHeader({
    super.key,
    required this.count,
    required this.qty,
    this.unit,
    this.value,
  });

  final int count;
  final double qty;
  final String? unit;
  final double? value;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final unitSuffix = unit != null && unit!.isNotEmpty ? ' $unit' : '';
    return Row(children: [
      Expanded(
        child: Text(
          count == 1 ? '1 batch in pool' : '$count batches in pool',
          style: RunqText.caption.copyWith(color: t.muted, fontWeight: FontWeight.w600),
        ),
      ),
      Text(
        '${formatItemQty(qty, null, unit: unit)}$unitSuffix',
        style: RunqText.caption.copyWith(color: t.ink, fontWeight: FontWeight.w700),
      ),
      if (value != null && value! > 0) ...[
        const SizedBox(width: 8),
        Text(compactINR(value!), style: RunqText.micro.copyWith(color: t.muted2)),
      ],
    ]);
  }
}
