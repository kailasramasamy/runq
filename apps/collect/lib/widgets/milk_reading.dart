import 'package:flutter/material.dart';
import '../api/mp_models.dart';
import '../theme/dhenu_theme.dart';
import '../theme/dhenu_tokens.dart';

/// One milk type's four measured readings — quantity plus the QC trio — with
/// the focus nodes that guide entry field by field. Shared by the CC and PP
/// manual-receive screens, which take the same measurements per type.
class MilkReading {
  final qty$ = TextEditingController();
  final fat$ = TextEditingController();
  final snf$ = TextEditingController();
  final water$ = TextEditingController();
  final qtyFocus = FocusNode();
  final fatFocus = FocusNode();
  final snfFocus = FocusNode();
  final waterFocus = FocusNode();

  void addListener(VoidCallback fn) {
    for (final c in [qty$, fat$, snf$, water$]) {
      c.addListener(fn);
    }
  }

  void dispose() {
    for (final c in [qty$, fat$, snf$, water$]) {
      c.dispose();
    }
    for (final f in [qtyFocus, fatFocus, snfFocus, waterFocus]) {
      f.dispose();
    }
  }

  /// Load an already-recorded receipt's figures for correction.
  void prefill(MpConsignment c) {
    String trim(double n) => n == n.truncateToDouble() ? n.toInt().toString() : n.toString();
    if (c.receiptQty != null) qty$.text = trim(c.receiptQty!);
    if (c.receiptFat != null) fat$.text = trim(c.receiptFat!);
    if (c.receiptSnf != null) snf$.text = trim(c.receiptSnf!);
    if (c.receiptWater != null) water$.text = trim(c.receiptWater!);
  }

  double? _positive(TextEditingController c) {
    final v = double.tryParse(c.text);
    return (v != null && v > 0) ? v : null;
  }

  double? get qty => _positive(qty$);
  double? get fat => _positive(fat$);
  double? get snf => _positive(snf$);

  /// Water reading, where 0 is a real answer ("no added water") rather than a
  /// blank — so it parses on its own instead of going through [_positive].
  double? get water {
    final v = double.tryParse(water$.text);
    return (v != null && v >= 0) ? v : null;
  }

  /// Water is required alongside the three measures: it is the adulteration
  /// signal, so a blank reading is a gap in the source centre's quality record.
  bool get complete => qty != null && fat != null && snf != null && water != null;

  bool get isEmpty =>
      [qty$, fat$, snf$, water$].every((c) => c.text.trim().isEmpty);

  /// Put the cursor on the first field still missing, so the operator is guided
  /// rather than left hunting for what's blank.
  void focusFirstMissing() {
    if (qty == null) {
      qtyFocus.requestFocus();
    } else if (fat == null) {
      fatFocus.requestFocus();
    } else if (snf == null) {
      snfFocus.requestFocus();
    } else if (water == null) {
      waterFocus.requestFocus();
    }
  }
}

/// A numeric reading field, styled large so measured values read at a glance.
class MilkReadingField extends StatelessWidget {
  const MilkReadingField({
    super.key,
    required this.controller,
    required this.label,
    this.focusNode,
    this.next,
    this.autofocus = false,
  });

  final TextEditingController controller;
  final String label;
  final FocusNode? focusNode;
  final FocusNode? next;
  final bool autofocus;

  @override
  Widget build(BuildContext context) => TextField(
        controller: controller,
        focusNode: focusNode,
        autofocus: autofocus,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        textCapitalization: TextCapitalization.none,
        textInputAction: next != null ? TextInputAction.next : TextInputAction.done,
        onSubmitted: (_) => next?.requestFocus(),
        style: DhenuText.h2.copyWith(color: DT(context).ink, fontWeight: FontWeight.w700),
        decoration: InputDecoration(labelText: label),
      );
}
