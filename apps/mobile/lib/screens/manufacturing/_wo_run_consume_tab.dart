// WO Run Screen — Consume tab.
// Per-BOM-line collapsible cards + ad-hoc consumption tile.
// Bottom sheet: scan barcode OR pick suggested batch → qty → notes → submit.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/manufacturing_models.dart';
import '../../providers/manufacturing_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_snack.dart';
import '_wo_run_adhoc_sheet.dart';
import '_wo_run_entry_sheet.dart';
import 'widgets/mfg_colors.dart';
import 'widgets/mfg_primitives.dart';
import '../../utils/format_qty.dart';

class WoRunConsumeTab extends ConsumerStatefulWidget {
  final WorkOrder wo;
  final bool isEditable;
  final VoidCallback onMutated;

  const WoRunConsumeTab({
    super.key,
    required this.wo,
    required this.isEditable,
    required this.onMutated,
  });

  @override
  ConsumerState<WoRunConsumeTab> createState() => _WoRunConsumeTabState();
}

class _WoRunConsumeTabState extends ConsumerState<WoRunConsumeTab> {
  final Set<String> _expanded = {};

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final consumptionAsync = ref.watch(woConsumptionProvider(widget.wo.id));

    return consumptionAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(
        child: Text('Failed to load: $e', style: RunqText.body.copyWith(color: t.muted)),
      ),
      data: (rows) => ListView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
        children: [
          // BOM lines
          for (final line in widget.wo.expectedLines) ...[
            _BomLineCard(
              line: line,
              plannedQty: widget.wo.plannedQty,
              warehouseId: widget.wo.warehouseId,
              woId: widget.wo.id,
              consumedRows: rows.where((r) => r.bomLineId == line.bomLineId).toList(),
              isExpanded: _expanded.contains(line.bomLineId),
              isEditable: widget.isEditable,
              onToggle: () => setState(() {
                if (_expanded.contains(line.bomLineId)) {
                  _expanded.remove(line.bomLineId);
                } else {
                  _expanded.add(line.bomLineId);
                }
              }),
              onMutated: widget.onMutated,
            ),
            const SizedBox(height: 10),
          ],
          // Ad-hoc tile
          if (widget.isEditable)
            WoRunAdHocTile(wo: widget.wo, onMutated: widget.onMutated),
          if (!widget.isEditable && rows.isEmpty)
            MfgEmptyState(
              icon: Icons.inventory_2_outlined,
              title: 'No consumption recorded',
              description: 'This WO is not in a runnable state.',
            ),
        ],
      ),
    );
  }
}

// ── BOM Line Card ────────────────────────────────────────────────────────────

class _BomLineCard extends ConsumerWidget {
  final WorkOrderExpectedLine line;
  final double plannedQty;
  final String warehouseId;
  final String woId;
  final List<WoConsumptionRow> consumedRows;
  final bool isExpanded;
  final bool isEditable;
  final VoidCallback onToggle;
  final VoidCallback onMutated;

  const _BomLineCard({
    required this.line,
    required this.plannedQty,
    required this.warehouseId,
    required this.woId,
    required this.consumedRows,
    required this.isExpanded,
    required this.isEditable,
    required this.onToggle,
    required this.onMutated,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final expected = line.expectedQty(plannedQty);
    final actualSoFar = consumedRows.fold<double>(0, (s, r) => s + r.qty);
    final actualValue = consumedRows.fold<double>(0, (s, r) => s + r.value);
    final isOver = actualSoFar > expected;
    final excessQty = isOver ? actualSoFar - expected : 0.0;
    final avgUnitCost = actualSoFar > 0 ? actualValue / actualSoFar : 0.0;
    final excessValue = excessQty * avgUnitCost;

    return MfgCard(
      padding: const EdgeInsets.all(0),
      child: Column(
        children: [
          // Header row — always visible
          InkWell(
            onTap: onToggle,
            borderRadius: BorderRadius.circular(14),
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(line.inputItemName,
                            style: RunqText.bodyStrong.copyWith(color: t.ink)),
                        const SizedBox(height: 3),
                        Text(
                          'Expected: ${_qty(expected, line.inputUom)} ${line.inputUom}'
                          '${line.scrapPct > 0 ? '  +${line.scrapPct.toStringAsFixed(1)}% scrap' : ''}',
                          style: RunqText.caption.copyWith(color: t.muted),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        '${_qty(actualSoFar, line.inputUom)} ${line.inputUom}',
                        style: RunqText.bodyStrong.copyWith(
                          color: isOver ? MfgColors.error : MfgColors.success,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text('recorded', style: RunqText.caption.copyWith(color: t.muted)),
                    ],
                  ),
                  const SizedBox(width: 4),
                  Icon(
                    isExpanded
                        ? Icons.keyboard_arrow_up_rounded
                        : Icons.keyboard_arrow_down_rounded,
                    size: 20,
                    color: t.muted,
                  ),
                ],
              ),
            ),
          ),
          // Excess vs. expected — amber strip when over-consumed
          if (isOver)
            Container(
              margin: const EdgeInsets.fromLTRB(12, 0, 12, 12),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                color: MfgColors.orangeAlertBg,
                border: Border.all(color: MfgColors.orangeAlert.withValues(alpha: 0.35)),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  Icon(Icons.warning_amber_rounded,
                      size: 14, color: MfgColors.orangeAlert),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      'Excess vs. expected',
                      style: RunqText.caption.copyWith(
                        color: MfgColors.orangeAlert,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  Text(
                    '+${_qty(excessQty, line.inputUom)} ${line.inputUom}  ·  ${mfgIndianINR(excessValue, decimals: 2)} loss',
                    style: RunqText.caption.copyWith(
                      color: MfgColors.orangeAlert,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          // Expanded section
          AnimatedSize(
            duration: const Duration(milliseconds: 200),
            curve: Curves.easeOut,
            alignment: Alignment.topCenter,
            child: isExpanded
                ? Column(
                    children: [
                      Divider(height: 1, color: t.hairline),
                      // Recorded rows
                      for (final row in consumedRows)
                        _ConsumedRowTile(
                          row: row,
                          woId: woId,
                          isEditable: isEditable,
                          onDeleted: onMutated,
                        ),
                      // Action row
                      if (isEditable)
                        _LineActionRow(
                          line: line,
                          woId: woId,
                          warehouseId: warehouseId,
                          requiredQty: expected - actualSoFar,
                          onMutated: onMutated,
                        ),
                    ],
                  )
                : const SizedBox.shrink(),
          ),
        ],
      ),
    );
  }
}

// ── Line action row (scan / pick / enter) ───────────────────────────────────

class _LineActionRow extends StatelessWidget {
  final WorkOrderExpectedLine line;
  final String woId;
  final String warehouseId;
  final double requiredQty;
  final VoidCallback onMutated;

  const _LineActionRow({
    required this.line,
    required this.woId,
    required this.warehouseId,
    required this.requiredQty,
    required this.onMutated,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
      child: Row(
        children: [
          Expanded(
            child: OutlinedButton.icon(
              onPressed: () => _openBatchSheet(
                context,
                mode: WoEntryMode.scan,
              ),
              icon: const Icon(Icons.qr_code_scanner_rounded, size: 16),
              label: const Text('Scan'),
              style: OutlinedButton.styleFrom(
                foregroundColor: MfgColors.brand(context),
                side: BorderSide(color: t.hairline),
                padding: const EdgeInsets.symmetric(vertical: 10),
              ),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: OutlinedButton.icon(
              onPressed: () => _openBatchSheet(
                context,
                mode: WoEntryMode.pick,
              ),
              icon: const Icon(Icons.list_alt_rounded, size: 16),
              label: const Text('Pick'),
              style: OutlinedButton.styleFrom(
                foregroundColor: MfgColors.brand(context),
                side: BorderSide(color: t.hairline),
                padding: const EdgeInsets.symmetric(vertical: 10),
              ),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: OutlinedButton.icon(
              onPressed: () => _openBatchSheet(
                context,
                mode: WoEntryMode.manual,
              ),
              icon: const Icon(Icons.edit_outlined, size: 16),
              label: const Text('Enter'),
              style: OutlinedButton.styleFrom(
                foregroundColor: MfgColors.brand(context),
                side: BorderSide(color: t.hairline),
                padding: const EdgeInsets.symmetric(vertical: 10),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _openBatchSheet(BuildContext context, {required WoEntryMode mode}) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: RT(context).surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => WoRunConsumeEntrySheet(
        woId: woId,
        bomLineId: line.bomLineId,
        inputItemId: line.inputItemId,
        inputItemName: line.inputItemName,
        warehouseId: warehouseId,
        uom: line.inputUom,
        suggestedQty: requiredQty > 0 ? requiredQty : null,
        initialMode: mode,
        onSubmitted: onMutated,
      ),
    );
  }
}

// ── Recorded consumption row tile ─────────────────────────────────────────────

class _ConsumedRowTile extends ConsumerStatefulWidget {
  final WoConsumptionRow row;
  final String woId;
  final bool isEditable;
  final VoidCallback onDeleted;

  const _ConsumedRowTile({
    required this.row,
    required this.woId,
    required this.isEditable,
    required this.onDeleted,
  });

  @override
  ConsumerState<_ConsumedRowTile> createState() => _ConsumedRowTileState();
}

class _ConsumedRowTileState extends ConsumerState<_ConsumedRowTile> {
  bool _busy = false;

  Future<void> _reverse() async {
    setState(() => _busy = true);
    try {
      await manufacturingRepo.deleteConsumption(widget.woId, widget.row.id);
      ref.invalidate(woConsumptionProvider(widget.woId));
      ref.invalidate(woPreviewProvider(widget.woId));
      widget.onDeleted();
    } catch (e) {
      if (mounted) showRunqSnack(context, e.toString(), kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final row = widget.row;
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Left — qty (prominent) + batch / warehouse (muted)
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text.rich(
                  TextSpan(children: [
                    TextSpan(
                      text: _qty(row.qty, row.uom),
                      style: RunqText.bodyStrong.copyWith(color: t.ink),
                    ),
                    TextSpan(
                      text: '  ${row.uom}',
                      style: RunqText.caption.copyWith(color: t.muted),
                    ),
                  ]),
                ),
                const SizedBox(height: 2),
                Text(
                  row.batchNo != null
                      ? 'Batch ${row.batchNo}  ·  ${row.warehouseName}'
                      : row.warehouseName,
                  style: RunqText.caption.copyWith(color: t.muted),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          // Right — value + unit cost
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                mfgIndianINR(row.value, decimals: 2),
                style: RunqText.bodyStrong.copyWith(color: t.ink),
              ),
              if (row.unitCost > 0) ...[
                const SizedBox(height: 2),
                Text(
                  '@ ${mfgIndianINR(row.unitCost, decimals: 2)}/${row.uom}',
                  style: RunqText.caption.copyWith(color: t.muted),
                ),
              ],
            ],
          ),
          if (widget.isEditable)
            TextButton(
              onPressed: _busy ? null : _reverse,
              style: TextButton.styleFrom(
                foregroundColor: MfgColors.error,
                padding: const EdgeInsets.symmetric(horizontal: 8),
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              child: _busy
                  ? const SizedBox(
                      width: 14, height: 14,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Reverse'),
            ),
        ],
      ),
    );
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

String _qty(double v, [String? unit]) => formatItemQty(v, null, unit: unit);
