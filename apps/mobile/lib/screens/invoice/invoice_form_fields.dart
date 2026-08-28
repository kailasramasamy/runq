// The invoice form's field vocabulary.
//
// Split out of the screen so the form is about the form, and so the item
// picker and the line-edit sheet share one set of inputs rather than each
// growing a lookalike.

library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../api/models.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';

InputDecoration invoiceInputDecoration(RunqTokens t, {String? hint, String? prefix, String? suffix}) {
  return InputDecoration(
    isDense: true,
    filled: true,
    fillColor: t.inputFill,
    hintText: hint,
    prefixText: prefix,
    suffixText: suffix,
    hintStyle: RunqText.body.copyWith(color: t.muted),
    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(10),
      borderSide: BorderSide(color: t.hairline, width: 0.5),
    ),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(10),
      borderSide: BorderSide(color: t.hairline, width: 0.5),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(10),
      borderSide: const BorderSide(color: RunqColors.indigo, width: 1),
    ),
  );
}

class InvoiceSectionCard extends StatelessWidget {
  final String title;
  final Widget child;
  const InvoiceSectionCard({super.key, required this.title, required this.child});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: t.hairline, width: 0.5),
      ),
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: RunqText.bodyStrong.copyWith(color: t.ink)),
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }
}

class CustomerPickerRow extends StatelessWidget {
  final CustomerSummary? customer;
  final VoidCallback onPick;
  const CustomerPickerRow({super.key, required this.customer, required this.onPick});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final has = customer != null;
    return InkWell(
      onTap: onPick,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        decoration: BoxDecoration(
          color: t.inputFill,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: has ? RunqColors.indigo : t.hairline, width: 0.5),
        ),
        child: Row(
          children: [
            Icon(has ? Icons.business_rounded : Icons.search_rounded,
                size: 18, color: has ? RunqColors.indigo : t.muted),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    has ? customer!.name : 'Pick customer',
                    style: RunqText.body.copyWith(
                      color: has ? t.ink : t.muted,
                      fontWeight: has ? FontWeight.w600 : FontWeight.w400,
                    ),
                  ),
                  if (has && customer!.gstin != null && customer!.gstin!.isNotEmpty)
                    Text(customer!.gstin!,
                        style: RunqText.label.copyWith(color: t.muted)),
                ],
              ),
            ),
            Icon(Icons.chevron_right_rounded, color: t.muted2),
          ],
        ),
      ),
    );
  }
}

class InvoiceDateField extends StatelessWidget {
  final String label;
  final DateTime value;
  final ValueChanged<DateTime> onChanged;
  const InvoiceDateField({super.key, required this.label, required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final text = '${value.day.toString().padLeft(2, '0')}/${value.month.toString().padLeft(2, '0')}/${value.year}';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: RunqText.caption.copyWith(color: t.muted)),
        const SizedBox(height: 4),
        InkWell(
          onTap: () async {
            final picked = await showDatePicker(
              context: context,
              initialDate: value,
              firstDate: DateTime(2020),
              lastDate: DateTime(2100),
            );
            if (picked != null) onChanged(picked);
          },
          borderRadius: BorderRadius.circular(10),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            decoration: BoxDecoration(
              color: t.inputFill,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: t.hairline, width: 0.5),
            ),
            child: Row(
              children: [
                Icon(Icons.calendar_today_rounded, size: 14, color: t.muted),
                const SizedBox(width: 8),
                Text(text, style: RunqText.body.copyWith(color: t.ink)),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class InvoiceTextField extends StatelessWidget {
  final TextEditingController controller;
  final String label;
  final String? hint;
  const InvoiceTextField({super.key, required this.controller, required this.label, this.hint});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: RunqText.caption.copyWith(color: t.muted)),
        const SizedBox(height: 4),
        TextField(
          controller: controller,
          textCapitalization: TextCapitalization.sentences,
          decoration: invoiceInputDecoration(t, hint: hint),
        ),
      ],
    );
  }
}

/// A number the form both reads and writes.
///
/// Controlled rather than seeded, because the value changes underneath it:
/// picking a catalogue item fills in the unit price, and `initialValue` is
/// only ever read when the field's state is first created. Seeding it meant
/// the price landed in the draft — the Amount line updated — while the box
/// the operator was looking at stayed empty.
///
/// Text is only pushed in when it actually differs from what is displayed, so
/// typing is never interrupted by the parent echoing the same value back.
class InvoiceNumField extends StatefulWidget {
  final String label;
  final String value;
  final ValueChanged<String> onChanged;
  final String? hint;

  /// Set on the first field of the line sheet: the sheet exists to be typed
  /// into, so it opens with the keyboard already up.
  final bool autofocus;
  const InvoiceNumField({
    super.key,
    required this.label,
    required this.value,
    required this.onChanged,
    this.hint,
    this.autofocus = false,
  });

  @override
  State<InvoiceNumField> createState() => _InvoiceNumFieldState();
}

class _InvoiceNumFieldState extends State<InvoiceNumField> {
  late final TextEditingController _ctrl =
      TextEditingController(text: widget.value);
  late final FocusNode _focus = FocusNode()..addListener(_onFocus);

  /// These fields arrive pre-filled — a price from the item master, a quantity
  /// being corrected — so editing almost always means replacing the number
  /// rather than appending to it. Selecting on focus saves backspacing through
  /// it first.
  ///
  /// Applied after the frame because the tap that grants focus places a caret
  /// of its own during that same frame.
  void _onFocus() {
    if (!_focus.hasFocus) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_focus.hasFocus) return;
      _ctrl.selection =
          TextSelection(baseOffset: 0, extentOffset: _ctrl.text.length);
    });
  }

  @override
  void didUpdateWidget(InvoiceNumField old) {
    super.didUpdateWidget(old);
    if (widget.value != _ctrl.text) _ctrl.text = widget.value;
  }

  @override
  void dispose() {
    _focus.removeListener(_onFocus);
    _focus.dispose();
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(widget.label, style: RunqText.caption.copyWith(color: t.muted)),
        const SizedBox(height: 4),
        TextField(
          controller: _ctrl,
          focusNode: _focus,
          autofocus: widget.autofocus,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
          onChanged: widget.onChanged,
          decoration: invoiceInputDecoration(t, hint: widget.hint),
        ),
      ],
    );
  }
}

class UomDisplay extends StatelessWidget {
  final String uom;
  const UomDisplay({super.key, required this.uom});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('UOM', style: RunqText.caption.copyWith(color: t.muted)),
        const SizedBox(height: 4),
        Container(
          height: 44,
          alignment: Alignment.centerLeft,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          decoration: BoxDecoration(
            color: t.inputFill,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: t.hairline, width: 0.5),
          ),
          child: Text(uom.isEmpty ? '—' : uom,
              style: RunqText.body.copyWith(color: uom.isEmpty ? t.muted : t.ink)),
        ),
      ],
    );
  }
}

class GstSelector extends StatelessWidget {
  final double? rate;
  final ValueChanged<double> onChanged;
  const GstSelector({super.key, required this.rate, required this.onChanged});

  static const _options = [0.0, 5.0, 12.0, 18.0, 28.0];

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final unset = rate == null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('GST', style: RunqText.caption.copyWith(color: t.muted)),
        const SizedBox(height: 4),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          decoration: BoxDecoration(
            color: t.inputFill,
            borderRadius: BorderRadius.circular(10),
            // Flag an unset rate so it can't be missed and shipped as 0%.
            border: Border.all(
                color: unset ? RunqColors.amberInk : t.hairline,
                width: unset ? 1 : 0.5),
          ),
          child: DropdownButtonHideUnderline(
            child: DropdownButton<double>(
              value: rate != null && _options.contains(rate) ? rate : null,
              isExpanded: true,
              hint: Text('Select', style: RunqText.body.copyWith(color: t.muted)),
              icon: Icon(Icons.expand_more_rounded, color: t.muted, size: 18),
              style: RunqText.body.copyWith(color: t.ink),
              items: _options
                  .map((r) => DropdownMenuItem<double>(
                        value: r,
                        child: Text('${r.toStringAsFixed(0)}%'),
                      ))
                  .toList(),
              onChanged: (v) {
                if (v != null) onChanged(v);
              },
            ),
          ),
        ),
      ],
    );
  }
}

class ItemPickerRow extends StatelessWidget {
  final String? label;
  final String? uom;
  final VoidCallback onPick;
  const ItemPickerRow({super.key, required this.label, required this.uom, required this.onPick});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final has = label != null;
    final display = has && uom != null && uom!.isNotEmpty ? '$label · $uom' : (label ?? 'Pick item');
    return InkWell(
      onTap: onPick,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: has ? RunqColors.indigo : t.hairline, width: 0.5),
        ),
        child: Row(
          children: [
            Icon(has ? Icons.inventory_2_rounded : Icons.search_rounded,
                size: 18, color: has ? RunqColors.indigo : t.muted),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                display,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: RunqText.body.copyWith(
                  color: has ? t.ink : t.muted,
                  fontWeight: has ? FontWeight.w600 : FontWeight.w400,
                ),
              ),
            ),
            Icon(Icons.chevron_right_rounded, color: t.muted2),
          ],
        ),
      ),
    );
  }
}

class InvoiceSummaryRow extends StatelessWidget {
  final String label, value;
  final bool bold;
  const InvoiceSummaryRow({super.key, required this.label, required this.value, this.bold = false});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final style = bold
        ? RunqText.bodyStrong.copyWith(color: t.ink)
        : RunqText.body.copyWith(color: t.muted);
    final valStyle = bold
        ? RunqText.tabular(size: 16, w: FontWeight.w700, color: t.ink)
        : RunqText.tabular(size: 14, w: FontWeight.w500, color: t.ink);
    return Row(
      children: [
        Expanded(child: Text(label, style: style)),
        Text(value, style: valStyle),
      ],
    );
  }
}
