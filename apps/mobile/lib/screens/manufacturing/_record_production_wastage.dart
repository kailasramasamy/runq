// Closing-stock step on the Record Production screen — the operator counts what
// is physically left of each input after the run, and the wastage falls out of
// the arithmetic: (stock before − consumed) − actually left.
//
// Asking for the leftover rather than the loss matches what someone on the floor
// can see: 315 L went in, 600 packs came out, 10 L is still in the tank. The 5 L
// that vanished is our sum to do, not theirs.
//
// Posted as a production_loss write-off tied to the run, not as extra
// consumption, so the loss shows up in the daily write-off register instead of
// vanishing into the finished goods' unit cost.

library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../api/manufacturing_models.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '_record_production_alloc_list.dart' show drawKey, drawnQty;
import 'widgets/mfg_colors.dart';
import 'widgets/mfg_primitives.dart';

/// One item the run actually drew from, and what should be left of it.
///
/// Built per *item*, never per BOM line. A line that accepts substitutes pools
/// its stand-ins for the shortage check — "140 L of milk, A2 or A1 or buffalo"
/// — so `allocation.availableQty` is the whole pool. Counting the leftover of
/// one named milk against a three-milk balance wrote the untouched substitutes
/// off as production loss.
class ClosingStockRow {
  final String itemId;
  final String itemName;
  final String uom;

  /// On hand before the run, across this item's batches.
  final double onHand;

  /// What the operator typed against this item's batches.
  final double drawn;

  const ClosingStockRow({
    required this.itemId,
    required this.itemName,
    required this.uom,
    required this.onHand,
    required this.drawn,
  });

  /// What the books say should be left once the run takes its share.
  double get expectedLeft => onHand - drawn;
}

/// The items this run touched, in pool order.
///
/// Only items with a typed draw get a row: an untouched substitute cannot have
/// been wasted, and offering a count for it is what invited the bad write-off.
/// Batches are de-duplicated across lines, so an item feeding two lines is
/// counted once and nets both draws.
List<ClosingStockRow> closingStockRows(
  ProductionPreview preview,
  Map<String, TextEditingController> drawCtls,
) {
  final onHand = <String, double>{};
  final drawn = <String, double>{};
  final names = <String, String>{};
  final uoms = <String, String>{};
  final order = <String>[];
  final seenBatches = <String>{};

  for (final a in preview.allocations) {
    for (final b in a.pool) {
      // One physical batch, however many lines can reach it.
      if (!seenBatches.add(drawKey(b.itemId, b.batchNo))) continue;
      if (!names.containsKey(b.itemId)) {
        names[b.itemId] = b.itemName.isNotEmpty ? b.itemName : a.inputItemName;
        uoms[b.itemId] = a.uom;
        order.add(b.itemId);
      }
      onHand[b.itemId] = (onHand[b.itemId] ?? 0) + b.qty;
      drawn[b.itemId] = (drawn[b.itemId] ?? 0) + drawnQty(drawCtls, b);
    }
  }

  return [
    for (final id in order)
      if ((drawn[id] ?? 0) > 0)
        ClosingStockRow(
          itemId: id,
          itemName: names[id]!,
          uom: uoms[id] ?? '',
          onHand: _round3(onHand[id] ?? 0),
          drawn: _round3(drawn[id] ?? 0),
        ),
  ];
}

/// Loss implied by a counted leftover. Blank means "not counted" — silence is
/// not a claim of zero wastage. More left than expected is not wastage but a
/// wrong consumed qty, so it never becomes a write-off.
double wastageFromLeft(ClosingStockRow row, String left) {
  final counted = double.tryParse(left.trim());
  if (counted == null) return 0;
  final diff = row.expectedLeft - counted;
  return diff > 0 ? _round3(diff) : 0;
}

double _round3(double v) => (v * 1000).roundToDouble() / 1000;

class RecordProductionWastage extends StatelessWidget {
  final ProductionPreview preview;

  /// Counted leftovers, keyed by inputItemId. Owned by the screen so the values
  /// survive rebuilds as the preview refreshes.
  final Map<String, TextEditingController> leftControllers;

  /// The typed draw — what this run actually takes off stock.
  final Map<String, TextEditingController> drawControllers;
  final TextEditingController notesCtl;
  final VoidCallback onChanged;

  const RecordProductionWastage({
    super.key,
    required this.preview,
    required this.leftControllers,
    required this.drawControllers,
    required this.notesCtl,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final rows = closingStockRows(preview, drawControllers);
    // Nothing drawn yet, nothing to count. The section appears as the operator
    // fills the draw boxes above.
    if (rows.isEmpty) return const SizedBox.shrink();

    return MfgCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(children: [
            Icon(Icons.delete_outline, size: 18, color: t.muted),
            const SizedBox(width: 8),
            Text('Closing stock', style: RunqText.bodyStrong.copyWith(color: t.ink)),
          ]),
          const SizedBox(height: 6),
          Text(
            'Count what is left of each input after the run. Anything short of the '
            'expected balance is written off and listed in the daily write-off '
            'register. Leave blank if you did not count.',
            style: RunqText.caption.copyWith(color: t.muted),
          ),
          const SizedBox(height: 12),
          for (final r in rows) ...[
            _WastageRow(
              row: r,
              controller: leftControllers.putIfAbsent(
                r.itemId,
                () => TextEditingController(),
              ),
              onChanged: onChanged,
            ),
            const SizedBox(height: 10),
          ],
          TextField(
            controller: notesCtl,
            textCapitalization: TextCapitalization.sentences,
            style: RunqText.body.copyWith(color: t.ink),
            decoration: InputDecoration(
              labelText: 'Reason (optional)',
              filled: true,
              fillColor: t.bgWarm,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: BorderSide(color: t.hairline),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _WastageRow extends StatelessWidget {
  final ClosingStockRow row;
  final TextEditingController controller;
  final VoidCallback onChanged;

  const _WastageRow({
    required this.row,
    required this.controller,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final expected = row.expectedLeft;
    final counted = double.tryParse(controller.text.trim());
    final wasted = wastageFromLeft(row, controller.text);
    final surplus = counted != null && counted - expected > 0.0001;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // The item names the row; "Left after run" names the number. Putting
        // that label inside the box collided with the unit suffix and read as
        // one word ("Leftlitre").
        Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(row.itemName,
                    style: RunqText.body.copyWith(color: t.ink), maxLines: 2),
                const SizedBox(height: 2),
                Text('Left after run',
                    style: RunqText.caption.copyWith(color: t.muted)),
              ],
            ),
          ),
          const SizedBox(width: 12),
          SizedBox(
            width: 132,
            child: TextField(
              controller: controller,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
              textAlign: TextAlign.right,
              style: RunqText.body.copyWith(color: t.ink),
              onChanged: (_) => onChanged(),
              decoration: InputDecoration(
                isDense: true,
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                hintText: '0',
                hintStyle: RunqText.body.copyWith(color: t.muted),
                suffixText: row.uom,
                suffixStyle: RunqText.caption.copyWith(color: t.muted),
                filled: true,
                fillColor: t.bgWarm,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: BorderSide(color: t.hairline),
                ),
              ),
            ),
          ),
        ]),
        const SizedBox(height: 4),
        Text(
          'Drew ${_trim(row.drawn)} of ${_trim(row.onHand)} ${row.uom} — '
          'expected balance ${_trim(expected)} ${row.uom}.',
          style: RunqText.caption.copyWith(color: t.muted),
        ),
        if (wasted > 0)
          Text(
            'Wastage ${_trim(wasted)} ${row.uom} — written off on top of '
            'what the run consumes.',
            style: RunqText.caption.copyWith(color: MfgColors.orangeAlert),
          ),
        if (surplus)
          Text(
            'More left than expected — the run used less than the BOM says. '
            'Correct the consumed qty instead.',
            style: RunqText.caption.copyWith(color: MfgColors.orangeAlert),
          ),
      ],
    );
  }
}

String _trim(double v) {
  final s = v.toStringAsFixed(3);
  return s.contains('.') ? s.replaceAll(RegExp(r'0+$'), '').replaceAll(RegExp(r'\.$'), '') : s;
}
