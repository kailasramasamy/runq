// Widgets for the item pricing editor: the cost build-up rows and the
// derived-numbers preview. Split from item_pricing_edit_screen.dart so the
// screen holds only form state and the save payload.

library;

import 'package:flutter/material.dart';

import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import 'inv_colors.dart';
import 'inv_form_fields.dart';
import 'inv_primitives.dart';

/// `12.50` → `12.5`, `12.00` → `12` — seeds text fields without dragging
/// trailing zeros into every edit.
String trimNum(double v) {
  final s = v.toStringAsFixed(2);
  return s.endsWith('.00')
      ? s.substring(0, s.length - 3)
      : (s.endsWith('0') ? s.substring(0, s.length - 1) : s);
}

/// One editable cost component. Owns its controllers so the screen can add
/// and remove rows without rebuilding the whole list's text state.
class CogmRowState {
  CogmRowState({required String label, required double amount, String? note})
      : labelCtrl = TextEditingController(text: label),
        amountCtrl = TextEditingController(text: amount == 0 ? '' : trimNum(amount)),
        noteCtrl = TextEditingController(text: note ?? '');
  final TextEditingController labelCtrl;
  final TextEditingController amountCtrl;
  final TextEditingController noteCtrl;

  String get labelText => labelCtrl.text.trim();
  String get noteText => noteCtrl.text.trim();
  double get amount => double.tryParse(amountCtrl.text.trim()) ?? 0;

  void attach(VoidCallback onChange) {
    labelCtrl.addListener(onChange);
    amountCtrl.addListener(onChange);
  }

  void dispose() {
    labelCtrl.dispose();
    amountCtrl.dispose();
    noteCtrl.dispose();
  }
}

/// The cost build-up. Its total *is* the cost price — there's no separate
/// cost field, mirroring the web, so the two can never disagree.
class CogmEditor extends StatelessWidget {
  const CogmEditor({
    super.key,
    required this.rows,
    required this.total,
    required this.onAdd,
    required this.onRemove,
  });
  final List<CogmRowState> rows;
  final double total;
  final VoidCallback onAdd;
  final void Function(int index) onRemove;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return InvFormSection(
      title: 'Cost Build-up',
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Text(
            'Cost price is the total of these components.',
            style: RunqText.caption.copyWith(color: t.muted),
          ),
        ),
        for (var i = 0; i < rows.length; i++)
          _CogmRow(
            row: rows[i],
            // The last remaining row keeps the cost editable — removing it
            // would leave no way to enter a number at all.
            onRemove: rows.length == 1 ? null : () => onRemove(i),
          ),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: onAdd,
            icon: Icon(Icons.add, size: 16, color: InvColors.brand(context)),
            label: Text(
              'Add component',
              style: RunqText.caption.copyWith(color: InvColors.brand(context)),
            ),
            style: TextButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 8)),
          ),
        ),
        Container(
          margin: const EdgeInsets.only(top: 4, bottom: 12),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: InvColors.amberSubtle,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  'Cost price',
                  style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 14),
                ),
              ),
              Text(
                indianINR(total, decimals: 2),
                style: RunqText.h4.copyWith(color: InvColors.amberDeep),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _CogmRow extends StatelessWidget {
  const _CogmRow({required this.row, required this.onRemove});
  final CogmRowState row;
  final VoidCallback? onRemove;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            flex: 3,
            child: InvFormField(
              label: 'Component',
              controller: row.labelCtrl,
              hint: 'e.g. Packaging',
              capitalization: TextCapitalization.sentences,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            flex: 2,
            child: InvNumField(label: 'Amount', controller: row.amountCtrl),
          ),
          SizedBox(
            width: 36,
            child: Padding(
              padding: const EdgeInsets.only(top: 26),
              child: IconButton(
                onPressed: onRemove,
                visualDensity: VisualDensity.compact,
                icon: Icon(
                  Icons.close,
                  size: 18,
                  color: onRemove == null ? t.hairlineSoft : t.muted,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Live read-out of everything the form derives rather than stores: the
/// taxable basic price, the GST on it, the price the buyer pays, and what
/// is left after cost.
class PricingPreview extends StatelessWidget {
  const PricingPreview({
    super.key,
    required this.basicPrice,
    required this.gstValue,
    required this.landingPrice,
    required this.landingLabel,
    required this.sellingPrice,
    required this.profitPerUnit,
    required this.netMarginPct,
    required this.unit,
  });
  final double basicPrice;
  final double gstValue;
  final double? landingPrice;
  final String landingLabel;
  final double? sellingPrice;
  final double profitPerUnit;
  final double netMarginPct;
  final String? unit;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final tone = profitPerUnit < 0
        ? InvColors.error
        : netMarginPct < 5
            ? InvColors.orangeAlert
            : InvColors.success;
    return InvCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'DERIVED',
            style: RunqText.label.copyWith(color: t.muted),
          ),
          const SizedBox(height: 8),
          _PreviewRow(label: 'Basic price (excl GST)', value: indianINR(basicPrice, decimals: 2)),
          _PreviewRow(label: 'GST amount', value: indianINR(gstValue, decimals: 2)),
          _PreviewRow(
            label: landingLabel,
            value: indianINR(landingPrice ?? sellingPrice ?? 0, decimals: 2),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: Text(
                  profitPerUnit < 0 ? 'Net loss per unit' : 'Net profit per unit',
                  style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 14),
                ),
              ),
              Text(
                indianINR(profitPerUnit, decimals: 2),
                style: RunqText.h4.copyWith(color: tone),
              ),
            ],
          ),
          Text(
            '${netMarginPct.toStringAsFixed(2)}% margin${unit == null ? '' : ' · per ${unit!}'}',
            style: RunqText.micro.copyWith(color: tone),
          ),
        ],
      ),
    );
  }
}

class _PreviewRow extends StatelessWidget {
  const _PreviewRow({required this.label, required this.value});
  final String label;
  final String value;
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Expanded(
            child: Text(label, style: RunqText.caption.copyWith(color: t.muted)),
          ),
          Text(value, style: RunqText.body.copyWith(color: t.ink, fontSize: 14)),
        ],
      ),
    );
  }
}
