// Manual draw list for the Record Production screen: one row per batch the
// line can draw from, each with a qty box the operator fills in themselves.
//
// The boxes start empty on purpose. The server still works out a draw, but it
// sits behind the Suggest button rather than being pre-filled — a number nobody
// typed is how the books drift away from what is actually in the tank. Nothing
// posts until every line covers what the recipe needs (the caller gates that
// through `_canSubmit`); shortages block it outright. Drawing *more* than the
// recipe is allowed and expected — that variance is what the screen is for.

library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../api/manufacturing_models.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/mfg_colors.dart';
import 'widgets/mfg_primitives.dart';
import '../../utils/format_qty.dart';

/// Key for one batch's qty box. Batch numbers are unique per item, not across
/// items, so a substitute sharing a batch number cannot collide.
String drawKey(String itemId, String? batchNo) => '$itemId::${batchNo ?? ''}';

double drawnQty(Map<String, TextEditingController> ctls, InputPoolBatch b) {
  final v = double.tryParse(ctls[drawKey(b.itemId, b.batchNo)]?.text.trim() ?? '');
  return v != null && v > 0 ? v : 0;
}

/// What the operator has committed to this line so far.
double drawnTotal(Map<String, TextEditingController> ctls, ProductionAllocation a) =>
    _round3(a.pool.fold<double>(0, (s, b) => s + drawnQty(ctls, b)));

/// True when the line's boxes land exactly on the recipe. Drives the tally's
/// green tick — it says "textbook run", not "safe to post".
bool lineBalanced(Map<String, TextEditingController> ctls, ProductionAllocation a) {
  final drawn = drawnTotal(ctls, a);
  if (a.isOptional && drawn == 0) return true;
  return (a.requiredQty - drawn).abs() < 0.0005;
}

/// True once the line has drawn at least what the recipe asks for.
///
/// Deliberately not [lineBalanced]: a run that took more milk than the BOM
/// predicted is the ordinary case, and the whole point of recording actual
/// consumption is to capture that variance. Demanding an exact match made
/// Suggest the only input that could ever unlock Post. Over-draw stays flagged
/// in orange and is bounded by what is physically on hand — the server rejects
/// a draw bigger than the batch (`findOverdrawnBatches`).
///
/// Under-draw still blocks, because the server counts it as a shortage and
/// would 422 the post. An optional line left untouched was never required.
bool lineSatisfied(Map<String, TextEditingController> ctls, ProductionAllocation a) {
  final drawn = drawnTotal(ctls, a);
  if (a.isOptional && drawn == 0) return true;
  return drawn >= a.requiredQty - 0.0005;
}

double _round3(double v) => (v * 1000).roundToDouble() / 1000;

class RecordProductionAllocList extends StatelessWidget {
  final ProductionPreview preview;

  /// Qty boxes keyed by [drawKey]. Owned by the screen so entries survive the
  /// rebuilds that follow every preview refresh.
  final Map<String, TextEditingController> drawControllers;
  final VoidCallback onChanged;
  final ValueChanged<ProductionAllocation> onSuggest;

  const RecordProductionAllocList({
    super.key,
    required this.preview,
    required this.drawControllers,
    required this.onChanged,
    required this.onSuggest,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (preview.shortages.isNotEmpty) ...[
          _ShortageCard(shortages: preview.shortages),
          const SizedBox(height: 12),
        ],
        _CostingStrip(preview: preview, drawControllers: drawControllers),
        const SizedBox(height: 12),
        Padding(
          padding: const EdgeInsets.fromLTRB(0, 8, 0, 8),
          child: Text('WHAT WENT IN', style: RunqText.label),
        ),
        for (final a in preview.allocations)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 5),
            child: _DrawCard(
              allocation: a,
              drawControllers: drawControllers,
              onChanged: onChanged,
              onSuggest: () => onSuggest(a),
            ),
          ),
      ],
    );
  }
}

// ── Shortages — prominent, blocking ─────────────────────────────────────────

class _ShortageCard extends StatelessWidget {
  final List<ProductionShortage> shortages;
  const _ShortageCard({required this.shortages});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: MfgColors.errorBg,
        border: Border.all(color: MfgColors.error.withValues(alpha: 0.4)),
        borderRadius: BorderRadius.circular(RunqRadii.chip),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Icon(Icons.warning_amber_rounded, size: 18, color: MfgColors.error),
            const SizedBox(width: 8),
            Expanded(
              child: Text('Not enough stock to make this — can\'t submit',
                  style: RunqText.bodyStrong.copyWith(color: t.ink)),
            ),
          ]),
          const SizedBox(height: 8),
          for (final s in shortages)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                '${s.inputItemName} — short ${_trim(s.shortQty, s.uom)} ${s.uom} '
                '(need ${_trim(s.requiredQty)}, have ${_trim(s.availableQty)})',
                style: RunqText.caption.copyWith(color: MfgColors.error),
              ),
            ),
        ],
      ),
    );
  }
}

// ── Costing strip ────────────────────────────────────────────────────────────

class _CostingStrip extends StatelessWidget {
  final ProductionPreview preview;
  final Map<String, TextEditingController> drawControllers;
  const _CostingStrip({required this.preview, required this.drawControllers});

  /// Priced from the split the operator typed — that is what will post.
  double get _drawnValue {
    var total = 0.0;
    for (final a in preview.allocations) {
      for (final b in a.pool) {
        total += drawnQty(drawControllers, b) * b.unitCost;
      }
    }
    return total;
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: t.hairline),
      ),
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
      child: Row(
        children: [
          Expanded(child: _StripCell(label: 'Runs', value: _trim(preview.runs))),
          _StripDivider(),
          Expanded(
            child: _StripCell(
              label: 'Produces',
              value: '${_trim(preview.producedQty)} ${preview.outputUom}',
            ),
          ),
          _StripDivider(),
          Expanded(
            child: _StripCell(
              label: 'Est. input cost',
              value: mfgIndianINR(_drawnValue, decimals: 2),
            ),
          ),
        ],
      ),
    );
  }
}

class _StripCell extends StatelessWidget {
  final String label;
  final String value;
  const _StripCell({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(label, style: RunqText.caption.copyWith(color: t.muted)),
        const SizedBox(height: 2),
        Text(value,
            style: RunqText.bodyStrong.copyWith(color: t.ink),
            textAlign: TextAlign.center,
            maxLines: 2),
      ],
    );
  }
}

class _StripDivider extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
        width: 1, height: 32, color: t.hairline, margin: const EdgeInsets.symmetric(horizontal: 8));
  }
}

// ── One input line ───────────────────────────────────────────────────────────

class _DrawCard extends StatelessWidget {
  final ProductionAllocation allocation;
  final Map<String, TextEditingController> drawControllers;
  final VoidCallback onChanged;
  final VoidCallback onSuggest;

  const _DrawCard({
    required this.allocation,
    required this.drawControllers,
    required this.onChanged,
    required this.onSuggest,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final a = allocation;
    final drawn = drawnTotal(drawControllers, a);
    final balanced = lineBalanced(drawControllers, a);

    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: t.hairline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _Header(allocation: a, onSuggest: onSuggest),
          const SizedBox(height: 10),
          _Tally(allocation: a, drawn: drawn, balanced: balanced),
          const SizedBox(height: 10),
          Divider(height: 1, thickness: 0.5, color: t.hairline),
          const SizedBox(height: 8),
          if (a.pool.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Text('Nothing on hand.',
                  style: RunqText.caption.copyWith(color: t.muted)),
            )
          else
            for (final b in a.pool)
              _PoolRow(
                batch: b,
                uom: a.uom,
                showItem: b.itemId != a.inputItemId,
                controller: drawControllers.putIfAbsent(
                  drawKey(b.itemId, b.batchNo),
                  () => TextEditingController(),
                ),
                onChanged: onChanged,
              ),
          _Consequence(allocation: a, drawControllers: drawControllers),
        ],
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.allocation, required this.onSuggest});
  final ProductionAllocation allocation;
  final VoidCallback onSuggest;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(allocation.inputItemName,
                  style: RunqText.bodyStrong.copyWith(color: t.ink),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis),
              // The line takes any of these, so its pool holds them all.
              if (allocation.substitutes.isNotEmpty)
                Text('or ${allocation.substitutes.map((s) => s.itemName).join(' / ')}',
                    style: RunqText.micro.copyWith(color: t.muted),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis),
            ],
          ),
        ),
        const SizedBox(width: 8),
        TextButton.icon(
          onPressed: onSuggest,
          icon: const Icon(Icons.auto_fix_high_rounded, size: 16),
          label: Text('Suggest', style: RunqText.caption),
          style: TextButton.styleFrom(
            foregroundColor: MfgColors.brand(context),
            padding: const EdgeInsets.symmetric(horizontal: 8),
            minimumSize: const Size(0, 32),
            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
          ),
        ),
      ],
    );
  }
}

/// Needed against entered — the one number that decides whether Post unlocks.
class _Tally extends StatelessWidget {
  const _Tally({required this.allocation, required this.drawn, required this.balanced});
  final ProductionAllocation allocation;
  final double drawn;
  final bool balanced;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final a = allocation;
    final gap = _round3(a.requiredQty - drawn);
    final tone = balanced
        ? MfgColors.success
        : drawn > 0
            ? MfgColors.orangeAlert
            : t.muted;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(color: t.bgWarm, borderRadius: BorderRadius.circular(10)),
      child: Row(children: [
        Expanded(
          child: Text('Needs ${_trim(a.requiredQty, a.uom)} ${a.uom}',
              style: RunqText.caption.copyWith(color: t.muted)),
        ),
        Text(
          balanced
              ? '${_trim(drawn)} ${a.uom} ✓'
              : drawn > 0
                  ? '${_trim(drawn)} ${a.uom} — ${gap > 0 ? 'short ${_trim(gap)}' : 'over ${_trim(-gap)}'}'
                  : 'nothing entered',
          style: RunqText.caption.copyWith(color: tone, fontWeight: FontWeight.w600),
        ),
      ]),
    );
  }
}

class _PoolRow extends StatelessWidget {
  final InputPoolBatch batch;
  final String uom;

  /// True when the batch came from a substitute — say which, or the row lies.
  final bool showItem;
  final TextEditingController controller;
  final VoidCallback onChanged;

  const _PoolRow({
    required this.batch,
    required this.uom,
    required this.showItem,
    required this.controller,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final entered = double.tryParse(controller.text.trim()) ?? 0;
    final over = entered > batch.qty + 0.0005;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                showItem
                    ? batch.itemName
                    : (batch.batchNo?.isNotEmpty == true ? batch.batchNo! : 'No batch'),
                style: RunqText.body.copyWith(color: t.ink),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 2),
              Text(
                [
                  if (showItem && batch.batchNo?.isNotEmpty == true) batch.batchNo!,
                  '${_trim(batch.qty)} $uom on hand',
                  batch.expiryDate == null ? 'no expiry' : 'exp ${batch.expiryDate}',
                ].join(' · '),
                style: RunqText.caption.copyWith(
                  color: over ? MfgColors.error : t.muted,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
        const SizedBox(width: 10),
        SizedBox(
          width: 110,
          child: TextField(
            controller: controller,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
            textAlign: TextAlign.right,
            style: RunqText.body.copyWith(color: t.ink),
            onChanged: (_) => onChanged(),
            decoration: InputDecoration(
              isDense: true,
              contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
              hintText: '0',
              hintStyle: RunqText.body.copyWith(color: t.muted),
              suffixText: uom,
              suffixStyle: RunqText.caption.copyWith(color: t.muted),
              filled: true,
              fillColor: t.bgWarm,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: BorderSide(color: over ? MfgColors.error : t.hairline),
              ),
            ),
          ),
        ),
      ]),
    );
  }
}

/// What the entered split leaves behind. The split itself is already on screen;
/// what changes a decision is the remnant — 3 L expiring tomorrow is a reason
/// to draw differently, 565 L of fresh stock is not.
class _Consequence extends StatelessWidget {
  const _Consequence({required this.allocation, required this.drawControllers});
  final ProductionAllocation allocation;
  final Map<String, TextEditingController> drawControllers;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    if (drawnTotal(drawControllers, allocation) <= 0) return const SizedBox.shrink();

    // Only stock the run actually opened counts — untouched batches were never
    // part of this decision.
    final opened = allocation.pool.where((b) => drawnQty(drawControllers, b) > 0).toList();
    final remnants = opened
        .map((b) => (b: b, left: _round3(b.qty - drawnQty(drawControllers, b))))
        .where((r) => r.left > 0.0005)
        .toList();

    final String message;
    final Color tone;
    if (remnants.isEmpty) {
      message = 'Drains ${opened.length} '
          '${opened.length == 1 ? 'batch' : 'batches'} — nothing left part-used.';
      tone = MfgColors.success;
    } else {
      final parts = remnants
          .map((r) => '${_trim(r.left)} ${allocation.uom} ${r.b.itemName}')
          .join(', ');
      final soonest = remnants
          .where((r) => r.b.expiryDate != null)
          .fold<String?>(null, (acc, r) =>
              acc == null || r.b.expiryDate!.compareTo(acc) < 0 ? r.b.expiryDate : acc);
      message = 'Leaves $parts'
          '${soonest != null ? ' — expires $soonest' : ''}'
          '${remnants.length > 1 ? ' (${remnants.length} part-used batches)' : ''}';
      tone = remnants.length > 1 ? MfgColors.orangeAlert : t.muted;
    }

    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Text(message, style: RunqText.caption.copyWith(color: tone)),
    );
  }
}

String _trim(double v, [String? unit]) => formatItemQty(v, null, unit: unit);
