// WO Run Screen — Output tab.
// Lists recorded output rows with a FAB-style "Add output" button.
// Bottom sheet: batch no (optional), qty, expiry date (if trackBatches), notes.

library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/manufacturing_models.dart';
import '../../providers/manufacturing_providers.dart';
import '../../services/wo_run_queue.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_snack.dart';
import 'widgets/mfg_colors.dart';
import 'widgets/mfg_primitives.dart';

class WoRunOutputTab extends ConsumerWidget {
  final WorkOrder wo;
  final bool isEditable;
  final VoidCallback onMutated;

  const WoRunOutputTab({
    super.key,
    required this.wo,
    required this.isEditable,
    required this.onMutated,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final outputAsync = ref.watch(woOutputProvider(wo.id));

    return Stack(
      children: [
        outputAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(
            child: Text('Failed to load: $e', style: RunqText.body.copyWith(color: t.muted)),
          ),
          data: (rows) {
            if (rows.isEmpty && !isEditable) {
              return MfgEmptyState(
                icon: Icons.output_rounded,
                title: 'No output recorded',
              );
            }
            return ListView(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 120),
              children: [
                if (rows.isEmpty)
                  MfgEmptyState(
                    icon: Icons.output_rounded,
                    title: 'No output yet',
                    description: 'Tap "Add output" to record a finished-goods batch.',
                  )
                else
                  for (final row in rows)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: _OutputRowCard(
                        row: row,
                        woId: wo.id,
                        isEditable: isEditable,
                        onDeleted: onMutated,
                      ),
                    ),
              ],
            );
          },
        ),
        if (isEditable)
          Positioned(
            bottom: 16,
            right: 16,
            child: FloatingActionButton.extended(
              onPressed: () => _openOutputSheet(context),
              backgroundColor: MfgColors.rose,
              foregroundColor: Colors.white,
              icon: const Icon(Icons.add_rounded),
              label: const Text('Add output'),
            ),
          ),
      ],
    );
  }

  Future<void> _openOutputSheet(BuildContext context) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: RT(context).surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _OutputEntrySheet(wo: wo, onSubmitted: onMutated),
    );
  }
}

// ── Output entry bottom sheet ────────────────────────────────────────────────

class _OutputEntrySheet extends ConsumerStatefulWidget {
  final WorkOrder wo;
  final VoidCallback onSubmitted;

  const _OutputEntrySheet({required this.wo, required this.onSubmitted});

  @override
  ConsumerState<_OutputEntrySheet> createState() => _OutputEntrySheetState();
}

class _OutputEntrySheetState extends ConsumerState<_OutputEntrySheet> {
  final _batchCtl = TextEditingController();
  final _qtyCtl = TextEditingController();
  final _notesCtl = TextEditingController();
  DateTime? _expiryDate;
  bool _busy = false;

  @override
  void dispose() {
    _batchCtl.dispose();
    _qtyCtl.dispose();
    _notesCtl.dispose();
    super.dispose();
  }

  Future<void> _pickExpiry() async {
    // One `now` for both bounds — see the note on RecordProductionScreen's
    // picker. Opens on the current month rather than three months out.
    final today = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _expiryDate ?? today,
      firstDate: today,
      lastDate: DateTime(2100),
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: Theme.of(ctx).colorScheme.copyWith(primary: MfgColors.rose),
        ),
        child: child!,
      ),
    );
    if (picked != null && mounted) {
      setState(() => _expiryDate = picked);
    }
  }

  Future<void> _submit() async {
    final qty = double.tryParse(_qtyCtl.text.trim()) ?? 0;
    if (qty <= 0) {
      showRunqSnack(context, 'Enter a valid qty > 0', kind: SnackKind.error);
      return;
    }
    setState(() => _busy = true);
    try {
      final outcome = await manufacturingRepo.addOutput(
        widget.wo.id,
        outputItemId: widget.wo.outputItemId,
        batchNo: _batchCtl.text.trim().isEmpty ? null : _batchCtl.text.trim(),
        warehouseId: widget.wo.warehouseId,
        qty: qty,
        uom: widget.wo.outputUom,
        expiryDate: _expiryDate == null ? null : _isoDate(_expiryDate!),
        notes: _notesCtl.text.trim().isEmpty ? null : _notesCtl.text.trim(),
      );
      ref.invalidate(woOutputProvider(widget.wo.id));
      ref.invalidate(woPreviewProvider(widget.wo.id));
      if (mounted) {
        Navigator.pop(context);
        widget.onSubmitted();
        if (outcome == EnqueueOutcome.queued) {
          showRunqSnack(context, 'Saved offline — will sync when online', kind: SnackKind.info);
        }
      }
    } catch (e) {
      if (mounted) showRunqSnack(context, e.toString(), kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = MfgColors.brand(context);

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SingleChildScrollView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 36, height: 4,
                margin: const EdgeInsets.only(bottom: 16),
                decoration: BoxDecoration(color: t.hairline, borderRadius: BorderRadius.circular(2)),
              ),
            ),
            Text('Add Output', style: RunqText.h2.copyWith(color: t.ink)),
            const SizedBox(height: 4),
            Text(widget.wo.outputItemName, style: RunqText.caption.copyWith(color: t.muted)),
            const SizedBox(height: 16),
            // Batch no (optional — auto-generated by API if empty)
            TextField(
              controller: _batchCtl,
              textCapitalization: TextCapitalization.none,
              style: RunqText.body.copyWith(color: t.ink),
              decoration: InputDecoration(
                labelText: 'Batch no (optional — auto-generated if blank)',
                filled: true,
                fillColor: t.bgWarm,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: BorderSide(color: t.hairline),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: BorderSide(color: brand, width: 1.4),
                ),
              ),
            ),
            const SizedBox(height: 10),
            // Qty — big keypad-friendly
            TextField(
              controller: _qtyCtl,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              textCapitalization: TextCapitalization.none,
              inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'^\d*\.?\d*'))],
              style: RunqText.h2.copyWith(color: t.ink),
              decoration: InputDecoration(
                labelText: 'Qty (${widget.wo.outputUom})',
                filled: true,
                fillColor: t.bgWarm,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: BorderSide(color: t.hairline),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: BorderSide(color: brand, width: 1.4),
                ),
              ),
            ),
            const SizedBox(height: 10),
            // Expiry date picker
            InkWell(
              onTap: _pickExpiry,
              borderRadius: BorderRadius.circular(10),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                decoration: BoxDecoration(
                  color: t.bgWarm,
                  border: Border.all(color: t.hairline),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(
                  children: [
                    Icon(Icons.event_rounded, size: 18, color: t.muted),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        _expiryDate == null
                            ? 'Expiry date (optional)'
                            : 'Expires: ${mfgPrettyDate(_isoDate(_expiryDate!))}',
                        style: RunqText.body.copyWith(
                          color: _expiryDate == null ? t.muted : t.ink,
                        ),
                      ),
                    ),
                    if (_expiryDate != null)
                      GestureDetector(
                        onTap: () => setState(() => _expiryDate = null),
                        child: Icon(Icons.close_rounded, size: 18, color: t.muted),
                      ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 10),
            // Notes
            TextField(
              controller: _notesCtl,
              textCapitalization: TextCapitalization.sentences,
              maxLines: 2,
              style: RunqText.body.copyWith(color: t.ink),
              decoration: InputDecoration(
                labelText: 'Notes (optional)',
                filled: true,
                fillColor: t.bgWarm,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: BorderSide(color: t.hairline),
                ),
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: MfgPrimaryButton(
                label: 'Record Output',
                loading: _busy,
                onPressed: _busy ? null : _submit,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Output row card ──────────────────────────────────────────────────────────

class _OutputRowCard extends ConsumerStatefulWidget {
  final WoOutputRow row;
  final String woId;
  final bool isEditable;
  final VoidCallback onDeleted;

  const _OutputRowCard({
    required this.row,
    required this.woId,
    required this.isEditable,
    required this.onDeleted,
  });

  @override
  ConsumerState<_OutputRowCard> createState() => _OutputRowCardState();
}

class _OutputRowCardState extends ConsumerState<_OutputRowCard> {
  bool _busy = false;

  Future<void> _reverse() async {
    setState(() => _busy = true);
    try {
      await manufacturingRepo.deleteOutput(widget.woId, widget.row.id);
      ref.invalidate(woOutputProvider(widget.woId));
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

    return MfgCard(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 36, height: 36,
            decoration: BoxDecoration(
              color: MfgColors.successBg,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(Icons.output_rounded, color: MfgColors.success, size: 18),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text.rich(
                  TextSpan(children: [
                    TextSpan(
                      text: _qty(row.qty),
                      style: RunqText.bodyStrong.copyWith(color: t.ink),
                    ),
                    TextSpan(
                      text: '  ${row.uom}',
                      style: RunqText.caption.copyWith(color: t.muted),
                    ),
                  ]),
                ),
                const SizedBox(height: 3),
                Text(
                  row.expiryDate != null
                      ? 'Batch ${row.batchNo}  ·  exp ${mfgPrettyDate(row.expiryDate!)}'
                      : 'Batch ${row.batchNo}',
                  style: RunqText.caption.copyWith(color: t.muted),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                Text(
                  row.warehouseName,
                  style: RunqText.caption.copyWith(color: t.muted),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                row.value > 0 ? mfgIndianINR(row.value, decimals: 2) : '—',
                style: RunqText.bodyStrong.copyWith(
                  color: row.value > 0 ? t.ink : t.muted,
                ),
              ),
              if (row.unitCost > 0) ...[
                const SizedBox(height: 2),
                Text(
                  '@ ${mfgIndianINR(row.unitCost, decimals: 2)}/${row.uom}',
                  style: RunqText.caption.copyWith(color: t.muted),
                ),
              ],
              if (widget.isEditable)
                TextButton(
                  onPressed: _busy ? null : _reverse,
                  style: TextButton.styleFrom(
                    foregroundColor: MfgColors.error,
                    padding: EdgeInsets.zero,
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
        ],
      ),
    );
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

String _qty(double v) =>
    v == v.truncateToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(3);

String _isoDate(DateTime d) => d.toIso8601String().substring(0, 10);
