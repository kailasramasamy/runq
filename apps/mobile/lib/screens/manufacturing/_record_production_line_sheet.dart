// Edit sheet for one backflushed input line on the Record Production screen.
// Lets the technician nudge the qty the server FEFO-allocated, or point it
// at a specific batch no. Returns a single override (the API's `lines`
// param is one {inputItemId, batchNo?, qty} tuple per item) or null if
// dismissed without changes.

library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../api/manufacturing_models.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/mfg_colors.dart';
import 'widgets/mfg_primitives.dart';

Future<ProductionAllocationBatch?> showRecordProductionLineSheet(
  BuildContext context, {
  required ProductionAllocation allocation,
}) {
  return showModalBottomSheet<ProductionAllocationBatch>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _RecordProductionLineSheet(allocation: allocation),
  );
}

class _RecordProductionLineSheet extends StatefulWidget {
  final ProductionAllocation allocation;
  const _RecordProductionLineSheet({required this.allocation});

  @override
  State<_RecordProductionLineSheet> createState() => _RecordProductionLineSheetState();
}

class _RecordProductionLineSheetState extends State<_RecordProductionLineSheet> {
  late final TextEditingController _qtyCtl;
  late final TextEditingController _batchCtl;

  @override
  void initState() {
    super.initState();
    final a = widget.allocation;
    final startQty = a.allocatedQty > 0 ? a.allocatedQty : a.requiredQty;
    _qtyCtl = TextEditingController(text: _fmtQty(startQty));
    _batchCtl = TextEditingController(text: a.batches.isNotEmpty ? (a.batches.first.batchNo ?? '') : '');
  }

  @override
  void dispose() {
    _qtyCtl.dispose();
    _batchCtl.dispose();
    super.dispose();
  }

  void _apply() {
    final qty = double.tryParse(_qtyCtl.text.trim()) ?? 0;
    if (qty <= 0) return;
    final batchNo = _batchCtl.text.trim();
    Navigator.pop(
      context,
      ProductionAllocationBatch(
        batchNo: batchNo.isEmpty ? null : batchNo,
        qty: qty,
        unitCost: widget.allocation.batches.isNotEmpty ? widget.allocation.batches.first.unitCost : 0,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = MfgColors.brand(context);
    final a = widget.allocation;

    // The sheet is opened with a transparent barrier background so it can own
    // its rounded top corners — which means it also has to paint its own
    // surface, or it renders straight onto the page behind it.
    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
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
            Text(a.inputItemName, style: RunqText.h2.copyWith(color: t.ink)),
            const SizedBox(height: 4),
            Text(
              'BOM needs ${_fmtQty(a.requiredQty)} ${a.uom} · ${_fmtQty(a.availableQty)} ${a.uom} on hand',
              style: RunqText.caption.copyWith(color: t.muted),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _batchCtl,
              textCapitalization: TextCapitalization.none,
              style: RunqText.body.copyWith(color: t.ink),
              decoration: _deco(t, brand, label: 'Batch no', hint: 'Leave blank for auto FEFO'),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _qtyCtl,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              textCapitalization: TextCapitalization.none,
              inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'^\d*\.?\d*'))],
              style: RunqText.h2.copyWith(color: t.ink),
              decoration: _deco(t, brand, label: 'Qty (${a.uom})'),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: MfgPrimaryButton(label: 'Apply', onPressed: _apply),
            ),
          ],
        ),
      ),
    );
  }

  InputDecoration _deco(RunqTokens t, Color brand, {String? label, String? hint}) => InputDecoration(
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

  static String _fmtQty(double v) =>
      v == v.truncateToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(3);
}
