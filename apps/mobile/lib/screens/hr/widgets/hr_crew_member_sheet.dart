// Add or edit one person on a day-rate contract.
//
// Removing someone is offered only while they hold no advances — the server
// refuses otherwise, because deleting them would cascade their day log away
// and orphan money already handed over. Setting a leaving date is the
// alternative it points to, and it is the right answer anyway: it stops the
// accrual without erasing the days already worked.

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
import 'hr_form.dart';
import 'hr_setup_widgets.dart';

Future<bool?> showHrCrewMemberSheet(
  BuildContext context, {
  required String contractId,
  HrContractMember? existing,
  bool allowRemove = false,
}) {
  return showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _CrewMemberSheet(
      contractId: contractId,
      existing: existing,
      allowRemove: allowRemove,
    ),
  );
}

class _CrewMemberSheet extends ConsumerStatefulWidget {
  final String contractId;
  final HrContractMember? existing;
  final bool allowRemove;
  const _CrewMemberSheet({
    required this.contractId,
    this.existing,
    required this.allowRemove,
  });

  @override
  ConsumerState<_CrewMemberSheet> createState() => _CrewMemberSheetState();
}

class _CrewMemberSheetState extends ConsumerState<_CrewMemberSheet> {
  final _name = TextEditingController();
  final _role = TextEditingController();
  final _rate = TextEditingController();
  DateTime? _joinedOn, _leftOn;
  bool _saving = false;

  bool get _isEdit => widget.existing != null;

  @override
  void initState() {
    super.initState();
    final m = widget.existing;
    if (m != null) {
      _name.text = m.name;
      _role.text = m.role ?? '';
      _rate.text = m.dailyRate == m.dailyRate.roundToDouble()
          ? m.dailyRate.round().toString()
          : m.dailyRate.toString();
      _joinedOn = m.joinedOn;
      _leftOn = m.leftOn;
    }
  }

  @override
  void dispose() {
    _name.dispose();
    _role.dispose();
    _rate.dispose();
    super.dispose();
  }

  double? get _rateValue {
    final v = double.tryParse(_rate.text.trim());
    return (v == null || v <= 0) ? null : v;
  }

  bool get _canSave => _name.text.trim().isNotEmpty && _rateValue != null;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return HrEditorSheet(
      title: _isEdit ? 'Edit person' : 'Add person',
      saveLabel: _isEdit ? 'Save changes' : 'Add to crew',
      saving: _saving,
      canSave: _canSave && !_saving,
      onSave: _save,
      children: [
        HrFormSection(
          children: [
            HrTextField(
              label: 'Name',
              controller: _name,
              textCapitalization: TextCapitalization.words,
              onChanged: (_) => setState(() {}),
            ),
            HrTextField(
              label: 'Role',
              hint: 'Mason, helper…',
              controller: _role,
              textCapitalization: TextCapitalization.words,
            ),
            HrTextField(
              label: 'Daily rate (₹)',
              hint: '800',
              controller: _rate,
              keyboard: const TextInputType.numberWithOptions(decimal: true),
              formatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
              textCapitalization: TextCapitalization.none,
              onChanged: (_) => setState(() {}),
            ),
          ],
        ),
        const SizedBox(height: 12),
        HrFormSection(
          title: 'On the job',
          children: [
            HrDateField(
              label: 'Joined on',
              value: _joinedOn,
              hint: 'From the contract start',
              onChanged: (d) => setState(() => _joinedOn = d),
            ),
            HrDateField(
              label: 'Left on',
              value: _leftOn,
              hint: 'Still working',
              onChanged: (d) => setState(() => _leftOn = d),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: Text(
            'Days only count between these dates. Leave them blank to follow '
            'the contract term.',
            style: RunqText.caption.copyWith(color: t.muted2),
          ),
        ),
        if (_isEdit && widget.allowRemove) ...[
          const SizedBox(height: 16),
          Center(
            child: TextButton.icon(
              onPressed: _saving ? null : _remove,
              icon: const Icon(Icons.delete_outline_rounded, size: 18),
              label: const Text('Remove from crew'),
              style: TextButton.styleFrom(
                  foregroundColor: const Color(0xFFDC2626)),
            ),
          ),
        ],
      ],
    );
  }

  Future<void> _save() async {
    if (_saving || !_canSave) return;
    setState(() => _saving = true);
    try {
      if (_isEdit) {
        await hrRepo.updateMember(
          widget.existing!.id,
          name: _name.text.trim(),
          role: _role.text.trim(),
          dailyRate: _rateValue!,
          joinedOn: _joinedOn,
          leftOn: _leftOn,
        );
      } else {
        await hrRepo.addMember(
          widget.contractId,
          name: _name.text.trim(),
          role: _role.text.trim(),
          dailyRate: _rateValue!,
          joinedOn: _joinedOn,
        );
      }
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      showRunqSnack(context, e.message, kind: SnackKind.error);
    }
  }

  Future<void> _remove() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Remove ${widget.existing!.name}?'),
        content: const Text(
          'Their days on this contract are removed too. If they have already '
          'worked, set a leaving date instead so the record survives.',
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: const Text('Keep')),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: TextButton.styleFrom(foregroundColor: const Color(0xFFDC2626)),
            child: const Text('Remove'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _saving = true);
    try {
      await hrRepo.removeMember(widget.existing!.id);
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      showRunqSnack(context, e.message, kind: SnackKind.error);
    }
  }
}
