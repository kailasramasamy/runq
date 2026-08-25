// Backflushed consumption list + shortages + costing strip for the Record
// Production screen. Renders the server's FEFO-allocation preview: each
// input row shows what the BOM demands and which batches will cover it;
// shortages block the submit button (gated by the caller via `_canSubmit`).

library;

import 'package:flutter/material.dart';

import '../../api/manufacturing_models.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/mfg_colors.dart';
import 'widgets/mfg_primitives.dart';

class RecordProductionAllocList extends StatelessWidget {
  final ProductionPreview preview;
  final ValueChanged<ProductionAllocation> onEditLine;

  const RecordProductionAllocList({
    super.key,
    required this.preview,
    required this.onEditLine,
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
        _CostingStrip(preview: preview),
        const SizedBox(height: 12),
        Padding(
          padding: const EdgeInsets.fromLTRB(0, 8, 0, 8),
          child: Text('WILL CONSUME', style: RunqText.label),
        ),
        for (final a in preview.allocations)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 5),
            child: _AllocationRow(allocation: a, onTap: () => onEditLine(a)),
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
                '${s.inputItemName} — short ${_trim(s.shortQty)} ${s.uom} '
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
  const _CostingStrip({required this.preview});

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
          Expanded(
            child: _StripCell(
              label: 'Runs',
              value: _trim(preview.runs),
            ),
          ),
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
              value: mfgIndianINR(preview.estimatedInputValue, decimals: 2),
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

// ── Allocation row ───────────────────────────────────────────────────────────

/// One backflushed input, laid out as three bands: what it is, the three
/// numbers that matter (needed / on hand / left after), then the batches it
/// pulls from. Batches were chips in a Wrap before, which turned any line with
/// more than one batch into a block of text nobody reads on a plant floor.
class _AllocationRow extends StatelessWidget {
  final ProductionAllocation allocation;
  final VoidCallback onTap;
  const _AllocationRow({required this.allocation, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final short = !allocation.isOptional &&
        allocation.allocatedQty + 0.0001 < allocation.requiredQty;
    return Material(
      color: t.surface,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: short ? MfgColors.error.withValues(alpha: 0.4) : t.hairline,
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _Header(allocation: allocation),
              const SizedBox(height: 12),
              _MetricStrip(allocation: allocation),
              const SizedBox(height: 12),
              Divider(height: 1, thickness: 0.5, color: t.hairline),
              const SizedBox(height: 10),
              _Batches(allocation: allocation),
            ],
          ),
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.allocation});
  final ProductionAllocation allocation;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                allocation.inputItemName,
                style: RunqText.bodyStrong.copyWith(color: t.ink),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              // The line takes any of these, so its "in stock" counts them all.
              if (allocation.substitutes.isNotEmpty)
                Text(
                  'or ${allocation.substitutes.map((s) => s.itemName).join(' / ')}',
                  style: RunqText.micro.copyWith(color: t.muted),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
            ],
          ),
        ),
        if (allocation.isOptional) ...[
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: t.bgWarm,
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: t.hairline),
            ),
            child: Text('Optional', style: RunqText.micro.copyWith(color: t.muted)),
          ),
        ],
        const SizedBox(width: 4),
        Icon(Icons.chevron_right_rounded, size: 18, color: t.muted2),
      ],
    );
  }
}

/// Needed / on hand / left after, as one labelled band. "Left after" is the
/// figure that tells a technician whether the next run can go ahead, so it
/// carries the emphasis and turns red when the run empties the bin.
class _MetricStrip extends StatelessWidget {
  const _MetricStrip({required this.allocation});
  final ProductionAllocation allocation;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final a = allocation;
    final balance = a.availableQty - a.allocatedQty;
    final depleted = balance <= 0.0001;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: t.bgWarm,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          _Metric(label: 'Needs', value: '${_trim(a.requiredQty)} ${a.uom}'),
          _MetricDivider(),
          _Metric(label: 'In stock', value: '${_trim(a.availableQty)} ${a.uom}'),
          _MetricDivider(),
          _Metric(
            label: 'Left after',
            value: '${_trim(balance < 0 ? 0 : balance)} ${a.uom}',
            tone: depleted ? MfgColors.error : null,
          ),
        ],
      ),
    );
  }
}

class _Metric extends StatelessWidget {
  const _Metric({required this.label, required this.value, this.tone});
  final String label;
  final String value;
  final Color? tone;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label, style: RunqText.micro.copyWith(color: t.muted)),
          const SizedBox(height: 3),
          Text(
            value,
            style: RunqText.caption.copyWith(
              color: tone ?? t.ink,
              fontWeight: FontWeight.w700,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}

class _MetricDivider extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      width: 1,
      height: 26,
      color: RT(context).hairline,
      margin: const EdgeInsets.symmetric(horizontal: 10),
    );
  }
}

class _Batches extends StatelessWidget {
  const _Batches({required this.allocation});
  final ProductionAllocation allocation;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    if (allocation.batches.isEmpty) {
      return Text(
        allocation.isOptional ? 'Nothing on hand — skipped' : 'Nothing on hand',
        style: RunqText.caption.copyWith(color: t.muted),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('TAKING FROM', style: RunqText.micro.copyWith(color: t.muted2)),
        const SizedBox(height: 6),
        for (final b in allocation.batches)
          _BatchRow(
            batch: b,
            uom: allocation.uom,
            // Name the item only when the draw fell to a stand-in, or the row
            // reads as the line's own milk when it isn't.
            showItem: b.itemId.isNotEmpty && b.itemId != allocation.inputItemId,
          ),
      ],
    );
  }
}

/// One batch the run draws down: label left, quantity right. Full-width rows
/// stack cleanly however many batches FEFO picks.
class _BatchRow extends StatelessWidget {
  const _BatchRow({required this.batch, required this.uom, this.showItem = false});
  final ProductionAllocationBatch batch;
  final String uom;
  final bool showItem;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = MfgColors.brand(context);
    final labelled = batch.batchNo != null && batch.batchNo!.isNotEmpty;
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Icon(Icons.label_outline_rounded, size: 13, color: brand),
          ),
          const SizedBox(width: 7),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  showItem
                      ? '${batch.itemName} · ${labelled ? batch.batchNo! : 'No batch'}'
                      : (labelled ? batch.batchNo! : 'No batch'),
                  style: RunqText.caption.copyWith(
                    color: labelled ? t.ink : t.muted,
                    fontWeight: FontWeight.w600,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                if (batch.expiryDate != null)
                  Text('Expires ${mfgPrettyDate(batch.expiryDate!)}',
                      style: RunqText.micro.copyWith(color: t.muted)),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text('${_trim(batch.qty)} $uom',
              style: RunqText.caption.copyWith(color: t.ink, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}

String _trim(double v) => v == v.truncateToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(3);
