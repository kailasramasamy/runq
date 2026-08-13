// Entry sheets for HR "Advances & deductions":
//   - showRecordAdvanceSheet  → POST /hr/advances (one-shot: creates,
//     activates, and disburses a loan in a single call).
//   - showAddDeductionSheet   → POST /hr/deductions.
//
// Deliberately separate from widgets/hr_advance_sheet.dart, which records
// an advance against a *contract-labour* engagement — a different concept
// (settled at contract close, not recovered through payroll instalments).

library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../api/api_client.dart';
import '../../../api/hr_models.dart';
import '../../../api/hr_recovery.dart';
import '../../../api/models.dart';
import '../../../providers/data_providers.dart';
import '../../../providers/hr_providers.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import '../../../widgets/runq_snack.dart';
import 'hr_form.dart';

const _deductionCategories = <String>['goods_purchase', 'canteen', 'damage', 'uniform', 'fine', 'other'];

String hrDeductionCategoryLabel(String code) => switch (code) {
      'goods_purchase' => 'Goods purchase',
      'canteen' => 'Canteen',
      'damage' => 'Damage',
      'uniform' => 'Uniform',
      'fine' => 'Fine',
      _ => 'Other',
    };

const _loanKinds = <String>['advance', 'personal', 'festival', 'education', 'other'];

String hrLoanKindLabel(String code) => switch (code) {
      'advance' => 'Salary advance',
      'personal' => 'Personal loan',
      'festival' => 'Festival advance',
      'education' => 'Education loan',
      _ => 'Loan',
    };

const _advancePaymentMethods = <String>['cash', 'bank_transfer', 'cheque'];

String hrPaymentMethodLabel(String code) => switch (code) {
      'bank_transfer' => 'Bank transfer',
      'cheque' => 'Cheque',
      _ => 'Cash',
    };

/// [employee] pre-selects and locks the payee — opened from an employee's own
/// page there is nothing to pick, and offering the choice invites recording
/// the advance against the wrong person.
Future<bool?> showRecordAdvanceSheet(BuildContext context, {HrEmployee? employee}) {
  return showModalBottomSheet<bool>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (_) => _RecordAdvanceSheet(employee: employee),
  );
}

Future<bool?> showAddDeductionSheet(BuildContext context, {HrEmployee? employee}) {
  return showModalBottomSheet<bool>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (_) => _AddDeductionSheet(employee: employee),
  );
}

// ─── Record advance paid ────────────────────────────────────────────────

class _RecordAdvanceSheet extends ConsumerStatefulWidget {
  final HrEmployee? employee;
  const _RecordAdvanceSheet({this.employee});
  @override
  ConsumerState<_RecordAdvanceSheet> createState() => _RecordAdvanceSheetState();
}

class _RecordAdvanceSheetState extends ConsumerState<_RecordAdvanceSheet> {
  late HrEmployee? _employee = widget.employee;
  final _amount = TextEditingController();
  final _months = TextEditingController(text: '1');
  final _reason = TextEditingController();
  final _reference = TextEditingController();
  DateTime _paidOn = DateTime.now();
  String _kind = 'advance';
  String _method = 'cash';
  BankAccount? _bankAccount;
  bool _saving = false;

  @override
  void dispose() {
    _amount.dispose();
    _months.dispose();
    _reason.dispose();
    _reference.dispose();
    super.dispose();
  }

  double? get _amountValue {
    final v = double.tryParse(_amount.text.trim());
    return (v == null || v <= 0) ? null : v;
  }

  int get _monthsValue => int.tryParse(_months.text.trim())?.clamp(1, 60) ?? 1;

  bool get _needsBank => _method != 'cash';

  /// Spells out the monthly bite before it's committed — the whole point of
  /// spreading a loan over months is the EMI, and it shouldn't take mental
  /// arithmetic to see it. The last instalment absorbs any rounding, so this
  /// is the figure for every month but the final one.
  String? get _emiPreview {
    final amount = _amountValue;
    if (amount == null) return null;
    final months = _monthsValue;
    if (months <= 1) return 'Recovered in full from the next payroll run.';
    final emi = (amount / months).round();
    return 'About ₹${emi.toString().replaceAllMapped(
          RegExp(r'(\d)(?=(\d{2})+\d{3}$)'),
          (m) => '${m[1]},',
        )} a month for $months months.';
  }

  bool get _canSave =>
      _employee != null && _amountValue != null && (!_needsBank || _bankAccount != null) && !_saving;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final inset = MediaQuery.of(context).viewInsets.bottom;
    final employeesAsync = ref.watch(hrEmployeesProvider(const HrEmployeesQuery(status: 'active')));
    final banks = ref.watch(bankAccountsProvider).asData?.value ?? const <BankAccount>[];

    return Container(
      constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.88),
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
            child: Row(children: [Text('Record advance paid', style: RunqText.h4.copyWith(color: t.ink))]),
          ),
          Flexible(
            child: SingleChildScrollView(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
              child: Column(children: [
                HrFormSection(children: [
                  if (widget.employee == null)
                    HrSelectField<HrEmployee>(
                      label: 'Employee',
                      value: _employee,
                      options: employeesAsync.asData?.value.data ?? const [],
                      display: (e) => '${e.displayName} · ${e.employeeCode}',
                      searchable: true,
                      required: true,
                      onChanged: (e) => setState(() => _employee = e),
                    ),
                  HrSelectField<String>(
                    label: 'Type',
                    value: _kind,
                    options: _loanKinds,
                    display: hrLoanKindLabel,
                    required: true,
                    onChanged: (k) => setState(() => _kind = k ?? _kind),
                  ),
                  HrTextField(
                    label: 'Amount (₹)',
                    hint: '5000',
                    controller: _amount,
                    required: true,
                    keyboard: const TextInputType.numberWithOptions(decimal: true),
                    formatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
                    textCapitalization: TextCapitalization.none,
                    onChanged: (_) => setState(() {}),
                  ),
                  HrTextField(
                    label: 'Recover over (months)',
                    hint: '1',
                    controller: _months,
                    keyboard: TextInputType.number,
                    formatters: [FilteringTextInputFormatter.digitsOnly],
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
                    options: _advancePaymentMethods,
                    display: hrPaymentMethodLabel,
                    required: true,
                    onChanged: (m) => setState(() {
                      _method = m ?? 'cash';
                      if (!_needsBank) _bankAccount = null;
                    }),
                  ),
                  if (_needsBank)
                    HrSelectField<BankAccount>(
                      label: 'From account',
                      value: _bankAccount,
                      options: banks,
                      display: (b) => '${b.name} · ${b.bankName}',
                      searchable: banks.length > 6,
                      required: true,
                      onChanged: (b) => setState(() => _bankAccount = b),
                    ),
                ]),
                if (_emiPreview != null)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                    child: Row(
                      children: [
                        Icon(Icons.event_repeat_outlined, size: 15, color: t.muted),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(_emiPreview!,
                              style: RunqText.caption.copyWith(color: t.muted)),
                        ),
                      ],
                    ),
                  ),
                const SizedBox(height: 12),
                HrFormSection(children: [
                  HrTextField(label: 'Reason', hint: 'Optional', controller: _reason),
                  HrTextField(
                    label: 'Reference',
                    hint: 'Optional — voucher or UTR',
                    controller: _reference,
                    textCapitalization: TextCapitalization.characters,
                  ),
                ]),
              ]),
            ),
          ),
          const SizedBox(height: 14),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: SizedBox(
              width: double.infinity,
              child: HrSubmitButton(
                label: 'Pay ${hrLoanKindLabel(_kind).toLowerCase()}',
                loading: _saving,
                enabled: _canSave,
                onPressed: _save,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _save() async {
    if (!_canSave) return;
    setState(() => _saving = true);
    final months = _monthsValue;
    final firstEmi = DateTime(_paidOn.year, _paidOn.month + 1, 1);
    try {
      await hrRecoveryRepo.recordAdvance(
        employeeId: _employee!.id,
        kind: _kind,
        amount: _amountValue!,
        totalInstalments: months,
        disbursedOn: _paidOn,
        firstEmiMonth: firstEmi.month,
        firstEmiYear: firstEmi.year,
        reason: _reason.text.trim().isEmpty ? null : _reason.text.trim(),
        paymentMethod: _method,
        bankAccountId: _bankAccount?.id,
        reference: _reference.text.trim().isEmpty ? null : _reference.text.trim(),
      );
      if (!mounted) return;
      Navigator.of(context).pop(true);
      showRunqSnack(context,
          '${hrLoanKindLabel(_kind)} paid to ${_employee!.displayName}',
          kind: SnackKind.success);
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

// ─── Add deduction ──────────────────────────────────────────────────────

class _AddDeductionSheet extends ConsumerStatefulWidget {
  final HrEmployee? employee;
  const _AddDeductionSheet({this.employee});
  @override
  ConsumerState<_AddDeductionSheet> createState() => _AddDeductionSheetState();
}

class _AddDeductionSheetState extends ConsumerState<_AddDeductionSheet> {
  late HrEmployee? _employee = widget.employee;
  String _category = 'goods_purchase';
  final _amount = TextEditingController();
  final _months = TextEditingController();
  final _description = TextEditingController();
  late int _startMonth;
  late int _startYear;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final next = DateTime(DateTime.now().year, DateTime.now().month + 1, 1);
    _startMonth = next.month;
    _startYear = next.year;
  }

  @override
  void dispose() {
    _amount.dispose();
    _months.dispose();
    _description.dispose();
    super.dispose();
  }

  double? get _amountValue {
    final v = double.tryParse(_amount.text.trim());
    return (v == null || v <= 0) ? null : v;
  }

  int? get _monthsValue => int.tryParse(_months.text.trim());

  bool get _canSave => _employee != null && _amountValue != null && !_saving;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final inset = MediaQuery.of(context).viewInsets.bottom;
    final employeesAsync = ref.watch(hrEmployeesProvider(const HrEmployeesQuery(status: 'active')));

    return Container(
      constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.88),
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
            child: Row(children: [Text('Add deduction', style: RunqText.h4.copyWith(color: t.ink))]),
          ),
          Flexible(
            child: SingleChildScrollView(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
              child: Column(children: [
                HrFormSection(children: [
                  if (widget.employee == null)
                    HrSelectField<HrEmployee>(
                      label: 'Employee',
                      value: _employee,
                      options: employeesAsync.asData?.value.data ?? const [],
                      display: (e) => '${e.displayName} · ${e.employeeCode}',
                      searchable: true,
                      required: true,
                      onChanged: (e) => setState(() => _employee = e),
                    ),
                  HrSelectField<String>(
                    label: 'Category',
                    value: _category,
                    options: _deductionCategories,
                    display: hrDeductionCategoryLabel,
                    required: true,
                    onChanged: (c) => setState(() => _category = c ?? 'other'),
                  ),
                  HrTextField(
                    label: 'Amount (₹)',
                    hint: '1500',
                    controller: _amount,
                    required: true,
                    keyboard: const TextInputType.numberWithOptions(decimal: true),
                    formatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
                    textCapitalization: TextCapitalization.none,
                    onChanged: (_) => setState(() {}),
                  ),
                  HrTextField(
                    label: 'Recover over (months)',
                    hint: 'Leave blank to recover in one run',
                    controller: _months,
                    keyboard: TextInputType.number,
                    formatters: [FilteringTextInputFormatter.digitsOnly],
                    textCapitalization: TextCapitalization.none,
                    onChanged: (_) => setState(() {}),
                  ),
                  Row(children: [
                    Expanded(
                      child: HrSelectField<int>(
                        label: 'Start month',
                        value: _startMonth,
                        options: List.generate(12, (i) => i + 1),
                        display: (m) => _monthName(m),
                        required: true,
                        onChanged: (m) => setState(() => _startMonth = m ?? _startMonth),
                      ),
                    ),
                    Expanded(
                      child: HrSelectField<int>(
                        label: 'Start year',
                        value: _startYear,
                        options: List.generate(5, (i) => DateTime.now().year + i),
                        display: (y) => '$y',
                        required: true,
                        onChanged: (y) => setState(() => _startYear = y ?? _startYear),
                      ),
                    ),
                  ]),
                  HrTextField(
                    label: 'Description',
                    hint: 'Optional',
                    controller: _description,
                    maxLines: 2,
                  ),
                ]),
              ]),
            ),
          ),
          const SizedBox(height: 14),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: SizedBox(
              width: double.infinity,
              child: HrSubmitButton(
                label: 'Add deduction',
                loading: _saving,
                enabled: _canSave,
                onPressed: _save,
              ),
            ),
          ),
        ],
      ),
    );
  }

  static String _monthName(int m) {
    const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return names[m - 1];
  }

  Future<void> _save() async {
    if (!_canSave) return;
    setState(() => _saving = true);
    final amount = _amountValue!;
    final months = _monthsValue;
    final instalment = (months == null || months <= 1) ? null : amount / months;
    try {
      await hrRecoveryRepo.createDeduction(
        employeeId: _employee!.id,
        category: _category,
        description: _description.text.trim().isEmpty ? null : _description.text.trim(),
        amount: amount,
        instalment: instalment,
        startMonth: _startMonth,
        startYear: _startYear,
      );
      if (!mounted) return;
      Navigator.of(context).pop(true);
      showRunqSnack(context, 'Deduction added for ${_employee!.displayName}', kind: SnackKind.success);
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
