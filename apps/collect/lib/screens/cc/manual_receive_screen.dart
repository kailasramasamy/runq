import 'package:flutter/material.dart';
import '../../theme/dhenu_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../api/mp_repo.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/node_picker.dart';
import '../../widgets/primary_action.dart';
import '../../widgets/shift_toggle.dart';

/// Dedicated screen for receiving milk that arrived WITHOUT a dispatch entry —
/// the VMCC operator forgot to mark dispatch, or doesn't use the app (works off
/// a notebook). Pick the VMCC and record the actual qty/FAT/SNF measured at CC.
class ManualReceiveScreen extends ConsumerStatefulWidget {
  const ManualReceiveScreen({super.key, required this.vmccs, required this.ccNodeId});
  final List<MpNode> vmccs;
  final String ccNodeId;

  @override
  ConsumerState<ManualReceiveScreen> createState() => _ManualReceiveScreenState();
}

class _ManualReceiveScreenState extends ConsumerState<ManualReceiveScreen> {
  late String _vmccId = widget.vmccs.first.id;
  DateTime _date = DateTime.now();
  Shift _shift = DateTime.now().hour < 12 ? Shift.am : Shift.pm;
  final _qty = TextEditingController();
  final _fat = TextEditingController();
  final _snf = TextEditingController();
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _qty.dispose();
    _fat.dispose();
    _snf.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final qty = double.tryParse(_qty.text);
    if (qty == null || qty <= 0) {
      setState(() => _error = 'Enter a valid quantity');
      return;
    }
    setState(() { _saving = true; _error = null; });
    try {
      await mpRepo.directReceive({
        'fromNodeId': _vmccId,
        'toNodeId': widget.ccNodeId,
        'collectionDate': isoDate(_date),
        'shift': _shift.name,
        'qty': qty,
        if (double.tryParse(_fat.text) != null) 'fat': double.parse(_fat.text),
        if (double.tryParse(_snf.text) != null) 'snf': double.parse(_snf.text),
      });
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      setState(() { _saving = false; _error = '$e'; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    return Scaffold(
      backgroundColor: t.surface,
      appBar: AppBar(title: const Text('Manual receive')),
      body: SafeArea(
        child: Column(children: [
          Expanded(child: ListView(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: const EdgeInsets.all(DhenuSpacing.screen),
            children: [
              Container(
                padding: const EdgeInsets.all(DhenuSpacing.md),
                decoration: BoxDecoration(
                  color: t.brand.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(DhenuRadii.input),
                ),
                child: Row(children: [
                  Icon(DhenuIcons.info, size: 18, color: t.brand),
                  const SizedBox(width: DhenuSpacing.sm),
                  Expanded(child: Text(
                    'Use this only when milk arrived with no dispatch entry in the app.',
                    style: DhenuText.caption.copyWith(color: t.inkSoft),
                  )),
                ]),
              ),
              const SizedBox(height: DhenuSpacing.lg),
              DhenuCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('MEASURED AT CC', style: DhenuText.label.copyWith(color: t.brand)),
                const SizedBox(height: DhenuSpacing.md),
                _vmccField(t),
                const SizedBox(height: DhenuSpacing.md),
                _dateField(t),
                const SizedBox(height: DhenuSpacing.md),
                Row(children: [
                  Text('Shift', style: DhenuText.label.copyWith(color: t.inkSoft)),
                  const Spacer(),
                  ShiftToggle(value: _shift, onChanged: (s) => setState(() => _shift = s)),
                ]),
                const SizedBox(height: DhenuSpacing.md),
                _field(_qty, 'Quantity (L)'),
                const SizedBox(height: DhenuSpacing.md),
                Row(children: [
                  Expanded(child: _field(_fat, 'FAT % (optional)')),
                  const SizedBox(width: DhenuSpacing.md),
                  Expanded(child: _field(_snf, 'SNF % (optional)')),
                ]),
              ])),
              if (_error != null) ...[
                const SizedBox(height: DhenuSpacing.sm),
                Text(_error!, style: DhenuText.caption.copyWith(color: t.gradeC)),
              ],
            ],
          )),
          Padding(
            padding: const EdgeInsets.all(DhenuSpacing.screen),
            child: PrimaryAction(label: 'Mark received', onPressed: _save, loading: _saving),
          ),
        ]),
      ),
    );
  }

  Widget _vmccField(DhenuTokens t) {
    final selected = widget.vmccs.firstWhere((v) => v.id == _vmccId, orElse: () => widget.vmccs.first);
    return InkWell(
      onTap: _pickVmcc,
      borderRadius: BorderRadius.circular(DhenuRadii.input),
      child: InputDecorator(
        decoration: const InputDecoration(labelText: 'From VMCC'),
        child: Row(children: [
          Expanded(child: Text(selected.name, style: DhenuText.body.copyWith(color: t.ink))),
          Icon(DhenuIcons.chevronDown, color: t.inkSoft),
        ]),
      ),
    );
  }

  Future<void> _pickVmcc() async {
    final picked = await showNodePicker(context,
        nodes: widget.vmccs, selectedId: _vmccId, title: 'From VMCC');
    if (picked != null) setState(() => _vmccId = picked.id);
  }

  Widget _dateField(DhenuTokens t) => InkWell(
        onTap: _pickDate,
        borderRadius: BorderRadius.circular(DhenuRadii.input),
        child: InputDecorator(
          decoration: const InputDecoration(labelText: 'Collection date'),
          child: Row(children: [
            Expanded(child: Text(prettyDate(isoDate(_date)), style: DhenuText.body.copyWith(color: t.ink))),
            Icon(DhenuIcons.calendar, size: 18, color: t.inkSoft),
          ]),
        ),
      );

  // Backfill only: today is the latest selectable date, no future entries.
  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime.now().subtract(const Duration(days: 365)),
      lastDate: DateTime.now(),
    );
    if (picked != null) setState(() => _date = picked);
  }

  Widget _field(TextEditingController ctrl, String hint) => TextField(
        controller: ctrl,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        textCapitalization: TextCapitalization.none,
        decoration: InputDecoration(labelText: hint),
      );
}
