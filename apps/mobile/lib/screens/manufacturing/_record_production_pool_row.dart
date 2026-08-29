// One batch a production run can draw from, and the button that draws it.
//
// Split out of `_record_production_alloc_list.dart` when the row stopped being
// a row: a batch is identified by where it came from, not by its number, and
// that label needs the full width of the card. Sharing one line with the
// quantity and the qty box meant "A1 Milk (Raw) · 15.8 litre · 3d" truncated
// away the two numbers the row exists to show.
//
// Layout, top to bottom — identity first, then condition, then the control:
//
//   🚚 Indus CC · 29 Aug · A2 cow          ← what this milk is
//      CON/2026-27/01705                   ← how to refer to it afterwards
//      108 litre  [3d] [524.1 L drawn]   [+] [ 0 ]

library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../api/manufacturing_models.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../utils/format_expiry.dart';
import '../../utils/format_qty.dart';
import '../inventory/widgets/batch_pool.dart' show batchOriginIcon;
import 'widgets/mfg_colors.dart';

/// Keeps a qty box to one decimal place.
///
/// The plant floor works to a tenth of a litre — a second decimal is noise
/// someone has to read past, and on a phone it is noise that costs the digits
/// in front of it. Rejects the edit outright rather than silently truncating,
/// so a mistyped third digit is visible as "nothing happened".
final oneDecimalFormatter = TextInputFormatter.withFunction((old, updated) {
  return RegExp(r'^\d*\.?\d?$').hasMatch(updated.text) ? updated : old;
});

/// A quantity as the qty box should hold it: full ledger precision, no
/// trailing zeros. Deliberately not the display format — writing the rounded
/// "7.4" of a 7.415 L batch would strand 0.015 L nobody meant to keep.
String qtyFieldText(double v) {
  final s = v.toStringAsFixed(3);
  return s.contains('.') ? s.replaceFirst(RegExp(r'0+$'), '').replaceFirst(RegExp(r'\.$'), '') : s;
}

/// Heading above each item's slice of a mixed pool. Reads as a heading rather
/// than as another muted meta line — on a card of four milk batches the eye
/// has to find the item boundaries first, and a micro grey label did not
/// carry that weight.
class PoolGroupHeading extends StatelessWidget {
  const PoolGroupHeading({
    super.key,
    required this.itemName,
    required this.count,
    required this.qty,
    required this.uom,
  });

  final String itemName;
  final int count;
  final double qty;
  final String uom;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.only(top: 12, bottom: 6),
      child: Row(children: [
        Container(
          width: 3,
          height: 14,
          decoration: BoxDecoration(
            color: MfgColors.brand(context),
            borderRadius: BorderRadius.circular(2),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            itemName,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: RunqText.caption.copyWith(color: t.ink, fontWeight: FontWeight.w700),
          ),
        ),
        Text(
          '${count == 1 ? '1 batch' : '$count batches'} · '
          '${formatItemQty(qty, null, unit: uom)} $uom',
          style: RunqText.micro.copyWith(color: t.muted),
        ),
      ]),
    );
  }
}

class PoolBatchRow extends StatelessWidget {
  final InputPoolBatch batch;
  final String uom;

  /// What the line is still short of, counting every box already filled. The
  /// fill button stops here rather than at the batch's on-hand qty — see
  /// [_DrawToggle].
  final double stillNeeded;

  /// True when the batch came from a substitute and no group heading is naming
  /// it — say which item this is, or the row lies.
  final bool showItem;
  final TextEditingController controller;
  final VoidCallback onChanged;

  const PoolBatchRow({
    super.key,
    required this.batch,
    required this.uom,
    required this.stillNeeded,
    required this.showItem,
    required this.controller,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final entered = double.tryParse(controller.text.trim()) ?? 0;
    final over = entered > batch.qty + 0.0005;
    final origin = batch.origin;
    final expiry = shortExpiry(batch.expiryDate);
    final drawn = (origin?.receivedQty ?? batch.qty) - batch.qty;

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
      decoration: BoxDecoration(
        color: entered > 0 ? MfgColors.roseSubtle : t.bgWarm,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: over
              ? MfgColors.error
              : entered > 0
                  ? MfgColors.brand(context)
                  : t.hairline,
        ),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // Identity, on its own full-width line and allowed to wrap. Two cans
        // of raw milk differ only by where and when they were collected.
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Padding(
            padding: const EdgeInsets.only(top: 1),
            child: Icon(batchOriginIcon(origin?.kind), size: 15, color: t.muted),
          ),
          const SizedBox(width: 7),
          Expanded(
            child: Text(
              origin?.label ?? _fallbackLabel,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: RunqText.caption.copyWith(color: t.ink, fontWeight: FontWeight.w700),
            ),
          ),
        ]),
        // The reference line: batch number, and the item when nothing above
        // has named it.
        Padding(
          padding: const EdgeInsets.only(left: 22, top: 1),
          child: Text(
            [
              if (showItem) batch.itemName,
              if (batch.batchNo?.isNotEmpty == true) batch.batchNo!,
            ].join(' · '),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: RunqText.micro.copyWith(color: t.muted2),
          ),
        ),
        const SizedBox(height: 8),
        // Condition and control on one line: what is in the tank, how long it
        // keeps, and the box that takes it.
        Row(children: [
          Expanded(
            child: Wrap(
              spacing: 6,
              runSpacing: 4,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Text(
                  '${formatItemQty(batch.qty, null, unit: uom)} $uom',
                  style: RunqText.body.copyWith(
                    color: over ? MfgColors.error : t.ink,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                if (expiry != null) _PoolChip(label: expiry, tone: _expiryTone(batch.expiryDate)),
                if (batch.isPartUsed && drawn > 0)
                  _PoolChip(
                    label: '${formatItemQty(drawn, null, unit: uom)} $uom drawn',
                    tone: _ChipTone.neutral,
                  ),
                // Part of this batch came from somewhere the label does not
                // name — booking a run against it attributes milk to a
                // collection it never came from.
                if (origin?.hasMixedIntake == true)
                  _PoolChip(
                    label: '+${formatItemQty(origin!.addedQty!, null, unit: uom)} '
                        '$uom added separately',
                    tone: _ChipTone.warning,
                  ),
              ],
            ),
          ),
          const SizedBox(width: 6),
          _DrawToggle(
            filled: entered > 0,
            onTap: () {
              // A partial draw rounds *up* to the next tenth. The box only
              // accepts one decimal, so a recipe needing 123.44 can never be
              // covered exactly — rounding down left the line 0.04 short,
              // which blocks Post while the tally shows two numbers that both
              // read "286.8". Up always covers the recipe; the excess is a
              // hundredth of a litre.
              //
              // Draining the batch still takes it exactly, dust and all —
              // leaving 0.015 L behind to round to a tenth is how part-used
              // batches pile up.
              final upToTenth = (stillNeeded * 10).ceilToDouble() / 10;
              final fill = stillNeeded > 0 && upToTenth < batch.qty ? upToTenth : batch.qty;
              controller.text = entered > 0 ? '' : qtyFieldText(fill);
              onChanged();
            },
          ),
          const SizedBox(width: 6),
          SizedBox(
            // Wide enough for a four-figure tanker draw with a decimal, and
            // fixed so every box on the card lines up down the right edge.
            width: 92,
            child: TextField(
              controller: controller,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              inputFormatters: [oneDecimalFormatter],
              textAlign: TextAlign.right,
              style: RunqText.body.copyWith(color: t.ink),
              onChanged: (_) => onChanged(),
              decoration: InputDecoration(
                isDense: true,
                contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
                hintText: '0',
                hintStyle: RunqText.body.copyWith(color: t.muted),
                filled: true,
                fillColor: t.surface,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: BorderSide(color: over ? MfgColors.error : t.hairline),
                ),
              ),
            ),
          ),
        ]),
      ]),
    );
  }

  String get _fallbackLabel =>
      batch.batchNo?.isNotEmpty == true ? batch.batchNo! : 'No batch';
}

enum _ChipTone { neutral, warning, danger }

/// Expiry urgency: today or past is an error, inside a week a warning.
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

class _PoolChip extends StatelessWidget {
  const _PoolChip({required this.label, required this.tone});
  final String label;
  final _ChipTone tone;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final (bg, fg) = switch (tone) {
      _ChipTone.danger => (MfgColors.errorBg, MfgColors.error),
      _ChipTone.warning => (MfgColors.orangeAlertBg, MfgColors.orangeAlert),
      _ChipTone.neutral => (t.bgWarmer, t.muted),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(99)),
      child: Text(label, style: RunqText.micro.copyWith(color: fg)),
    );
  }
}

/// Draw this batch, or put it back.
///
/// Fills the box with what the line still needs, capped by what is in the
/// batch — not with the batch's whole on-hand qty. The difference matters: a
/// tank that gave up 107 L for a run the recipe costs at 98.5 L did not
/// *consume* 107. The missing 8.5 L is process loss, and it belongs in the
/// closing-stock count below, where it posts as a write-off, instead of being
/// buried in the finished goods' unit cost.
///
/// Once the line is covered, tapping fills the rest of the batch — an
/// over-draw someone deliberately asked for. Tapping again clears the box, and
/// partial draws are still typed by hand.
class _DrawToggle extends StatelessWidget {
  const _DrawToggle({required this.filled, required this.onTap});

  final bool filled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final tone = filled ? MfgColors.error : MfgColors.brand(context);
    return Semantics(
      button: true,
      label: filled ? 'Remove this batch from the draw' : 'Draw all of this batch',
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            color: t.surface,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: filled ? tone : t.hairline),
          ),
          child: Icon(filled ? Icons.close_rounded : Icons.add_rounded, size: 18, color: tone),
        ),
      ),
    );
  }
}
