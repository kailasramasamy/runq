import 'package:flutter/material.dart';
import '../api/mp_models.dart';
import '../l10n/app_localizations.dart';
import '../l10n/l10n_helpers.dart';
import '../theme/dhenu_icons.dart';
import '../theme/dhenu_theme.dart';
import '../theme/dhenu_tokens.dart';
import 'milk_reading.dart';
import 'milk_type_toggle.dart';
import '../utils/format.dart';
import 'dhenu_card.dart';

/// Editable state for one milk type's leg of a dispatch. Each type leaves as its
/// own consignment, so each carries its own quantity, QC and container.
class DispatchTypeEntry {
  DispatchTypeEntry(this.availability)
      : needsType = availability.milkType == null,
        type = milkTypeFrom(availability.milkType),
        qty = TextEditingController(),
        fat = TextEditingController(),
        snf = TextEditingController(),
        water = TextEditingController(),
        container = TextEditingController();

  final MpTypeAvailability availability;

  /// True for legacy milk received before the per-type split, which carries no
  /// milk type at all. It can't be dispatched blind — [milkTypeFrom] would call
  /// it cow A1, and a mixed buffalo/cow tanker would go onward mislabelled — so
  /// the operator names the type before this leg becomes valid.
  final bool needsType;

  /// Assignable only while [needsType]: a typed availability already knows what
  /// it is, and letting that be re-pointed would misfile good milk.
  MilkType type;

  /// Unset until the operator picks, so nothing dispatches on the default.
  bool typeChosen = false;
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
      enteredQty - available <= 0.001 &&
      (!needsType || typeChosen);

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
            child: Text(
                entry.needsType && !entry.typeChosen
                    ? l.dispatchUntypedTitle
                    : milkTypeL10n(l, entry.type),
                style: DhenuText.title.copyWith(color: on ? t.ink : t.inkSoft)),
          ),
          Text(litres(entry.available, unit: true),
              style: DhenuText.number(size: 18, color: on ? t.brand : t.inkSoft)),
        ]),
        if (on) ...[
          // Legacy untyped milk: the operator names what the tanker actually
          // held. Without this the leg is invalid, so nothing goes onward as a
          // guessed cow A1.
          if (entry.needsType) ...[
            const SizedBox(height: DhenuSpacing.md),
            MilkTypeToggle(
              types: const [MilkType.cowA1, MilkType.cowA2, MilkType.buffalo],
              value: entry.type,
              onChanged: (m) {
                entry.type = m;
                entry.typeChosen = true;
                onChanged();
              },
            ),
            if (!entry.typeChosen) ...[
              const SizedBox(height: DhenuSpacing.xs),
              Text(l.dispatchUntypedHint,
                  style: DhenuText.caption.copyWith(color: t.am)),
            ],
          ],
          const SizedBox(height: DhenuSpacing.md),
          // The three measured figures share one row: they are short numbers,
          // and stacking them pushed a second milk type off the screen. Labels
          // float rather than hint, so a filled field still says what it is.
          // Weighted, not equal thirds: a pooled CC leg runs to four digits
          // ("1200.0") while FAT and SNF are always three characters, so an
          // even split clips the one number that matters most.
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(
              flex: 4,
              child: MilkReadingField(
                controller: entry.qty,
                label: l.dispatchQtyLabel,
                onChanged: (_) => onChanged(),
                errorText: over
                    ? l.dispatchErrorOverQty(entry.available.toStringAsFixed(1))
                    : null,
              ),
            ),
            const SizedBox(width: DhenuSpacing.sm),
            Expanded(
              flex: 3,
              child: MilkReadingField(
                controller: entry.fat,
                label: l.dispatchFatHint,
                onChanged: (_) => onChanged(),
              ),
            ),
            const SizedBox(width: DhenuSpacing.sm),
            Expanded(
              flex: 3,
              child: MilkReadingField(
                controller: entry.snf,
                label: l.dispatchSnfHint,
                onChanged: (_) => onChanged(),
              ),
            ),
          ]),
          const SizedBox(height: DhenuSpacing.sm),
          // Optional metadata, kept at body size so the measured trio above
          // stays the thing the eye lands on.
          Row(children: [
            Expanded(
              child: TextField(
                controller: entry.water,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                textCapitalization: TextCapitalization.none,
                decoration: InputDecoration(labelText: l.dispatchWaterLabel),
              ),
            ),
            const SizedBox(width: DhenuSpacing.sm),
            Expanded(
              child: TextField(
                controller: entry.container,
                textCapitalization: TextCapitalization.characters,
                decoration: InputDecoration(labelText: l.dispatchContainerFieldLabel),
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
}
