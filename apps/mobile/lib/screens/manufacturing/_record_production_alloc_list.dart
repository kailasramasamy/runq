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
        MfgSectionHeader(label: 'Will consume'),
        for (final a in preview.allocations)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
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
      margin: const EdgeInsets.symmetric(horizontal: 16),
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
      margin: const EdgeInsets.symmetric(horizontal: 16),
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

// ── Allocation row ────────────────────────────────────────────────────────────

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
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: short ? MfgColors.error.withValues(alpha: 0.4) : t.hairline),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      allocation.isOptional
                          ? '${allocation.inputItemName} · optional'
                          : allocation.inputItemName,
                      style: RunqText.bodyStrong.copyWith(color: t.ink),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text('${_trim(allocation.requiredQty)} ${allocation.uom}',
                      style: RunqText.body.copyWith(color: t.ink, fontWeight: FontWeight.w700)),
                  const SizedBox(width: 4),
                  Icon(Icons.chevron_right_rounded, size: 18, color: t.muted2),
                ],
              ),
              const SizedBox(height: 4),
              _StockBalanceLine(allocation: allocation),
              const SizedBox(height: 6),
              if (allocation.batches.isEmpty)
                Text(
                  allocation.isOptional ? 'Nothing on hand — skipped' : 'Nothing on hand',
                  style: RunqText.caption.copyWith(color: t.muted),
                )
              else
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    for (final b in allocation.batches) _BatchChip(batch: b, uom: allocation.uom),
                  ],
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Raw-material balance for one input: what is on hand now, and what will be
/// left once this run consumes its share. The "left" figure is what tells a
/// technician whether the next run can go ahead, so it carries the emphasis.
class _StockBalanceLine extends StatelessWidget {
  final ProductionAllocation allocation;
  const _StockBalanceLine({required this.allocation});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final balance = allocation.availableQty - allocation.allocatedQty;
    final depleted = balance <= 0.0001;

    return Row(
      children: [
        Icon(Icons.inventory_2_outlined, size: 12, color: t.muted2),
        const SizedBox(width: 5),
        Expanded(
          child: RichText(
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            text: TextSpan(
              style: RunqText.caption.copyWith(color: t.muted),
              children: [
                TextSpan(text: 'In stock ${_trim(allocation.availableQty)} ${allocation.uom}'),
                const TextSpan(text: '  ·  balance after '),
                TextSpan(
                  text: '${_trim(balance < 0 ? 0 : balance)} ${allocation.uom}',
                  style: RunqText.caption.copyWith(
                    color: depleted ? MfgColors.error : t.ink,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _BatchChip extends StatelessWidget {
  final ProductionAllocationBatch batch;
  final String uom;
  const _BatchChip({required this.batch, required this.uom});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = MfgColors.brand(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: MfgColors.roseSubtle,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: MfgColors.roseHairline),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.label_outline_rounded, size: 12, color: brand),
          const SizedBox(width: 4),
          Text(
            batch.batchNo == null || batch.batchNo!.isEmpty ? 'No batch' : batch.batchNo!,
            style: RunqText.caption.copyWith(color: brand, fontWeight: FontWeight.w600),
          ),
          const SizedBox(width: 6),
          Text('${_trim(batch.qty)} $uom', style: RunqText.caption.copyWith(color: t.ink)),
          if (batch.expiryDate != null) ...[
            const SizedBox(width: 6),
            Text('exp ${mfgPrettyDate(batch.expiryDate!)}',
                style: RunqText.caption.copyWith(color: t.muted)),
          ],
        ],
      ),
    );
  }
}

String _trim(double v) => v == v.truncateToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(3);
