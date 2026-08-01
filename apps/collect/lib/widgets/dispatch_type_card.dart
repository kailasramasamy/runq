import 'package:flutter/material.dart';
import '../api/mp_models.dart';
import '../l10n/app_localizations.dart';
import '../l10n/l10n_helpers.dart';
import '../theme/dhenu_icons.dart';
import '../theme/dhenu_theme.dart';
import '../theme/dhenu_tokens.dart';
import '../utils/format.dart';
import 'dhenu_card.dart';

/// Editable state for one milk type's leg of a dispatch. Each type leaves as its
/// own consignment, so each carries its own quantity, QC and container.
class DispatchTypeEntry {
  DispatchTypeEntry(this.availability)
      : type = milkTypeFrom(availability.milkType),
        qty = TextEditingController(),
        fat = TextEditingController(),
        snf = TextEditingController(),
        water = TextEditingController(),
        container = TextEditingController();

  final MpTypeAvailability availability;
  final MilkType type;
  final TextEditingController qty, fat, snf, water, container;

  /// Unticked types stay behind for a later run — a centre may send cow now and
  /// buffalo once the evening can is full.
  bool include = true;

  double get available => availability.available;
  double get enteredQty => double.tryParse(qty.text) ?? 0;
  double? get enteredFat => double.tryParse(fat.text);
  double? get enteredSnf => double.tryParse(snf.text);
  double? get enteredWater => double.tryParse(water.text);

  /// Prefill from what's on hand, leaving anything already typed alone.
  void prefill() {
    if (qty.text.isEmpty) qty.text = available.toStringAsFixed(1);
    final a = availability;
    if (fat.text.isEmpty && a.avgFat != null) fat.text = a.avgFat!.toStringAsFixed(1);
    if (snf.text.isEmpty && a.avgSnf != null) snf.text = a.avgSnf!.toStringAsFixed(1);
    if (water.text.isEmpty && a.avgWater != null) water.text = a.avgWater!.toStringAsFixed(1);
  }

  /// Qty and QC are mandatory per leg; water stays optional as it is elsewhere.
  bool get isValid =>
      enteredQty > 0 && enteredFat != null && enteredSnf != null &&
      enteredQty - available <= 0.001;

  void clear() {
    for (final c in [qty, fat, snf, water, container]) {
      c.clear();
    }
  }

  void dispose() {
    for (final c in [qty, fat, snf, water, container]) {
      c.dispose();
    }
  }
}

/// One milk type's dispatch block: the type named in full with its litres on
/// hand, then the editable leg. Naming the type is the point — two bare
/// quantities give the operator no way to tell cow from buffalo.
class DispatchTypeCard extends StatelessWidget {
  const DispatchTypeCard({
    super.key,
    required this.entry,
    required this.onChanged,
    this.selectable = true,
  });

  final DispatchTypeEntry entry;
  final VoidCallback onChanged;

  /// False when the node holds a single type — there is nothing to opt out of,
  /// so the tick box would just be noise.
  final bool selectable;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final on = entry.include;
    final over = entry.enteredQty - entry.available > 0.001;
    return DhenuCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          if (selectable)
            SizedBox(
              width: 28, height: 28,
              child: Checkbox(
                value: on,
                onChanged: (v) { entry.include = v ?? false; onChanged(); },
              ),
            ),
          if (selectable) const SizedBox(width: DhenuSpacing.sm),
          Expanded(
            child: Text(milkTypeL10n(l, entry.type),
                style: DhenuText.title.copyWith(color: on ? t.ink : t.inkSoft)),
          ),
          Text(litres(entry.available, unit: true),
              style: DhenuText.number(size: 18, color: on ? t.brand : t.inkSoft)),
        ]),
        if (on) ...[
          const SizedBox(height: DhenuSpacing.md),
          TextField(
            controller: entry.qty,
            keyboardType: TextInputType.number,
            textCapitalization: TextCapitalization.none,
            onChanged: (_) => onChanged(),
            decoration: InputDecoration(
              hintText: l.dispatchQtyHint,
              errorText: over ? l.dispatchErrorOverQty(entry.available.toStringAsFixed(1)) : null,
            ),
          ),
          const SizedBox(height: DhenuSpacing.md),
          Row(children: [
            Expanded(child: _num(entry.fat, l.dispatchFatHint)),
            const SizedBox(width: DhenuSpacing.md),
            Expanded(child: _num(entry.snf, l.dispatchSnfHint)),
          ]),
          const SizedBox(height: DhenuSpacing.md),
          Row(children: [
            Expanded(child: _num(entry.water, l.dispatchWaterHint)),
            const SizedBox(width: DhenuSpacing.md),
            Expanded(
              child: TextField(
                controller: entry.container,
                textCapitalization: TextCapitalization.characters,
                decoration: InputDecoration(hintText: l.dispatchContainerHint),
              ),
            ),
          ]),
        ] else ...[
          const SizedBox(height: DhenuSpacing.xs),
          Row(children: [
            Icon(DhenuIcons.clock, size: 13, color: t.inkSoft),
            const SizedBox(width: DhenuSpacing.xs),
            Expanded(child: Text(l.dispatchTypeHeldBack,
                style: DhenuText.caption.copyWith(color: t.inkSoft))),
          ]),
        ],
      ]),
    );
  }

  Widget _num(TextEditingController c, String hint) => TextField(
        controller: c,
        keyboardType: TextInputType.number,
        textCapitalization: TextCapitalization.none,
        decoration: InputDecoration(hintText: hint),
      );
}
