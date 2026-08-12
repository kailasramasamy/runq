// Create / edit a labour contract.
//
// No employee record is involved: a contract carries its own name and a
// lead person. The type picker drives everything below it —
//
//   Daily wage   one rate, one worker (the lead person)
//   Task         one agreed amount, nobody tracked
//   Crew         a list of people, each with their own rate
//
// End date is optional throughout. Most site work runs until it is done,
// so leaving it blank is the normal case rather than an omission.

library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../api/api_client.dart';
import '../../../api/hr_contract_models.dart';
import '../../../api/hr_repo.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import '../../../widgets/runq_snack.dart';
import 'hr_colors.dart';
import 'hr_form.dart';
import 'hr_setup_widgets.dart';
import 'hr_widgets.dart';

Future<bool?> showHrContractFormSheet(
  BuildContext context, {
  HrContract? existing,
}) {
  return showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _ContractFormSheet(existing: existing),
  );
}

/// A crew row being edited before the contract exists.
class _DraftMember {
  final TextEditingController name;
  final TextEditingController role;
  final TextEditingController rate;
  _DraftMember()
      : name = TextEditingController(),
        role = TextEditingController(),
        rate = TextEditingController();

  bool get isValid =>
      name.text.trim().isNotEmpty && (double.tryParse(rate.text.trim()) ?? 0) > 0;

  Map<String, dynamic> toJson() => {
        'name': name.text.trim(),
        if (role.text.trim().isNotEmpty) 'role': role.text.trim(),
        'dailyRate': double.parse(rate.text.trim()),
      };

  void dispose() {
    name.dispose();
    role.dispose();
    rate.dispose();
  }
}

class _ContractFormSheet extends ConsumerStatefulWidget {
  final HrContract? existing;
  const _ContractFormSheet({this.existing});

  @override
  ConsumerState<_ContractFormSheet> createState() => _ContractFormSheetState();
}

class _ContractFormSheetState extends ConsumerState<_ContractFormSheet> {
  final _name = TextEditingController();
  final _lead = TextEditingController();
  final _phone = TextEditingController();
  final _amount = TextEditingController();
  final _notes = TextEditingController();
  late DateTime _start;
  DateTime? _end;
  String _type = 'solo_daily';
  final _crew = <_DraftMember>[];
  bool _saving = false;

  bool get _isEdit => widget.existing != null;
  bool get _isTask => _type == 'task_lumpsum';
  bool get _isCrew => _type == 'crew_daily';

  @override
  void initState() {
    super.initState();
    final e = widget.existing;
    final now = DateTime.now();
    _start = e?.startDate ?? DateTime(now.year, now.month, now.day);
    _end = e?.endDate;
    if (e != null) {
      _name.text = e.name;
      _lead.text = e.leadPersonName;
      _phone.text = e.leadPersonPhone ?? '';
      _type = e.contractType;
      _notes.text = e.notes ?? '';
      if (e.isTask) _amount.text = _trim(e.fixedAmount ?? 0);
    } else {
      _crew.add(_DraftMember());
    }
  }

  @override
  void dispose() {
    for (final c in [_name, _lead, _phone, _amount, _notes]) {
      c.dispose();
    }
    for (final m in _crew) {
      m.dispose();
    }
    super.dispose();
  }

  static String _trim(double v) =>
      v == v.roundToDouble() ? v.round().toString() : v.toString();

  double? get _amountValue {
    final v = double.tryParse(_amount.text.trim());
    return (v == null || v <= 0) ? null : v;
  }

  bool get _canSave {
    if (_name.text.trim().isEmpty || _lead.text.trim().isEmpty) return false;
    if (_end != null && _end!.isBefore(_start)) return false;
    // On edit, rates live in the crew list on the detail screen — only a
    // task's agreed amount is still editable here.
    if (_isEdit) return _isTask ? _amountValue != null : true;
    if (_isCrew) return _crew.isNotEmpty && _crew.every((m) => m.isValid);
    return _amountValue != null;
  }

  @override
  Widget build(BuildContext context) {
    return HrEditorSheet(
      title: _isEdit ? 'Edit contract' : 'New contract',
      saveLabel: _isEdit ? 'Save changes' : 'Create contract',
      saving: _saving,
      canSave: _canSave,
      onSave: _save,
      children: [
        HrFormSection(
          children: [
            HrTextField(
              label: 'Contract name',
              hint: 'Warehouse flooring',
              controller: _name,
              textCapitalization: TextCapitalization.sentences,
              onChanged: (_) => setState(() {}),
            ),
            HrTextField(
              label: 'Lead person',
              hint: 'Who you deal with',
              controller: _lead,
              textCapitalization: TextCapitalization.words,
              onChanged: (_) => setState(() {}),
            ),
            HrTextField(
              label: 'Phone',
              hint: 'Optional',
              controller: _phone,
              keyboard: TextInputType.phone,
              textCapitalization: TextCapitalization.none,
            ),
          ],
        ),
        const SizedBox(height: 12),
        if (!_isEdit) ...[
          _typePicker(),
          const SizedBox(height: 12),
        ],
        _termSection(),
        const SizedBox(height: 12),
        _compSection(),
        const SizedBox(height: 12),
        HrFormSection(
          children: [
            HrTextField(
              label: 'Notes',
              controller: _notes,
              maxLines: 2,
              hint: 'Optional',
            ),
          ],
        ),
      ],
    );
  }

  Widget _typePicker() {
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 4, bottom: 8),
          child: Text('How is this paid?',
              style: RunqText.label.copyWith(color: t.muted2)),
        ),
        for (final type in kContractTypes)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: _TypeCard(
              type: type,
              selected: _type == type,
              onTap: () => setState(() {
                _type = type;
                _amount.clear();
              }),
            ),
          ),
      ],
    );
  }

  Widget _termSection() {
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        HrFormSection(
          title: 'Term',
          children: [
            HrDateField(
              label: 'Start date',
              value: _start,
              required: true,
              onChanged: (d) => setState(() {
                if (d == null) return;
                _start = d;
                if (_end != null && _end!.isBefore(_start)) _end = _start;
              }),
            ),
            HrDateField(
              label: 'End date',
              value: _end,
              hint: 'Runs until complete',
              onChanged: (d) => setState(() => _end = d),
            ),
          ],
        ),
        const SizedBox(height: 6),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  _end == null
                      ? 'Open-ended — days keep counting until you settle, and '
                          'settling sets the end date.'
                      : 'Days count from the start date to the end date.',
                  style: RunqText.caption.copyWith(color: t.muted2),
                ),
              ),
              if (_end != null)
                GestureDetector(
                  onTap: () => setState(() => _end = null),
                  child: Text('Clear',
                      style: RunqText.caption.copyWith(
                        color: HrColors.brand(context),
                        fontWeight: FontWeight.w700,
                      )),
                ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _compSection() {
    if (_isTask) {
      return HrFormSection(
        title: 'Amount',
        children: [
          HrTextField(
            label: 'Agreed amount (₹)',
            hint: '15000',
            controller: _amount,
            keyboard: const TextInputType.numberWithOptions(decimal: true),
            formatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
            textCapitalization: TextCapitalization.none,
            onChanged: (_) => setState(() {}),
          ),
        ],
      );
    }
    if (_isEdit) {
      // Rates move through the crew list on the detail screen, where a
      // change can be reasoned about against days already logged.
      final t = RT(context);
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.info_outline, size: 14, color: t.muted2),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                'Daily rates are managed in the crew list on the contract.',
                style: RunqText.caption.copyWith(color: t.muted2),
              ),
            ),
          ],
        ),
      );
    }
    if (!_isCrew) {
      return HrFormSection(
        title: 'Rate',
        children: [
          HrTextField(
            label: 'Daily rate (₹)',
            hint: '600',
            controller: _amount,
            keyboard: const TextInputType.numberWithOptions(decimal: true),
            formatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
            textCapitalization: TextCapitalization.none,
            onChanged: (_) => setState(() {}),
          ),
        ],
      );
    }
    return _crewEditor();
  }

  Widget _crewEditor() {
    final t = RT(context);
    final total = _crew
        .where((m) => m.isValid)
        .fold<double>(0, (s, m) => s + double.parse(m.rate.text.trim()));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Padding(
              padding: const EdgeInsets.only(left: 4),
              child: Text('Crew', style: RunqText.label.copyWith(color: t.muted2)),
            ),
            const Spacer(),
            if (total > 0)
              Text('${hrFormatINR(total)}/day total',
                  style: RunqText.caption.copyWith(color: t.muted)),
          ],
        ),
        const SizedBox(height: 8),
        for (var i = 0; i < _crew.length; i++)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: _CrewRow(
              member: _crew[i],
              onChanged: () => setState(() {}),
              onRemove: _crew.length == 1
                  ? null
                  : () => setState(() => _crew.removeAt(i).dispose()),
            ),
          ),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: () => setState(() => _crew.add(_DraftMember())),
            icon: const Icon(Icons.add_rounded, size: 18),
            label: const Text('Add person'),
            style: TextButton.styleFrom(foregroundColor: HrColors.brand(context)),
          ),
        ),
      ],
    );
  }

  Future<void> _save() async {
    if (_saving || !_canSave) return;
    setState(() => _saving = true);
    try {
      if (_isEdit) {
        await hrRepo.updateContract(
          widget.existing!.id,
          name: _name.text.trim(),
          leadPersonName: _lead.text.trim(),
          leadPersonPhone: _phone.text.trim(),
          startDate: _start,
          endDate: _end,
          fixedAmount: _isTask ? _amountValue : null,
          notes: _notes.text.trim(),
        );
      } else {
        await hrRepo.createContract(
          name: _name.text.trim(),
          leadPersonName: _lead.text.trim(),
          leadPersonPhone: _phone.text.trim(),
          contractType: _type,
          startDate: _start,
          endDate: _end,
          fixedAmount: _isTask ? _amountValue : null,
          dailyRate: _type == 'solo_daily' ? _amountValue : null,
          members: _isCrew ? _crew.map((m) => m.toJson()).toList() : null,
          notes: _notes.text.trim(),
        );
      }
      if (!mounted) return;
      Navigator.of(context).pop(true);
      showRunqSnack(
        context,
        _isEdit ? 'Contract updated' : 'Contract created',
        kind: SnackKind.success,
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      showRunqSnack(context, e.message, kind: SnackKind.error);
    }
  }
}

class _TypeCard extends StatelessWidget {
  final String type;
  final bool selected;
  final VoidCallback onTap;
  const _TypeCard({
    required this.type,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = HrColors.brand(context);
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: selected ? HrColors.tealSubtle : t.surface,
          borderRadius: BorderRadius.circular(RunqRadii.smallCard),
          border: Border.all(
            color: selected ? brand : t.hairline,
            width: selected ? 1.5 : 0.5,
          ),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(
              selected ? Icons.radio_button_checked : Icons.radio_button_unchecked,
              size: 18,
              color: selected ? brand : t.muted2,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    contractTypeLabel(type),
                    style: RunqText.bodyStrong
                        .copyWith(color: selected ? brand : t.ink),
                  ),
                  const SizedBox(height: 2),
                  Text(contractTypeBlurb(type),
                      style: RunqText.caption.copyWith(color: t.muted)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CrewRow extends StatelessWidget {
  final _DraftMember member;
  final VoidCallback onChanged;
  final VoidCallback? onRemove;
  const _CrewRow({
    required this.member,
    required this.onChanged,
    required this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 4, 4, 10),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: t.hairline, width: 0.5),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: _bare(context, member.name, 'Name', TextCapitalization.words),
              ),
              if (onRemove != null)
                IconButton(
                  visualDensity: VisualDensity.compact,
                  onPressed: onRemove,
                  icon: Icon(Icons.close_rounded, size: 16, color: t.muted2),
                ),
            ],
          ),
          Row(
            children: [
              Expanded(
                child: _bare(context, member.role, 'Role (mason)',
                    TextCapitalization.words),
              ),
              const SizedBox(width: 10),
              SizedBox(
                width: 110,
                child: _bare(context, member.rate, '₹/day',
                    TextCapitalization.none, numeric: true),
              ),
              const SizedBox(width: 8),
            ],
          ),
        ],
      ),
    );
  }

  Widget _bare(
    BuildContext context,
    TextEditingController c,
    String hint,
    TextCapitalization caps, {
    bool numeric = false,
  }) {
    final t = RT(context);
    return TextField(
      controller: c,
      onChanged: (_) => onChanged(),
      textCapitalization: caps,
      keyboardType:
          numeric ? const TextInputType.numberWithOptions(decimal: true) : null,
      inputFormatters:
          numeric ? [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))] : null,
      style: RunqText.body.copyWith(color: t.ink),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: RunqText.body.copyWith(color: t.muted2),
        isDense: true,
        border: InputBorder.none,
        enabledBorder: InputBorder.none,
        focusedBorder: InputBorder.none,
        contentPadding: const EdgeInsets.symmetric(vertical: 8),
      ),
    );
  }
}
