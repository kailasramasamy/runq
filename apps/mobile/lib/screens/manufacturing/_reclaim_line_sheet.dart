// Line entry sheet + draft model for the Reclaim screen.
//
// Split out of `reclaim_screen.dart` to keep that file under the house
// 500-line cap, mirroring the `_record_production_*` split.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../api/manufacturing_models.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/mfg_item_picker.dart';
import 'widgets/mfg_primitives.dart';

String reclaimFmtQty(double v) =>
    v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(3);

/// One teardown line. `recoveredUom` is carried for display only — the server
/// takes qty in the recovered item's own unit.
class ReclaimDraftLine {
  ReclaimDraftLine({
    required this.fgItemId,
    required this.fgItemName,
    required this.fgBatchNo,
    required this.fgQty,
    required this.recoveredItemId,
    required this.recoveredItemName,
    required this.recoveredUom,
    required this.recoveredBatchNo,
    required this.recoveredQty,
    required this.expiryDate,
  });

  final String fgItemId;
  final String fgItemName;
  final String? fgBatchNo;
  final double fgQty;
  final String recoveredItemId;
  final String recoveredItemName;
  final String recoveredUom;
  final String? recoveredBatchNo;
  final double recoveredQty;
  final String? expiryDate;

  Map<String, dynamic> toJson() => {
        'fgItemId': fgItemId,
        if (fgBatchNo != null && fgBatchNo!.isNotEmpty) 'fgBatchNo': fgBatchNo,
        'fgQty': fgQty,
        'recoveredItemId': recoveredItemId,
        if (recoveredBatchNo != null && recoveredBatchNo!.isNotEmpty)
          'recoveredBatchNo': recoveredBatchNo,
        'recoveredQty': recoveredQty,
        if (expiryDate != null) 'expiryDate': expiryDate,
      };
}

// ── Line entry sheet ──────────────────────────────────────────────────────

class ReclaimLineSheet extends StatefulWidget {
  const ReclaimLineSheet({super.key, this.existing});
  final ReclaimDraftLine? existing;

  @override
  State<ReclaimLineSheet> createState() => ReclaimLineSheetState();
}

class ReclaimLineSheetState extends State<ReclaimLineSheet> {
  MfgItemRow? _fgItem;
  MfgItemRow? _recoveredItem;
  final _fgQtyCtl = TextEditingController();
  final _fgBatchCtl = TextEditingController();
  final _recoveredQtyCtl = TextEditingController();
  final _recoveredBatchCtl = TextEditingController();
  DateTime? _expiry;

  String? _fgName;
  String? _recoveredName;
  String _recoveredUom = '';

  @override
  void initState() {
    super.initState();
    final e = widget.existing;
    if (e == null) return;
    _fgName = e.fgItemName;
    _recoveredName = e.recoveredItemName;
    _recoveredUom = e.recoveredUom;
    _fgQtyCtl.text = reclaimFmtQty(e.fgQty);
    _fgBatchCtl.text = e.fgBatchNo ?? '';
    _recoveredQtyCtl.text = reclaimFmtQty(e.recoveredQty);
    _recoveredBatchCtl.text = e.recoveredBatchNo ?? '';
    if (e.expiryDate != null) _expiry = DateTime.tryParse(e.expiryDate!);
  }

  @override
  void dispose() {
    _fgQtyCtl.dispose();
    _fgBatchCtl.dispose();
    _recoveredQtyCtl.dispose();
    _recoveredBatchCtl.dispose();
    super.dispose();
  }

  String get _fgId => _fgItem?.id ?? widget.existing?.fgItemId ?? '';
  String get _recoveredId => _recoveredItem?.id ?? widget.existing?.recoveredItemId ?? '';

  bool get _valid =>
      _fgId.isNotEmpty &&
      _recoveredId.isNotEmpty &&
      _fgId != _recoveredId &&
      (double.tryParse(_fgQtyCtl.text.trim()) ?? 0) > 0 &&
      (double.tryParse(_recoveredQtyCtl.text.trim()) ?? 0) > 0;

  Future<void> _pickFg() async {
    final picked = await showMfgItemPicker(
      context,
      title: 'What was opened',
      itemClassGroup: 'finished',
    );
    if (picked == null) return;
    setState(() {
      _fgItem = picked;
      _fgName = picked.name;
    });
  }

  Future<void> _pickRecovered() async {
    final picked = await showMfgItemPicker(
      context,
      title: 'Recovered as',
      itemClassGroup: 'inputs',
    );
    if (picked == null) return;
    setState(() {
      _recoveredItem = picked;
      _recoveredName = picked.name;
      _recoveredUom = picked.uom;
    });
  }

  Future<void> _pickExpiry() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _expiry ?? now.add(const Duration(days: 2)),
      firstDate: now.subtract(const Duration(days: 1)),
      lastDate: now.add(const Duration(days: 365)),
    );
    if (picked != null) setState(() => _expiry = picked);
  }

  void _save() {
    if (!_valid) return;
    Navigator.of(context).pop(ReclaimDraftLine(
      fgItemId: _fgId,
      fgItemName: _fgName ?? '',
      fgBatchNo: _fgBatchCtl.text.trim(),
      fgQty: double.parse(_fgQtyCtl.text.trim()),
      recoveredItemId: _recoveredId,
      recoveredItemName: _recoveredName ?? '',
      recoveredUom: _recoveredUom,
      recoveredBatchNo: _recoveredBatchCtl.text.trim(),
      recoveredQty: double.parse(_recoveredQtyCtl.text.trim()),
      expiryDate: _expiry?.toIso8601String().substring(0, 10),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final insets = MediaQuery.of(context).viewInsets;
    return Padding(
      padding: EdgeInsets.only(bottom: insets.bottom),
      child: Container(
        decoration: BoxDecoration(
          color: t.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        ),
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 20),
        child: SingleChildScrollView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Reclaim line', style: RunqText.h3.copyWith(color: t.ink)),
              const SizedBox(height: 14),
              _PickerRow(label: 'Opened', value: _fgName, onTap: _pickFg),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(child: _QtyField(ctl: _fgQtyCtl, label: 'Qty opened', onChanged: () => setState(() {}))),
                  const SizedBox(width: 10),
                  Expanded(child: _TextFieldSmall(ctl: _fgBatchCtl, label: 'Batch')),
                ],
              ),
              const SizedBox(height: 18),
              _PickerRow(label: 'Recovered as', value: _recoveredName, onTap: _pickRecovered),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: _QtyField(
                      ctl: _recoveredQtyCtl,
                      label: _recoveredUom.isEmpty ? 'Qty recovered' : 'Qty recovered ($_recoveredUom)',
                      onChanged: () => setState(() {}),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(child: _TextFieldSmall(ctl: _recoveredBatchCtl, label: 'New batch')),
                ],
              ),
              const SizedBox(height: 10),
              InkWell(
                onTap: _pickExpiry,
                borderRadius: BorderRadius.circular(10),
                child: Container(
                  padding: const EdgeInsets.fromLTRB(12, 13, 12, 13),
                  decoration: BoxDecoration(
                    color: t.bgWarm,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: t.hairline),
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.event_outlined, size: 17, color: t.muted),
                      const SizedBox(width: 10),
                      Text(
                        _expiry == null
                            ? 'Expiry (reclaimed stock spoils sooner)'
                            : _expiry!.toIso8601String().substring(0, 10),
                        style: RunqText.body.copyWith(
                          color: _expiry == null ? t.muted : t.ink,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 18),
              MfgPrimaryButton(label: 'Save line', onPressed: _valid ? _save : null),
            ],
          ),
        ),
      ),
    );
  }
}

class _PickerRow extends StatelessWidget {
  const _PickerRow({required this.label, required this.value, required this.onTap});
  final String label;
  final String? value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 13, 12, 13),
        decoration: BoxDecoration(
          color: t.bgWarm,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: t.hairline),
        ),
        child: Row(
          children: [
            Text('$label  ', style: RunqText.caption.copyWith(color: t.muted)),
            Expanded(
              child: Text(
                value ?? 'Tap to pick',
                style: RunqText.bodyStrong.copyWith(color: value == null ? t.muted : t.ink),
                overflow: TextOverflow.ellipsis,
              ),
            ),
            Icon(Icons.chevron_right_rounded, size: 18, color: t.muted),
          ],
        ),
      ),
    );
  }
}

class _QtyField extends StatelessWidget {
  const _QtyField({required this.ctl, required this.label, required this.onChanged});
  final TextEditingController ctl;
  final String label;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return TextField(
      controller: ctl,
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      textCapitalization: TextCapitalization.none,
      inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'^\d*\.?\d*'))],
      onChanged: (_) => onChanged(),
      decoration: InputDecoration(
        labelText: label,
        filled: true,
        fillColor: t.bgWarm,
        isDense: true,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: t.hairline),
        ),
      ),
    );
  }
}

class _TextFieldSmall extends StatelessWidget {
  const _TextFieldSmall({required this.ctl, required this.label});
  final TextEditingController ctl;
  final String label;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return TextField(
      controller: ctl,
      textCapitalization: TextCapitalization.none,
      decoration: InputDecoration(
        labelText: label,
        filled: true,
        fillColor: t.bgWarm,
        isDense: true,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: t.hairline),
        ),
      ),
    );
  }
}
