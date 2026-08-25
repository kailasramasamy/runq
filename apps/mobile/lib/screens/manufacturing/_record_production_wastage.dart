// Wastage step on the Record Production screen — input material drawn for the
// run that never reached output (fill variation, line residue, spillage).
//
// Posted as a production_loss write-off tied to the run, not as extra
// consumption, so the loss shows up in the daily write-off register instead of
// vanishing into the finished goods' unit cost.
//
// The BOM's scrap % is already inside the "will consume" figures, so anything
// entered here comes off stock on top of that — the per-row hint says so, since
// on a plant floor it is otherwise easy to write the same loss off twice.

library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../api/manufacturing_models.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/mfg_colors.dart';
import 'widgets/mfg_primitives.dart';

class RecordProductionWastage extends StatelessWidget {
  final ProductionPreview preview;

  /// Keyed by inputItemId. Owned by the screen so the values survive rebuilds
  /// as the preview refreshes.
  final Map<String, TextEditingController> qtyControllers;
  final TextEditingController notesCtl;
  final VoidCallback onChanged;

  const RecordProductionWastage({
    super.key,
    required this.preview,
    required this.qtyControllers,
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
            Text('Wastage (optional)', style: RunqText.bodyStrong.copyWith(color: t.ink)),
          ]),
          const SizedBox(height: 6),
          Text(
            'Material drawn for this run that did not reach output. '
            'Written off and listed in the daily write-off register.',
            style: RunqText.caption.copyWith(color: t.muted),
          ),
          const SizedBox(height: 12),
          for (final a in preview.allocations) ...[
            _WastageRow(
              allocation: a,
              controller: qtyControllers.putIfAbsent(
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
  final TextEditingController controller;
  final VoidCallback onChanged;

  const _WastageRow({
    required this.allocation,
    required this.controller,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final consumed = allocation.batches.fold<double>(0, (s, b) => s + b.qty);
    final wasted = double.tryParse(controller.text.trim()) ?? 0;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(children: [
          Expanded(
            child: Text(allocation.inputItemName,
                style: RunqText.body.copyWith(color: t.ink), maxLines: 2),
          ),
          const SizedBox(width: 10),
          SizedBox(
            width: 120,
            child: TextField(
              controller: controller,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
              textAlign: TextAlign.right,
              style: RunqText.body.copyWith(color: t.ink),
              onChanged: (_) => onChanged(),
              decoration: InputDecoration(
                isDense: true,
                hintText: '0',
                suffixText: allocation.uom,
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
          wasted > 0
              ? 'Run draws ${_trim(consumed)} ${allocation.uom} — with wastage, '
                  '${_trim(consumed + wasted)} ${allocation.uom} comes off stock.'
              : 'Run draws ${_trim(consumed)} ${allocation.uom} (BOM allowance included).',
          style: RunqText.caption.copyWith(
            color: wasted > 0 ? MfgColors.orangeAlert : t.muted,
          ),
        ),
      ],
    );
  }
}

String _trim(double v) {
  final s = v.toStringAsFixed(3);
  return s.contains('.') ? s.replaceAll(RegExp(r'0+$'), '').replaceAll(RegExp(r'\.$'), '') : s;
}
