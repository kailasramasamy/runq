// Edit sheet for an advance/loan — split out of hr_advance_detail_sheet.dart
// to keep both files under the line-count guideline.

library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../api/api_client.dart';
import '../../../api/hr_recovery.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import '../../../widgets/runq_snack.dart';
import 'hr_form.dart';
import 'hr_widgets.dart';

Future<bool?> showEditAdvanceSheet(BuildContext context, HrAdminLoan loan) {
  return showModalBottomSheet<bool>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (_) => _EditAdvanceSheet(loan: loan),
  );
}

class _EditAdvanceSheet extends ConsumerStatefulWidget {
  final HrAdminLoan loan;
  const _EditAdvanceSheet({required this.loan});
  @override
  ConsumerState<_EditAdvanceSheet> createState() => _EditAdvanceSheetState();
}

class _EditAdvanceSheetState extends ConsumerState<_EditAdvanceSheet> {
  late final TextEditingController _amount;
  late final TextEditingController _months;
  late final TextEditingController _reason;
  late int _startMonth, _startYear;
  bool _saving = false;

  /// Principal can only move while the cash hasn't gone out and payroll
  /// hasn't recovered anything against it — matches the server's own rule.
  bool get _amountEditable {
    final l = widget.loan.loan;
    final recovered = l.outstanding < l.principal;
    return !widget.loan.isDisbursed && !recovered;
  }

  @override
  void initState() {
    super.initState();
    final l = widget.loan.loan;
    _amount = TextEditingController(text: l.principal.toStringAsFixed(0));
    _months = TextEditingController();
    _reason = TextEditingController(text: l.reason ?? '');
    _startMonth = l.firstEmiMonth;
    _startYear = l.firstEmiYear;
  }

  @override
  void dispose() {
    _amount.dispose();
    _months.dispose();
    _reason.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final inset = MediaQuery.of(context).viewInsets.bottom;
    return Container(
      constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.85),
      decoration: BoxDecoration(
        color: t.bgWarmer,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: EdgeInsets.fromLTRB(0, 12, 0, 16 + inset),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Center(
            child: Container(
              width: 36, height: 4,
              decoration: BoxDecoration(color: t.hairline, borderRadius: BorderRadius.circular(999)),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 14, 20, 6),
            child: Row(children: [Text('Edit advance', style: RunqText.h4.copyWith(color: t.ink))]),
          ),
          Flexible(child: SingleChildScrollView(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
            child: _fields(t),
          )),
          const SizedBox(height: 14),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: SizedBox(
              width: double.infinity,
              child: HrSubmitButton(label: 'Save changes', loading: _saving, enabled: !_saving, onPressed: _save),
            ),
          ),
        ],
      ),
    );
  }

  Widget _fields(RunqTokens t) {
    return HrFormSection(children: [
      if (_amountEditable)
        HrTextField(
          label: 'Amount (₹)',
          controller: _amount,
          required: true,
          keyboard: const TextInputType.numberWithOptions(decimal: true),
          formatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
          textCapitalization: TextCapitalization.none,
        )
      else
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Amount', style: RunqText.caption.copyWith(color: t.ink2, fontWeight: FontWeight.w600)),
              const SizedBox(height: 4),
              Text(hrFormatINR(widget.loan.loan.principal), style: RunqText.body.copyWith(color: t.ink)),
              const SizedBox(height: 4),
              Text(
                widget.loan.isDisbursed
                    ? 'Already paid out — the amount can no longer be changed.'
                    : 'Payroll has already recovered against this — the amount can no longer be changed.',
                style: RunqText.caption.copyWith(color: t.muted),
              ),
            ],
          ),
        ),
      HrTextField(
        label: 'Recover remaining over (months)',
        hint: 'Leave blank to keep the current plan',
        controller: _months,
        keyboard: TextInputType.number,
        formatters: [FilteringTextInputFormatter.digitsOnly],
        textCapitalization: TextCapitalization.none,
      ),
      Row(children: [
        Expanded(
          child: HrSelectField<int>(
            label: 'First EMI month',
            value: _startMonth,
            options: List.generate(12, (i) => i + 1),
            display: (m) => const ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m - 1],
            required: true,
            onChanged: (m) => setState(() => _startMonth = m ?? _startMonth),
          ),
        ),
        Expanded(
          child: HrSelectField<int>(
            label: 'First EMI year',
            value: _startYear,
            options: List.generate(5, (i) => DateTime.now().year - 1 + i),
            display: (y) => '$y',
            required: true,
            onChanged: (y) => setState(() => _startYear = y ?? _startYear),
          ),
        ),
      ]),
      HrTextField(label: 'Reason', hint: 'Optional', controller: _reason, maxLines: 2),
    ]);
  }

  Future<void> _save() async {
    if (_saving) return;
    setState(() => _saving = true);
    final l = widget.loan.loan;
    final months = int.tryParse(_months.text.trim());
    final newAmount = _amountEditable ? double.tryParse(_amount.text.trim()) : null;
    final principal = (newAmount != null && newAmount != l.principal) ? newAmount : null;
    try {
      await hrRecoveryRepo.updateLoan(
        l.id,
        principal: principal,
        remainingInstalments: months,
        firstEmiMonth: _startMonth,
        firstEmiYear: _startYear,
        reason: _reason.text.trim().isEmpty ? null : _reason.text.trim(),
      );
      if (!mounted) return;
      Navigator.of(context).pop(true);
      showRunqSnack(context, 'Advance updated', kind: SnackKind.success);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      showRunqSnack(context, e.message, kind: SnackKind.error);
    } catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      showRunqSnack(context, 'Failed: $e', kind: SnackKind.error);
    }
  }
}
