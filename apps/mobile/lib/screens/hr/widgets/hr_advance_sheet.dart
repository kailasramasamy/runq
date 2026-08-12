// Record an advance against a running contract.
//
// Cash is the default because that is how a factory floor actually pays a
// mid-term advance. Any other method needs a bank account so the journal
// entry has something to credit — the server refuses otherwise.

library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../api/api_client.dart';
import '../../../api/hr_contract_models.dart';
import '../../../api/hr_repo.dart';
import '../../../api/models.dart';
import '../../../providers/data_providers.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import '../../../widgets/runq_snack.dart';
import 'hr_form.dart';
import 'hr_setup_widgets.dart';
import 'hr_widgets.dart';

Future<bool?> showHrAdvanceSheet(BuildContext context, HrContract contract) {
  return showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _AdvanceSheet(contract: contract),
  );
}

class _AdvanceSheet extends ConsumerStatefulWidget {
  final HrContract contract;
  const _AdvanceSheet({required this.contract});

  @override
  ConsumerState<_AdvanceSheet> createState() => _AdvanceSheetState();
}

class _AdvanceSheetState extends ConsumerState<_AdvanceSheet> {
  final _amount = TextEditingController();
  final _reference = TextEditingController();
  final _notes = TextEditingController();
  late DateTime _paidOn;
  String _method = 'cash';
  String? _bankAccountId;
  String? _memberId;
  bool _saving = false;

  static const _methods = ['cash', 'bank_transfer', 'upi', 'cheque'];

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _paidOn = DateTime(now.year, now.month, now.day);
    // A solo contract has exactly one person, so attributing the advance is
    // automatic — only a crew needs to be asked.
    final members = widget.contract.members;
    if (members.length == 1) _memberId = members.first.id;
  }

  @override
  void dispose() {
    _amount.dispose();
    _reference.dispose();
    _notes.dispose();
    super.dispose();
  }

  double? get _amountValue {
    final v = double.tryParse(_amount.text.trim());
    return (v == null || v <= 0) ? null : v;
  }

  bool get _needsBank => _method != 'cash';

  /// A task contract has no crew, so an advance there is simply against the
  /// contract and lands on the lead's settlement line.
  bool get _needsMember => widget.contract.members.length > 1;

  HrContractMember? get _selectedMember {
    for (final m in widget.contract.members) {
      if (m.id == _memberId) return m;
    }
    return null;
  }
  bool get _canSave =>
      _amountValue != null &&
      (!_needsBank || _bankAccountId != null) &&
      (!_needsMember || _memberId != null) &&
      !_saving;

  static String _methodLabel(String s) => switch (s) {
        'cash' => 'Cash',
        'bank_transfer' => 'Bank transfer',
        'upi' => 'UPI',
        'cheque' => 'Cheque',
        _ => s,
      };

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final banks = ref.watch(bankAccountsProvider).asData?.value ?? const <BankAccount>[];
    BankAccount? selectedBank;
    for (final b in banks) {
      if (b.id == _bankAccountId) { selectedBank = b; break; }
    }

    return HrEditorSheet(
      title: 'Record advance',
      saveLabel: 'Pay advance',
      saving: _saving,
      canSave: _canSave,
      onSave: _save,
      children: [
        _context(t),
        const SizedBox(height: 12),
        HrFormSection(
          children: [
            HrTextField(
              label: 'Amount (₹)',
              hint: '2000',
              controller: _amount,
              keyboard: const TextInputType.numberWithOptions(decimal: true),
              formatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
              textCapitalization: TextCapitalization.none,
              onChanged: (_) => setState(() {}),
            ),
            HrDateField(
              label: 'Paid on',
              value: _paidOn,
              required: true,
              onChanged: (d) => setState(() => _paidOn = d ?? _paidOn),
            ),
            HrSelectField<String>(
              label: 'Paid by',
              value: _method,
              options: _methods,
              display: _methodLabel,
              onChanged: (m) => setState(() {
                _method = m ?? 'cash';
                if (!_needsBank) _bankAccountId = null;
              }),
              required: true,
            ),
            if (widget.contract.members.length > 1)
              HrSelectField<HrContractMember>(
                label: 'Paid to',
                value: _selectedMember,
                options: widget.contract.members,
                display: (m) =>
                    m.role == null ? m.name : '${m.name} · ${m.role}',
                onChanged: (m) => setState(() => _memberId = m?.id),
                required: true,
                hint: 'Which crew member',
              ),
            if (_needsBank)
              HrSelectField<BankAccount>(
                label: 'From account',
                value: selectedBank,
                options: banks,
                searchable: banks.length > 6,
                display: (b) => '${b.name} · ${b.bankName}',
                onChanged: (b) => setState(() => _bankAccountId = b?.id),
                required: true,
              ),
            HrTextField(
              label: 'Reference',
              controller: _reference,
              hint: 'Optional — voucher or UTR',
              textCapitalization: TextCapitalization.characters,
            ),
            HrTextField(
              label: 'Notes',
              controller: _notes,
              maxLines: 2,
              hint: 'Optional',
            ),
          ],
        ),
        const SizedBox(height: 10),
        _ledgerNote(t),
      ],
    );
  }

  Widget _context(RunqTokens t) {
    final c = widget.contract;
    final already = c.balance?.advancesPaid ?? 0;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: t.inputFill,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: t.hairline, width: 0.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(c.name, style: RunqText.bodyStrong.copyWith(color: t.ink)),
          const SizedBox(height: 2),
          Text(
            '${c.contractNumber} · ${c.leadPersonName}',
            style: RunqText.caption.copyWith(color: t.muted),
          ),
          if (already > 0) ...[
            const SizedBox(height: 6),
            Text(
              'Already advanced: ${hrFormatINR(already)}',
              style: RunqText.caption.copyWith(color: t.muted),
            ),
          ],
        ],
      ),
    );
  }

  /// Says plainly that this is not an expense yet. Worth the two lines —
  /// "we paid him ₹2,000, why isn't it in wages?" is the obvious question.
  Widget _ledgerNote(RunqTokens t) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(Icons.info_outline, size: 14, color: t.muted2),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            'Recorded as money owed back, not a wage expense. It is recovered '
            'automatically when the contract is settled.',
            style: RunqText.caption.copyWith(color: t.muted2),
          ),
        ),
      ],
    );
  }

  Future<void> _save() async {
    if (!_canSave) return;
    setState(() => _saving = true);
    try {
      await hrRepo.payAdvance(
        widget.contract.id,
        amount: _amountValue!,
        paidOn: _paidOn,
        memberId: _memberId,
        paymentMethod: _method,
        bankAccountId: _bankAccountId,
        reference: _reference.text.trim(),
        notes: _notes.text.trim(),
      );
      if (!mounted) return;
      Navigator.of(context).pop(true);
      showRunqSnack(context, 'Advance recorded', kind: SnackKind.success);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      showRunqSnack(context, e.message, kind: SnackKind.error);
    }
  }
}
