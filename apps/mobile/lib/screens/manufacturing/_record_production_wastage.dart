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
import '_record_production_alloc_list.dart' show drawnQty;
import 'widgets/mfg_colors.dart';
import 'widgets/mfg_primitives.dart';

/// What the books say should be left once the run draws its share.
///
/// Measured against the typed draw, not the server's own allocation — the
/// expected balance has to describe the run being posted, or the count below
/// writes off a difference that was never a loss.
double expectedLeftOf(
  ProductionAllocation a,
  Map<String, TextEditingController> drawCtls,
) =>
    a.availableQty - a.pool.fold<double>(0, (s, b) => s + drawnQty(drawCtls, b));

/// Loss implied by a counted leftover. Blank means "not counted" — silence is
/// not a claim of zero wastage. More left than expected is not wastage but a
/// wrong consumed qty, so it never becomes a write-off.
double wastageFromLeft(
  ProductionAllocation a,
  String left,
  Map<String, TextEditingController> drawCtls,
) {
  final counted = double.tryParse(left.trim());
  if (counted == null) return 0;
  final diff = expectedLeftOf(a, drawCtls) - counted;
  return diff > 0 ? diff : 0;
}

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
    if (preview.allocations.isEmpty) return const SizedBox.shrink();

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
          for (final a in preview.allocations) ...[
            _WastageRow(
              allocation: a,
              drawControllers: drawControllers,
              controller: leftControllers.putIfAbsent(
                a.inputItemId,
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
  final ProductionAllocation allocation;
  final Map<String, TextEditingController> drawControllers;
  final TextEditingController controller;
  final VoidCallback onChanged;

  const _WastageRow({
    required this.allocation,
    required this.drawControllers,
    required this.controller,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final expected = expectedLeftOf(allocation, drawControllers);
    final counted = double.tryParse(controller.text.trim());
    final wasted = wastageFromLeft(allocation, controller.text, drawControllers);
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
                Text(allocation.inputItemName,
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
                suffixText: allocation.uom,
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
          'Expected balance ${_trim(expected)} ${allocation.uom} after this run.',
          style: RunqText.caption.copyWith(color: t.muted),
        ),
        if (wasted > 0)
          Text(
            'Wastage ${_trim(wasted)} ${allocation.uom} — written off on top of '
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
