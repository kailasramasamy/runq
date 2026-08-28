// One line of an invoice: how it reads in the list, and how it is edited.
//
// There used to be two designs here, forked on whether the invoice was being
// created or amended. Amending got a compact row you tapped to open a sheet;
// creating got a four-row block per line — item picker, then qty/price/uom,
// then GST/amount, then a Remove button. A ten-line invoice was a very long
// scroll of near-identical boxes, and the two paths drifted apart because
// nobody edits both at once.
//
// The compact row won. It is the same shape the dispatch screen settled on for
// the same reason: a line is two text rows tall, so a whole invoice fits on a
// screen and the eye can scan down the amounts.

library;

import 'package:flutter/material.dart';

import '../../api/models.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../utils/format_inr.dart';
import '../../widgets/item_picker_screen.dart';
import 'invoice_form_fields.dart';
import 'invoice_line_draft.dart';

/// A line at rest: what it is, the terms in one muted line, and the money.
class InvoiceLineRow extends StatelessWidget {
  const InvoiceLineRow({
    super.key,
    required this.line,
    required this.canRemove,
    required this.onEdit,
    required this.onRemove,
  });

  final InvoiceLineDraft line;
  final bool canRemove;
  final VoidCallback onEdit;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final desc = line.description.isEmpty ? 'Untitled item' : line.description;
    final qty = line.quantity.isEmpty ? '0' : line.quantity;
    final price = line.unitPrice.isEmpty ? '0' : line.unitPrice;
    final meta = <String>[
      if (line.uom.isNotEmpty) line.uom,
      '$qty × ₹$price',
      // An unset rate is called out rather than shown as 0%, which would read
      // as a decision someone made.
      if (line.taxRate == null) 'GST —' else if (line.taxRate! > 0)
        'GST ${line.taxRate!.toStringAsFixed(0)}%',
    ];

    return InkWell(
      onTap: onEdit,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 10, 8, 10),
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            // Flag a line that isn't sendable yet — no name, or no money —
            // so an incomplete row is visible without opening it.
            color: line.isComplete ? t.hairline : RunqColors.amberInk,
            width: line.isComplete ? 0.5 : 1,
          ),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(desc,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: RunqText.bodyStrong.copyWith(color: t.ink)),
                  const SizedBox(height: 2),
                  Text(meta.join(' · '),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: RunqText.caption.copyWith(color: t.muted)),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Text(formatINR(line.total),
                style: RunqText.tabular(size: 14, w: FontWeight.w600, color: t.ink)),
            if (canRemove)
              IconButton(
                icon: const Icon(Icons.delete_outline_rounded,
                    size: 18, color: RunqColors.redInk),
                onPressed: onRemove,
                visualDensity: VisualDensity.compact,
                tooltip: 'Remove',
              )
            else
              const SizedBox(width: 8),
          ],
        ),
      ),
    );
  }
}

/// Edit one line. Returns the new value, or null if the operator backed out —
/// so cancelling is simply not returning anything, with no live object to
/// have half-written.
Future<InvoiceLineDraft?> showInvoiceLineSheet(
  BuildContext context,
  InvoiceLineDraft line,
) {
  return showModalBottomSheet<InvoiceLineDraft>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _LineSheet(line: line),
  );
}

/// `27.0` should reach a price box as "27", not "27.0".
String _plain(double v) =>
    v == v.roundToDouble() ? v.toInt().toString() : v.toString();

class _LineSheet extends StatefulWidget {
  const _LineSheet({required this.line});
  final InvoiceLineDraft line;

  @override
  State<_LineSheet> createState() => _LineSheetState();
}

class _LineSheetState extends State<_LineSheet> {
  late InvoiceLineDraft _draft = widget.line;

  Future<void> _pickItem() async {
    final picked = await Navigator.of(context).push<ItemSummary>(
      MaterialPageRoute(builder: (_) => const ItemPickerScreen()),
    );
    if (picked == null || !mounted) return;
    // Choosing a different item means its terms, not the last one's. Only a
    // re-pick of the same item leaves a hand-typed price alone — otherwise
    // switching from a ₹27 pouch to a ₹70 one would quietly bill ₹27.
    final switched = picked.id != _draft.itemId;
    setState(() {
      _draft = _draft.copyWith(
        itemId: picked.id,
        hsnSacCode: picked.hsnSacCode ?? (switched ? null : _draft.hsnSacCode),
        description: picked.name,
        uom: picked.unit ?? _draft.uom,
        unitPrice: picked.defaultSellingPrice != null &&
                (switched || _draft.unitPrice.isEmpty)
            ? _plain(picked.defaultSellingPrice!)
            : _draft.unitPrice,
        // A master with no rate leaves the field unset rather than asserting
        // 0%, which the sheet then refuses to save until it's chosen.
        taxRate: picked.gstRate ?? (switched ? null : _draft.taxRate),
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
        ),
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
        child: SingleChildScrollView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 36,
                  height: 4,
                  decoration: BoxDecoration(
                    color: t.hairline,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Text('Line item', style: RunqText.bodyStrong.copyWith(color: t.ink)),
              const SizedBox(height: 12),
              ItemPickerRow(
                label: _draft.description.isEmpty ? null : _draft.description,
                uom: _draft.uom.isEmpty ? null : _draft.uom,
                onPick: _pickItem,
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: InvoiceNumField(
                      label: 'Qty',
                      value: _draft.quantity,
                      hint: '0',
                      autofocus: true,
                      onChanged: (v) => setState(() => _draft = _draft.copyWith(quantity: v)),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: InvoiceNumField(
                      label: 'Unit price',
                      value: _draft.unitPrice,
                      hint: '0.00',
                      onChanged: (v) => setState(() => _draft = _draft.copyWith(unitPrice: v)),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: GstSelector(
                      rate: _draft.taxRate,
                      onChanged: (r) => setState(() => _draft = _draft.copyWith(taxRate: r)),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text('Amount', style: RunqText.caption.copyWith(color: t.muted)),
                        const SizedBox(height: 4),
                        Text(formatINR(_draft.total),
                            style: RunqText.bodyStrong.copyWith(color: t.ink)),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.of(context).pop(),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                      child: const Text('Cancel'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: FilledButton(
                      onPressed: _draft.isComplete
                          ? () => Navigator.of(context).pop(_draft)
                          : null,
                      style: FilledButton.styleFrom(
                        backgroundColor: RunqColors.indigo,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                      child: const Text('Done'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
