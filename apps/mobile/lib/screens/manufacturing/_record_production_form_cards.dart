// Form cards for the Record Production screen: BOM + qty + warehouse, and
// the details card (expiry / batch no / shift / notes). Split out of
// `record_production_screen.dart` to keep that file under the house line cap.

library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../inventory/widgets/warehouse_picker.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/mfg_colors.dart';
import 'widgets/mfg_primitives.dart';

/// "What was made" card — BOM picker, produced qty, warehouse.
class RecordProductionBomQtyCard extends StatelessWidget {
  final String? bomCode;
  final String? bomName;
  final String? outputUom;
  final TextEditingController producedQtyCtl;
  final String? warehouseId;
  final VoidCallback onPickBom;
  final VoidCallback onQtyChanged;
  final ValueChanged<String?> onWarehouseChanged;

  const RecordProductionBomQtyCard({
    super.key,
    required this.bomCode,
    required this.bomName,
    required this.outputUom,
    required this.producedQtyCtl,
    required this.warehouseId,
    required this.onPickBom,
    required this.onQtyChanged,
    required this.onWarehouseChanged,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return MfgCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('What was made', style: RunqText.label),
          const SizedBox(height: 10),
          RecordProductionPickerTile(label: 'BOM', value: bomCode, onTap: onPickBom),
          if (bomName != null) ...[
            const SizedBox(height: 4),
            Text(bomName!, style: RunqText.caption.copyWith(color: t.muted)),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                flex: 4,
                child: TextField(
                  controller: producedQtyCtl,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  textCapitalization: TextCapitalization.none,
                  inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'^\d*\.?\d*'))],
                  style: RunqText.h2.copyWith(color: t.ink),
                  onChanged: (_) => onQtyChanged(),
                  decoration: InputDecoration(
                    labelText: 'Produced Qty',
                    filled: true,
                    fillColor: t.bgWarm,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: BorderSide(color: t.hairline),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                flex: 6,
                child: WarehousePicker(
                  value: warehouseId,
                  onChanged: onWarehouseChanged,
                  label: 'Warehouse',
                  allowAll: false,
                  dense: true,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Expiry (when the output tracks batches) / batch no / shift / notes card.
class RecordProductionDetailsCard extends StatelessWidget {
  final bool outputTracksBatches;
  final DateTime? expiryDate;
  final VoidCallback onPickExpiry;
  final TextEditingController batchNoCtl;
  final String? shift;
  final List<String> shiftPresets;
  final ValueChanged<String> onShiftTap;
  final TextEditingController notesCtl;

  const RecordProductionDetailsCard({
    super.key,
    required this.outputTracksBatches,
    required this.expiryDate,
    required this.onPickExpiry,
    required this.batchNoCtl,
    required this.shift,
    required this.shiftPresets,
    required this.onShiftTap,
    required this.notesCtl,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return MfgCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Details', style: RunqText.label),
          const SizedBox(height: 10),
          if (outputTracksBatches) ...[
            InkWell(
              onTap: onPickExpiry,
              borderRadius: BorderRadius.circular(10),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                decoration: BoxDecoration(
                  color: t.bgWarm,
                  border: Border.all(
                    color: expiryDate == null ? MfgColors.orangeAlert : t.hairline,
                  ),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(
                  children: [
                    Icon(Icons.event_rounded, size: 18, color: t.muted),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        expiryDate == null
                            ? 'Expiry date — required for this output'
                            : 'Expires: ${mfgPrettyDate(_isoDate(expiryDate!))}',
                        style: RunqText.body.copyWith(
                          color: expiryDate == null ? MfgColors.orangeAlert : t.ink,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 10),
          ],
          TextField(
            controller: batchNoCtl,
            textCapitalization: TextCapitalization.none,
            style: RunqText.body.copyWith(color: t.ink),
            decoration: InputDecoration(
              labelText: 'Batch no (optional — auto-generated if blank)',
              filled: true,
              fillColor: t.bgWarm,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: BorderSide(color: t.hairline),
              ),
            ),
          ),
          const SizedBox(height: 10),
          Row(children: [
            Text('Shift', style: RunqText.caption.copyWith(color: t.muted)),
            const SizedBox(width: 10),
            for (final preset in shiftPresets) ...[
              if (preset != shiftPresets.first) const SizedBox(width: 6),
              Expanded(
                child: RecordProductionShiftChip(
                  label: preset,
                  selected: shift == preset,
                  onTap: () => onShiftTap(preset),
                ),
              ),
            ],
          ]),
          const SizedBox(height: 10),
          TextField(
            controller: notesCtl,
            textCapitalization: TextCapitalization.sentences,
            maxLines: 2,
            style: RunqText.body.copyWith(color: t.ink),
            decoration: InputDecoration(
              labelText: 'Notes (optional)',
              filled: true,
              fillColor: t.bgWarm,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: BorderSide(color: t.hairline),
              ),
            ),
          ),
        ],
      ),
    );
  }

  static String _isoDate(DateTime d) => d.toIso8601String().substring(0, 10);
}

class RecordProductionPickerTile extends StatelessWidget {
  final String label;
  final String? value;
  final VoidCallback onTap;
  const RecordProductionPickerTile({
    super.key,
    required this.label,
    required this.value,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          decoration: BoxDecoration(
            color: t.bgWarm,
            border: Border.all(color: t.hairline),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Row(
            children: [
              Icon(Icons.add_chart_outlined, size: 18, color: t.muted),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(label, style: RunqText.caption.copyWith(color: t.muted, height: 1)),
                    const SizedBox(height: 2),
                    Text(
                      value ?? 'Tap to select',
                      style: RunqText.bodyStrong.copyWith(
                        color: value != null ? t.ink : t.muted2,
                        height: 1.2,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              Icon(Icons.unfold_more_rounded, size: 18, color: t.muted2),
            ],
          ),
        ),
      ),
    );
  }
}

/// Shift selector segment — the check mark is the "chosen" signal since the
/// field is optional and a plain tint would read as merely highlighted.
class RecordProductionShiftChip extends StatelessWidget {
  const RecordProductionShiftChip({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
  });
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final accent = MfgColors.brand(context);
    return InkWell(
      borderRadius: BorderRadius.circular(RunqRadii.chip),
      onTap: onTap,
      child: Container(
        constraints: const BoxConstraints(minHeight: 40),
        padding: const EdgeInsets.symmetric(horizontal: 8),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: selected ? accent.withValues(alpha: 0.12) : t.bgWarm,
          border: Border.all(
            color: selected ? accent.withValues(alpha: 0.55) : t.hairline,
            width: selected ? 1.5 : 1,
          ),
          borderRadius: BorderRadius.circular(RunqRadii.chip),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          if (selected) ...[
            Icon(Icons.check_rounded, size: 15, color: accent),
            const SizedBox(width: 5),
          ],
          Flexible(
            child: Text(label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: RunqText.body.copyWith(
                  color: selected ? t.ink : t.muted,
                  fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                )),
          ),
        ]),
      ),
    );
  }
}
