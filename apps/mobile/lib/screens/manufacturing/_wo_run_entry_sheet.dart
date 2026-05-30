// Consumption entry bottom sheet — scan / pick FEFO batch / manual entry.
// Used by _wo_run_consume_tab.dart for per-BOM-line posting.

library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../providers/manufacturing_providers.dart';
import '../../services/wo_run_queue.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_snack.dart';
import 'widgets/mfg_colors.dart';
import 'widgets/mfg_primitives.dart';

enum WoEntryMode { scan, pick, manual }

/// Bottom sheet for recording consumption of one BOM line.
class WoRunConsumeEntrySheet extends ConsumerStatefulWidget {
  final String woId;
  final String? bomLineId;
  final String inputItemId;
  final String inputItemName;
  final String warehouseId;
  final String uom;
  final double? suggestedQty;
  final WoEntryMode initialMode;
  final VoidCallback onSubmitted;

  const WoRunConsumeEntrySheet({
    super.key,
    required this.woId,
    required this.bomLineId,
    required this.inputItemId,
    required this.inputItemName,
    required this.warehouseId,
    required this.uom,
    required this.initialMode,
    required this.onSubmitted,
    this.suggestedQty,
  });

  @override
  ConsumerState<WoRunConsumeEntrySheet> createState() => _State();
}

class _State extends ConsumerState<WoRunConsumeEntrySheet> {
  final _batchCtl = TextEditingController();
  final _qtyCtl = TextEditingController();
  final _notesCtl = TextEditingController();
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    if ((widget.suggestedQty ?? 0) > 0) {
      _qtyCtl.text = _fmtQty(widget.suggestedQty!);
    }
    if (widget.initialMode == WoEntryMode.scan) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _scanBarcode());
    }
  }

  @override
  void dispose() {
    _batchCtl.dispose();
    _qtyCtl.dispose();
    _notesCtl.dispose();
    super.dispose();
  }

  Future<void> _scanBarcode() async {
    final scanned = await showDialog<String>(
      context: context,
      builder: (ctx) {
        final ctrl = TextEditingController();
        return AlertDialog(
          title: const Text('Scan Batch Barcode'),
          content: TextField(
            controller: ctrl,
            autofocus: true,
            textCapitalization: TextCapitalization.none,
            decoration: const InputDecoration(labelText: 'Batch no (scan or type)'),
            onSubmitted: (v) => Navigator.pop(ctx, v.trim()),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
            TextButton(
              onPressed: () => Navigator.pop(ctx, ctrl.text.trim()),
              child: const Text('OK'),
            ),
          ],
        );
      },
    );
    if (scanned != null && scanned.isNotEmpty && mounted) {
      setState(() => _batchCtl.text = scanned);
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
      final outcome = await manufacturingRepo.addConsumption(
        widget.woId,
        bomLineId: widget.bomLineId,
        inputItemId: widget.inputItemId,
        batchNo: _batchCtl.text.trim().isEmpty ? null : _batchCtl.text.trim(),
        warehouseId: widget.warehouseId,
        qty: qty,
        uom: widget.uom,
        notes: _notesCtl.text.trim().isEmpty ? null : _notesCtl.text.trim(),
      );
      ref.invalidate(woConsumptionProvider(widget.woId));
      ref.invalidate(woPreviewProvider(widget.woId));
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
    final sugBatchAsync = ref.watch(
      suggestedBatchesProvider(SuggestedBatchesParams(
        woId: widget.woId,
        inputItemId: widget.inputItemId,
        warehouseId: widget.warehouseId,
        requiredQty: widget.suggestedQty,
      )),
    );

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
            Text(widget.inputItemName, style: RunqText.h2.copyWith(color: t.ink)),
            const SizedBox(height: 4),
            Text('Consume against this line', style: RunqText.caption.copyWith(color: t.muted)),
            const SizedBox(height: 16),
            // Batch no + scan button
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _batchCtl,
                    textCapitalization: TextCapitalization.none,
                    style: RunqText.body.copyWith(color: t.ink),
                    onChanged: (_) => setState(() {}),
                    decoration: _inputDeco(t, brand, label: 'Batch no', hint: 'Optional'),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.outlined(
                  onPressed: _scanBarcode,
                  icon: Icon(Icons.qr_code_scanner_rounded, color: brand),
                  tooltip: 'Scan batch barcode',
                ),
              ],
            ),
            // FEFO suggestions (pick mode)
            if (widget.initialMode == WoEntryMode.pick)
              sugBatchAsync.when(
                loading: () => const Padding(
                  padding: EdgeInsets.symmetric(vertical: 8),
                  child: LinearProgressIndicator(),
                ),
                error: (_, __) => const SizedBox.shrink(),
                data: (batches) => batches.isEmpty
                    ? const SizedBox.shrink()
                    : Padding(
                        padding: const EdgeInsets.only(top: 10),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Suggested batches (FEFO)',
                                style: RunqText.label.copyWith(color: t.muted)),
                            const SizedBox(height: 6),
                            for (final b in batches)
                              WoRunSuggestedBatchChip(
                                batch: b,
                                uom: widget.uom,
                                selected: _batchCtl.text == b.batchNo,
                                onTap: () => setState(() {
                                  _batchCtl.text = b.batchNo;
                                  if (_qtyCtl.text.isEmpty) {
                                    _qtyCtl.text = _fmtQty(b.availableQty);
                                  }
                                }),
                              ),
                          ],
                        ),
                      ),
              ),
            const SizedBox(height: 14),
            // Qty — big keypad-friendly
            TextField(
              controller: _qtyCtl,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              textCapitalization: TextCapitalization.none,
              inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'^\d*\.?\d*'))],
              style: RunqText.h2.copyWith(color: t.ink),
              decoration: _inputDeco(t, brand, label: 'Qty (${widget.uom})'),
            ),
            const SizedBox(height: 10),
            // Notes
            TextField(
              controller: _notesCtl,
              textCapitalization: TextCapitalization.sentences,
              maxLines: 2,
              style: RunqText.body.copyWith(color: t.ink),
              decoration: _inputDeco(t, brand, label: 'Notes (optional)'),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: MfgPrimaryButton(
                label: 'Record Consumption',
                loading: _busy,
                onPressed: _busy ? null : _submit,
              ),
            ),
          ],
        ),
      ),
    );
  }

  InputDecoration _inputDeco(RunqTokens t, Color brand, {String? label, String? hint}) =>
      InputDecoration(
        labelText: label,
        hintText: hint,
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
      );
}

/// FEFO-batch selection chip used inside the entry sheet.
class WoRunSuggestedBatchChip extends StatelessWidget {
  final SuggestedBatch batch;
  final String uom;
  final bool selected;
  final VoidCallback onTap;

  const WoRunSuggestedBatchChip({
    super.key,
    required this.batch,
    required this.uom,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = MfgColors.brand(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: selected ? MfgColors.roseSubtle : t.bgWarm,
            border: Border.all(color: selected ? brand : t.hairline),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(batch.batchNo,
                        style: RunqText.bodyStrong.copyWith(color: selected ? brand : t.ink)),
                    if (batch.expiryDate != null)
                      Text('Exp: ${mfgPrettyDate(batch.expiryDate!)}',
                          style: RunqText.caption.copyWith(color: t.muted)),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text('${_fmtQty(batch.availableQty)} $uom',
                      style: RunqText.bodyStrong.copyWith(color: t.ink)),
                  Text('${mfgIndianINR(batch.unitCost, decimals: 2)}/unit',
                      style: RunqText.caption.copyWith(color: t.muted)),
                ],
              ),
              if (selected) ...[
                const SizedBox(width: 8),
                Icon(Icons.check_circle_rounded, color: brand, size: 18),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

String _fmtQty(double v) =>
    v == v.truncateToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(3);
