// Paying out a settled contract.
//
// Approval books what is owed; this is where the money actually leaves. A
// crew is rarely paid in one go, so any number of instalments can land here
// and the settlement only reads "paid" once the due reaches zero. Each one
// posts its own entry — leaving the payable overstated between part-payments
// would misstate the books.

library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../api/api_client.dart';
import '../../../api/hr_contract_models.dart';
import '../../../api/hr_repo.dart';
import '../../../api/models.dart';
import '../../../providers/data_providers.dart';
import '../../../providers/hr_providers.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import '../../../widgets/runq_snack.dart';
import 'hr_contract_bits.dart';
import 'hr_form.dart';
import 'hr_setup_widgets.dart';
import 'hr_widgets.dart';

String hrPaymentMethodLabel(String s) => switch (s) {
      'cash' => 'Cash',
      'bank_transfer' => 'Bank transfer',
      'upi' => 'UPI',
      'cheque' => 'Cheque',
      _ => s,
    };

Future<bool?> showHrSettlementPaymentSheet(
  BuildContext context,
  HrContract contract,
  HrSettlement settlement,
) {
  return showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _PaymentSheet(contract: contract, settlement: settlement),
  );
}

class _PaymentSheet extends ConsumerStatefulWidget {
  final HrContract contract;
  final HrSettlement settlement;
  const _PaymentSheet({required this.contract, required this.settlement});

  @override
  ConsumerState<_PaymentSheet> createState() => _PaymentSheetState();
}

class _PaymentSheetState extends ConsumerState<_PaymentSheet> {
  final _amount = TextEditingController();
  final _reference = TextEditingController();
  late DateTime _paidOn;
  String _method = 'bank_transfer';
  String? _bankAccountId;
  bool _saving = false;

  static const _methods = ['bank_transfer', 'cash', 'upi', 'cheque'];

  double get _due => widget.settlement.amountDue;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _paidOn = DateTime(now.year, now.month, now.day);
    // Paying the whole thing is the common case, so it is what the field
    // opens with; overtype it to record an instalment.
    _amount.text = _due.toStringAsFixed(2);
  }

  @override
  void dispose() {
    _amount.dispose();
    _reference.dispose();
    super.dispose();
  }

  double? get _amountValue {
    final v = double.tryParse(_amount.text.trim());
    return (v == null || v <= 0) ? null : v;
  }

  bool get _needsBank => _method != 'cash';
  bool get _tooMuch => (_amountValue ?? 0) > _due + 0.001;

  bool get _canSave =>
      _amountValue != null &&
      !_tooMuch &&
      (!_needsBank || _bankAccountId != null) &&
      !_saving;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final banks =
        ref.watch(bankAccountsProvider).asData?.value ?? const <BankAccount>[];
    BankAccount? selectedBank;
    for (final b in banks) {
      if (b.id == _bankAccountId) {
        selectedBank = b;
        break;
      }
    }

    return HrEditorSheet(
      title: 'Record payment',
      saveLabel: 'Pay',
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
              display: hrPaymentMethodLabel,
              onChanged: (m) => setState(() {
                _method = m ?? 'bank_transfer';
                if (!_needsBank) _bankAccountId = null;
              }),
              required: true,
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
              hint: 'Optional — UTR or cheque no.',
              textCapitalization: TextCapitalization.characters,
            ),
          ],
        ),
        if (_tooMuch) ...[
          const SizedBox(height: 10),
          HrContractWarning(
            text: 'That is more than the ${hrFormatINR(_due)} still due.',
            severe: true,
          ),
        ],
        const SizedBox(height: 10),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.info_outline, size: 14, color: t.muted2),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                'Clears the payable and takes the money out of the account it '
                'left. Pay less than the full amount to record an instalment.',
                style: RunqText.caption.copyWith(color: t.muted2),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _context(RunqTokens t) {
    final s = widget.settlement;
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
          Text(widget.contract.name,
              style: RunqText.bodyStrong.copyWith(color: t.ink)),
          const SizedBox(height: 2),
          Text('${s.settlementNumber} · ${widget.contract.leadPersonName}',
              style: RunqText.caption.copyWith(color: t.muted)),
          const SizedBox(height: 6),
          Text(
            s.amountPaid > 0
                ? '${hrFormatINR(s.amountPaid)} of ${hrFormatINR(s.netPayable)} paid · '
                    '${hrFormatINR(_due)} still due'
                : '${hrFormatINR(_due)} due',
            style: RunqText.caption.copyWith(color: t.muted),
          ),
        ],
      ),
    );
  }

  Future<void> _save() async {
    if (!_canSave) return;
    setState(() => _saving = true);
    try {
      await hrRepo.recordSettlementPayment(
        widget.settlement.id,
        paymentDate: _paidOn,
        amount: _amountValue,
        paymentMethod: _method,
        bankAccountId: _bankAccountId,
        reference: _reference.text.trim(),
      );
      if (!mounted) return;
      final full = (_amountValue ?? 0) >= _due - 0.001;
      Navigator.of(context).pop(true);
      showRunqSnack(
        context,
        full ? 'Settlement paid in full' : 'Payment recorded',
        kind: SnackKind.success,
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      showRunqSnack(context, e.message, kind: SnackKind.error);
    }
  }
}

/// Instalments already handed over. Voided ones stay visible — the reversal
/// is in the ledger and hiding what it reversed helps nobody.
class HrSettlementPaymentList extends ConsumerWidget {
  final String settlementId;
  final bool canVoid;
  final VoidCallback onChanged;
  const HrSettlementPaymentList({
    super.key,
    required this.settlementId,
    required this.canVoid,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final rows = ref.watch(hrSettlementPaymentsProvider(settlementId)).asData?.value
        ?? const <HrSettlementPayment>[];
    if (rows.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 10),
        Text('Payments', style: RunqText.label.copyWith(color: t.muted2)),
        const SizedBox(height: 6),
        for (final p in rows)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        hrFormatINR(p.amount),
                        style: RunqText.body.copyWith(
                          color: p.isVoided ? t.muted2 : t.ink,
                          fontWeight: FontWeight.w600,
                          decoration:
                              p.isVoided ? TextDecoration.lineThrough : null,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '${hrContractDateFull(p.paymentDate)} · '
                        '${hrPaymentMethodLabel(p.paymentMethod)}'
                        '${(p.reference ?? '').isEmpty ? '' : ' · ${p.reference}'}',
                        style: RunqText.caption.copyWith(color: t.muted),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
                if (canVoid && !p.isVoided)
                  IconButton(
                    visualDensity: VisualDensity.compact,
                    onPressed: () => _confirmVoid(context, ref, p),
                    icon: Icon(Icons.close_rounded, size: 16, color: t.muted2),
                  ),
              ],
            ),
          ),
      ],
    );
  }

  Future<void> _confirmVoid(
      BuildContext context, WidgetRef ref, HrSettlementPayment p) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Reverse this payment?'),
        content: Text(
          '${hrFormatINR(p.amount)} paid on ${hrContractDateFull(p.paymentDate)} '
          'will be reversed and shown as due again.',
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: const Text('Keep')),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: TextButton.styleFrom(foregroundColor: const Color(0xFFDC2626)),
            child: const Text('Reverse'),
          ),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    try {
      await hrRepo.voidSettlementPayment(p.id);
      ref.invalidate(hrSettlementPaymentsProvider(settlementId));
      onChanged();
      if (context.mounted) {
        showRunqSnack(context, 'Payment reversed', kind: SnackKind.success);
      }
    } on ApiException catch (e) {
      if (context.mounted) {
        showRunqSnack(context, e.message, kind: SnackKind.error);
      }
    }
  }
}
