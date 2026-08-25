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

  /// Which item the override draws from. A line that accepts substitutes can
  /// be filled from any of them, and the write-off has to name the stock that
  /// actually moved — not the item the recipe happens to lead with.
  late String _itemId;

  @override
  void initState() {
    super.initState();
    final a = widget.allocation;
    final startQty = a.allocatedQty > 0 ? a.allocatedQty : a.requiredQty;
    _qtyCtl = TextEditingController(text: _fmtQty(startQty));
    _batchCtl = TextEditingController(text: a.batches.isNotEmpty ? (a.batches.first.batchNo ?? '') : '');
    _itemId = a.batches.isNotEmpty && a.batches.first.itemId.isNotEmpty
        ? a.batches.first.itemId
        : a.inputItemId;
  }

  /// The line's own item first, then anything it accepts instead.
  List<({String id, String name})> get _sourceItems => [
        (id: widget.allocation.inputItemId, name: widget.allocation.inputItemName),
        for (final sub in widget.allocation.substitutes)
          (id: sub.itemId, name: sub.itemName),
      ];

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
        itemId: _itemId,
        itemName: _sourceItems
            .firstWhere((i) => i.id == _itemId,
                orElse: () => (id: _itemId, name: widget.allocation.inputItemName))
            .name,
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
            if (a.substitutes.isNotEmpty) ...[
              const SizedBox(height: 14),
              Text('Take from', style: RunqText.label.copyWith(color: t.muted)),
              const SizedBox(height: 6),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  for (final item in _sourceItems)
                    _SourceChip(
                      label: item.name,
                      selected: item.id == _itemId,
                      onTap: () => setState(() => _itemId = item.id),
                    ),
                ],
              ),
            ],
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

/// One selectable source item on an override — the line's own, or a stand-in.
class _SourceChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _SourceChip({required this.label, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = MfgColors.brand(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(999),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: selected ? brand.withValues(alpha: 0.14) : t.bgWarm,
          border: Border.all(color: selected ? brand : t.hairline),
          borderRadius: BorderRadius.circular(999),
        ),
        child: Text(
          label,
          style: RunqText.caption.copyWith(color: selected ? brand : t.muted),
        ),
      ),
    );
  }
}
