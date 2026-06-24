import 'package:flutter/material.dart';
import '../../theme/dhenu_icons.dart';
import 'package:flutter/services.dart';
import '../../api/mp_models.dart';
import '../../l10n/app_localizations.dart';
import '../../l10n/l10n_helpers.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../widgets/sheet_grabber.dart';
import 'add_farmer_form_sections.dart';

// ── Breed enum + helpers ─────────────────────────────────────────────────────

const _breeds = [
  'desi_natti',
  'crossbred',
  'jersey',
  'hf',
  'gir',
  'sahiwal',
  'murrah',
  'other',
];

/// Legacy non-localized label used by screens that don't have a locale context.
/// New code should use [breedLabelL10n] instead.
String breedLabel(String b) => switch (b) {
  'desi_natti' => 'Desi / Natti',
  'crossbred'  => 'Crossbred',
  'jersey'     => 'Jersey',
  'hf'         => 'HF',
  'gir'        => 'Gir',
  'sahiwal'    => 'Sahiwal',
  'murrah'     => 'Murrah',
  _            => 'Other',
};

String breedLabelL10n(AppLocalizations l, String b) => switch (b) {
  'desi_natti' => l.herdBreedDesiNatti,
  'crossbred'  => l.herdBreedCrossbred,
  'jersey'     => l.herdBreedJersey,
  'hf'         => l.herdBreedHf,
  'gir'        => l.herdBreedGir,
  'sahiwal'    => l.herdBreedSahiwal,
  'murrah'     => l.herdBreedMurrah,
  _            => l.herdBreedOther,
};

/// A herd row. The quantity lives in its own controller so the field starts
/// empty (point 2) and keeps the cursor while typing. `count` reads back 0 for
/// blank input — the save body drops rows with count 0.
class BreedRow {
  BreedRow({required this.breed});
  String breed;
  final TextEditingController qtyCtrl = TextEditingController();
  int get count => int.tryParse(qtyCtrl.text) ?? 0;
  void dispose() => qtyCtrl.dispose();
}

/// Full-width bottom sheet to pick a cattle breed — replaces the cramped inline
/// dropdown so the breed row has room for the Qty + remove controls. Returns the
/// chosen breed key, or null if dismissed.
Future<String?> showBreedPickerSheet(BuildContext context, String selected) {
  final t = DT(context);
  final l = AppLocalizations.of(context);
  return showModalBottomSheet<String>(
    context: context,
    backgroundColor: Colors.transparent,
    builder: (ctx) => Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius:
            const BorderRadius.vertical(top: Radius.circular(DhenuRadii.sheet)),
      ),
      child: SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SheetGrabber(),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                  DhenuSpacing.lg, 0, DhenuSpacing.lg, DhenuSpacing.sm),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(l.herdBreedLabel,
                    style: DhenuText.title.copyWith(color: t.ink)),
              ),
            ),
            for (final b in _breeds)
              _BreedOption(
                label: breedLabelL10n(l, b),
                selected: b == selected,
                onTap: () => Navigator.pop(ctx, b),
              ),
            const SizedBox(height: DhenuSpacing.sm),
          ],
        ),
      ),
    ),
  );
}

class _BreedOption extends StatelessWidget {
  const _BreedOption({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(
            horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.md),
        child: Row(
          children: [
            Expanded(
              child: Text(
                label,
                style: DhenuText.body.copyWith(
                  color: selected ? t.brand : t.ink,
                  fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
                ),
              ),
            ),
            if (selected)
              Icon(DhenuIcons.checkCircle, size: 20, color: t.brand),
          ],
        ),
      ),
    );
  }
}

// ── Herd section ─────────────────────────────────────────────────────────────

class FarmerHerdSection extends StatelessWidget {
  const FarmerHerdSection({
    super.key,
    required this.milkType,
    required this.onMilkTypeChanged,
    required this.breedRows,
    required this.inMilkCtrl,
    required this.onAddBreed,
    required this.onRemoveBreed,
    required this.onBreedChanged,
    required this.onQtyChanged,
  });

  final MilkType milkType;
  final ValueChanged<MilkType> onMilkTypeChanged;
  final List<BreedRow> breedRows;
  final TextEditingController inMilkCtrl;
  final VoidCallback onAddBreed;
  final ValueChanged<int> onRemoveBreed;
  final void Function(int index, String breed) onBreedChanged;
  final VoidCallback onQtyChanged;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final total = breedRows.fold<int>(0, (s, r) => s + r.count);
    return FormSectionCard(
      icon: DhenuIcons.pets,
      title: l.herdSectionTitle,
      trailing: total > 0
          ? Container(
              padding: const EdgeInsets.symmetric(
                horizontal: DhenuSpacing.sm,
                vertical: DhenuSpacing.xs,
              ),
              decoration: BoxDecoration(
                color: t.brandSubtle,
                borderRadius: BorderRadius.circular(DhenuRadii.pill),
              ),
              child: Text(
                l.herdTotalHead(total),
                style: DhenuText.label.copyWith(color: t.brand),
              ),
            )
          : null,
      children: [
        FieldCaption(l.herdMilkType),
        _MilkTypePicker(value: milkType, onChanged: onMilkTypeChanged),
        const SizedBox(height: DhenuSpacing.lg),
        FieldCaption(l.herdCattleBreeds),
        if (breedRows.isEmpty)
          Text(
            l.herdNoBreedsYet,
            style: DhenuText.caption.copyWith(color: t.inkSoft),
          ),
        for (var i = 0; i < breedRows.length; i++) ...[
          _BreedRowWidget(
            row: breedRows[i],
            onBreedChanged: (b) => onBreedChanged(i, b),
            onQtyChanged: onQtyChanged,
            onRemove: () => onRemoveBreed(i),
          ),
          const SizedBox(height: DhenuSpacing.sm),
        ],
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: onAddBreed,
            icon: const Icon(DhenuIcons.add, size: 18),
            label: Text(l.herdAddBreed),
            style: TextButton.styleFrom(
              foregroundColor: t.brand,
              padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.sm),
            ),
          ),
        ),
        const SizedBox(height: DhenuSpacing.md),
        TextField(
          controller: inMilkCtrl,
          keyboardType: TextInputType.number,
          textCapitalization: TextCapitalization.none,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          decoration: InputDecoration(labelText: l.herdInMilkCount),
          textInputAction: TextInputAction.next,
        ),
      ],
    );
  }
}

class _MilkTypePicker extends StatelessWidget {
  const _MilkTypePicker({required this.value, required this.onChanged});
  final MilkType value;
  final ValueChanged<MilkType> onChanged;

  static const _selectableMilkTypes = [
    MilkType.cowA1, MilkType.cowA2, MilkType.buffalo, MilkType.mixed,
  ];

  Widget _pill(BuildContext context, MilkType m) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final sel = m == value;
    return Expanded(
      child: InkWell(
        onTap: () => onChanged(m),
        borderRadius: BorderRadius.circular(DhenuRadii.pill),
        child: Container(
          constraints: const BoxConstraints(minHeight: 48),
          alignment: Alignment.center,
          padding: const EdgeInsets.symmetric(
              horizontal: DhenuSpacing.md, vertical: DhenuSpacing.sm),
          decoration: BoxDecoration(
            color: sel ? t.brandSubtle : Colors.transparent,
            borderRadius: BorderRadius.circular(DhenuRadii.pill),
            border: Border.all(color: sel ? t.brand : t.hairline),
          ),
          child: Text(
            milkTypeL10n(l, m),
            textAlign: TextAlign.center,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: DhenuText.label.copyWith(color: sel ? t.brand : t.inkSoft),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    // 2×2 grid: two pills per row, full-width — gives each label room to breathe
    // (e.g. "Cow A1 (regular)") instead of cramming four into one tight row.
    // IntrinsicHeight + stretch keeps both pills in a row the same height.
    Widget rowOf(MilkType a, MilkType b) => IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _pill(context, a),
              const SizedBox(width: DhenuSpacing.sm),
              _pill(context, b),
            ],
          ),
        );
    return Column(
      children: [
        rowOf(_selectableMilkTypes[0], _selectableMilkTypes[1]),
        const SizedBox(height: DhenuSpacing.sm),
        rowOf(_selectableMilkTypes[2], _selectableMilkTypes[3]),
      ],
    );
  }
}

class _BreedRowWidget extends StatelessWidget {
  const _BreedRowWidget({
    required this.row,
    required this.onBreedChanged,
    required this.onQtyChanged,
    required this.onRemove,
  });

  final BreedRow row;
  final ValueChanged<String> onBreedChanged;
  final VoidCallback onQtyChanged;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    return Row(
      children: [
        Expanded(
          flex: 3,
          child: InkWell(
            onTap: () async {
              final picked = await showBreedPickerSheet(context, row.breed);
              if (picked != null) onBreedChanged(picked);
            },
            borderRadius: BorderRadius.circular(DhenuRadii.input),
            child: InputDecorator(
              decoration: InputDecoration(
                labelText: l.herdBreedLabel,
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      breedLabelL10n(l, row.breed),
                      style: DhenuText.body.copyWith(color: t.ink),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  Icon(DhenuIcons.chevronDown, size: 20, color: t.inkSoft),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(width: DhenuSpacing.sm),
        SizedBox(
          width: 70,
          child: TextField(
            controller: row.qtyCtrl,
            keyboardType: TextInputType.number,
            textCapitalization: TextCapitalization.none,
            textAlign: TextAlign.center,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            decoration: InputDecoration(
              hintText: l.herdQtyHint,
              contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
            ),
            onChanged: (_) => onQtyChanged(),
          ),
        ),
        IconButton(
          icon: Icon(DhenuIcons.minusCircle, color: t.gradeC, size: 20),
          onPressed: onRemove,
          padding: EdgeInsets.zero,
          constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
        ),
      ],
    );
  }
}
