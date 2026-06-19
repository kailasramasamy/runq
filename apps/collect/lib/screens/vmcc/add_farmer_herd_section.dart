import 'package:flutter/material.dart';
import '../../theme/dhenu_icons.dart';
import 'package:flutter/services.dart';
import '../../api/mp_models.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
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

String breedLabel(String b) => switch (b) {
  'desi_natti' => 'Desi / Natti',
  'crossbred' => 'Crossbred',
  'jersey' => 'Jersey',
  'hf' => 'HF',
  'gir' => 'Gir',
  'sahiwal' => 'Sahiwal',
  'murrah' => 'Murrah',
  _ => 'Other',
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
    final total = breedRows.fold<int>(0, (s, r) => s + r.count);
    return FormSectionCard(
      icon: DhenuIcons.pets,
      title: 'Herd',
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
                '$total head',
                style: DhenuText.label.copyWith(color: t.brand),
              ),
            )
          : null,
      children: [
        const FieldCaption('Milk type'),
        _MilkTypePicker(value: milkType, onChanged: onMilkTypeChanged),
        const SizedBox(height: DhenuSpacing.lg),
        const FieldCaption('Cattle breeds'),
        if (breedRows.isEmpty)
          Text(
            'No breeds added yet.',
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
            label: const Text('Add breed'),
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
          decoration: const InputDecoration(labelText: 'Currently milking count'),
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

  String _label(MilkType m) => switch (m) {
    MilkType.cow => 'Cow',
    MilkType.buffalo => 'Buffalo',
    MilkType.mixed => 'Mixed',
  };

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    return Row(
      children: MilkType.values.map((m) {
        final sel = m == value;
        return Expanded(
          child: Padding(
            padding: const EdgeInsets.only(right: DhenuSpacing.xs),
            child: InkWell(
              onTap: () => onChanged(m),
              borderRadius: BorderRadius.circular(DhenuRadii.pill),
              child: Container(
                height: 44,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: sel ? t.brandSubtle : Colors.transparent,
                  borderRadius: BorderRadius.circular(DhenuRadii.pill),
                  border: Border.all(color: sel ? t.brand : t.hairline),
                ),
                child: Text(
                  _label(m),
                  style: DhenuText.label.copyWith(
                    color: sel ? t.brand : t.inkSoft,
                  ),
                ),
              ),
            ),
          ),
        );
      }).toList(),
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
    return Row(
      children: [
        Expanded(
          flex: 3,
          child: DropdownButtonFormField<String>(
            initialValue: row.breed,
            isExpanded: true,
            decoration: const InputDecoration(
              labelText: 'Breed',
              contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            ),
            items: _breeds
                .map((b) => DropdownMenuItem(value: b, child: Text(breedLabel(b))))
                .toList(),
            onChanged: (v) {
              if (v != null) onBreedChanged(v);
            },
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
            decoration: const InputDecoration(
              hintText: 'Qty',
              contentPadding: EdgeInsets.symmetric(horizontal: 8, vertical: 8),
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
