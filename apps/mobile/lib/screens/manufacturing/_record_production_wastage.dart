// Closing-stock step on the Record Production screen — the operator counts what
// is physically left in each batch the run drew from, and the wastage falls out
// of the arithmetic: (batch before − consumed) − actually left.
//
// Asking for the leftover rather than the loss matches what someone on the floor
// can see: the tank held 107 L, the recipe costs the run 98.5 L, 6 L is still in
// the tank. The 2.5 L that vanished is our sum to do, not theirs.
//
// Posted as a production_loss write-off tied to the run, not as extra
// consumption, so the loss shows up in the daily write-off register instead of
// vanishing into the finished goods' unit cost.

library;

import 'package:flutter/material.dart';

import '../../api/manufacturing_models.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '_record_production_alloc_list.dart' show drawKey, drawnQty, oneDecimalFormatter;
import 'widgets/mfg_colors.dart';
import 'widgets/mfg_primitives.dart';

/// One batch the run actually drew from, and what should be left in it.
///
/// Per *batch*, never per item and never per BOM line, because the count the
/// floor can actually make is of the container in front of them. A packing run
/// that deliberately worked the fresh 107 L consignment and never touched the
/// old 7.4 L one has one thing to count: what is left of the 107. Balancing the
/// count against the item's whole 114.4 L made the operator responsible for
/// milk the run never opened, and any slip wrote that good milk off as
/// production loss. The same reasoning rules out per-line rows: a line that
/// accepts substitutes pools three milks, and an untouched stand-in has no
/// leftover to count.
class ClosingStockRow {
  final String itemId;
  final String itemName;
  final String? batchNo;
  final String uom;

  /// In this batch before the run.
  final double onHand;

  /// What the operator typed against this batch.
  final double drawn;

  const ClosingStockRow({
    required this.itemId,
    required this.itemName,
    required this.batchNo,
    required this.uom,
    required this.onHand,
    required this.drawn,
  });

  /// Identifies both the qty box above and this row's own count controller.
  String get key => drawKey(itemId, batchNo);

  /// What the books say should be left once the run takes its share.
  double get expectedLeft => _round3(onHand - drawn);
}

/// The batches this run drew from, in pool order.
///
/// Only batches with a typed draw get a row: stock the run never opened cannot
/// have been wasted, and offering a count for it is what invited the bad
/// write-off. De-duplicated across lines, so a batch feeding two lines is
/// counted once and nets both draws.
List<ClosingStockRow> closingStockRows(
  ProductionPreview preview,
  Map<String, TextEditingController> drawCtls,
) {
  final rows = <String, ClosingStockRow>{};

  for (final a in preview.allocations) {
    for (final b in a.pool) {
      final drawn = drawnQty(drawCtls, b);
      if (drawn <= 0) continue;
      final key = drawKey(b.itemId, b.batchNo);
      // One physical batch, however many lines can reach it.
      final prior = rows[key];
      rows[key] = ClosingStockRow(
        itemId: b.itemId,
        itemName: b.itemName.isNotEmpty ? b.itemName : a.inputItemName,
        batchNo: b.batchNo,
        uom: a.uom,
        onHand: _round3(b.qty),
        drawn: _round3((prior?.drawn ?? 0) + drawn),
      );
    }
  }

  return rows.values.toList();
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
            'Count what is left in each batch the run drew from. Anything short '
            'of the expected balance is written off and listed in the daily '
            'write-off register. Leave blank if you did not count.',
            style: RunqText.caption.copyWith(color: t.muted),
          ),
          const SizedBox(height: 12),
          for (final r in rows) ...[
            _WastageRow(
              row: r,
              controller: leftControllers.putIfAbsent(
                r.key,
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
            flex: 6,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(row.itemName,
                    style: RunqText.body.copyWith(color: t.ink), maxLines: 2),
                const SizedBox(height: 2),
                Text(
                  'Left in ${row.batchNo?.isNotEmpty == true ? row.batchNo! : 'stock'} '
                  'after run',
                  style: RunqText.caption.copyWith(color: t.muted),
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          // Same proportional box as the draw rows — a counted leftover can run
          // to four figures too.
          Expanded(
            flex: 4,
            child: TextField(
              controller: controller,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              inputFormatters: [oneDecimalFormatter],
              textAlign: TextAlign.right,
              style: RunqText.body.copyWith(color: t.ink),
              onChanged: (_) => onChanged(),
              decoration: InputDecoration(
                isDense: true,
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
                hintText: '0',
                hintStyle: RunqText.body.copyWith(color: t.muted),
                suffixText: row.uom,
                suffixStyle: RunqText.micro.copyWith(color: t.muted),
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
          'Drew ${_trim(row.drawn)} of this batch\'s ${_trim(row.onHand)} '
          '${row.uom} — expected balance ${_trim(expected)} ${row.uom}.',
          style: RunqText.caption.copyWith(color: t.muted),
        ),
        if (wasted > 0)
          Text(
            'Wastage ${_trim(wasted)} ${row.uom} — written off against this '
            'batch, on top of what the run consumes.',
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
