import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../api/api_client.dart';
import '../../api/models.dart';
import '../../api/recurring_bill_models.dart';
import '../../api/recurring_bills_repo.dart';
import '../../providers/data_providers.dart';
import '../../providers/recurring_bill_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../utils/format_inr.dart';
import '../../widgets/runq_snack.dart';
import '../../widgets/runq_card.dart';
import '../payment_made_screen.dart' show sheetHandle, sheetTitle;
import 'recurring_form_kit.dart';
import '../../widgets/bank_account_sheet.dart';
import 'recurring_period_picker.dart';

/// [months] are the agreement's bills (any order); the open ones become the
/// "Pay for" choices.
Future<void> showRecurringPaymentSheet(BuildContext context, RecurringBill a, List<RecurringMonth> months) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: RT(context).bgWarmer,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
    ),
    builder: (_) => RecurringPaymentSheet(
      agreement: a,
      openOldestFirst: months.where((m) => m.balance > 0).toList()
        ..sort((x, y) => x.period.compareTo(y.period)),
    ),
  );
}

class RecurringPaymentSheet extends ConsumerStatefulWidget {
  final RecurringBill agreement;
  final List<RecurringMonth> openOldestFirst;
  const RecurringPaymentSheet({super.key, required this.agreement, required this.openOldestFirst});

  @override
  ConsumerState<RecurringPaymentSheet> createState() => _SheetState();
}

class _SheetState extends ConsumerState<RecurringPaymentSheet> {
  late final TextEditingController _amount;
  final _utr = TextEditingController();
  DateTime _date = DateTime.now();
  String? _bankId;
  bool _advance = false;
  final Set<String> _chosen = {};
  bool _saving = false;

  RecurringBill get _a => widget.agreement;

  @override
  void initState() {
    super.initState();
    _amount = TextEditingController(text: _plain(_defaultAmount()));
  }

  @override
  void dispose() {
    _amount.dispose();
    _utr.dispose();
    super.dispose();
  }

  String _plain(double v) => v == v.roundToDouble() ? v.toInt().toString() : v.toStringAsFixed(2);

  /// One period's worth: the oldest unpaid period's balance, else a single
  /// bill's amount (half the monthly amount on a twice-a-month agreement).
  double _defaultAmount() {
    final open = widget.openOldestFirst;
    if (open.isNotEmpty) return open.first.balance;
    return _a.frequency == 'semi_monthly' ? _a.amount / 2 : _a.amount;
  }

  /// Ticking periods fills in their combined due; clearing them restores the default.
  void _toggle(String id) => setState(() {
        _chosen.contains(id) ? _chosen.remove(id) : _chosen.add(id);
        final total = _chosen.isEmpty
            ? _defaultAmount()
            : widget.openOldestFirst
                .where((m) => _chosen.contains(m.id))
                .fold<double>(0, (s, m) => s + m.balance);
        _amount.text = _plain(total);
      });

  double get _value => double.tryParse(_amount.text.trim()) ?? 0;

  /// Ticked periods, oldest first — the order the server settles them in.
  List<String>? get _billIds => _chosen.isEmpty || _advance
      ? null
      : [for (final m in widget.openOldestFirst) if (_chosen.contains(m.id)) m.id];

  Future<void> _pickDate() async {
    final d = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime(2020),
      lastDate: DateTime.now().add(const Duration(days: 30)),
    );
    if (d != null) setState(() => _date = d);
  }

  Future<void> _submit() async {
    final bank = _bankId;
    if (_value <= 0) return showRunqSnack(context, 'Enter an amount', kind: SnackKind.warning);
    if (bank == null) return showRunqSnack(context, 'Pick the paying account', kind: SnackKind.warning);
    setState(() => _saving = true);
    try {
      final r = await recurringBillsRepo.pay(
        _a.id,
        amount: _value,
        paymentDate: _date,
        bankAccountId: bank,
        referenceNumber: _utr.text.trim(),
        asAdvance: _advance,
        billIds: _billIds,
      );
      ref.invalidate(recurringBillDetailProvider(_a.id));
      ref.invalidate(recurringBillsProvider);
      if (!mounted) return;
      Navigator.pop(context);
      showRunqSnack(context, _resultText(r), kind: SnackKind.success);
    } on ApiException catch (e) {
      if (mounted) showRunqSnack(context, e.message, kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  String _resultText(RecurringPaymentResult r) {
    final parts = <String>[
      if (r.paidToBills > 0) '${formatINR(r.paidToBills)} applied to bills',
      if (r.heldAsAdvance > 0) '${formatINR(r.heldAsAdvance)} held as advance',
    ];
    return parts.isEmpty ? 'Payment recorded' : parts.join(', ');
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final accounts = ref.watch(bankAccountsProvider).value ?? const <BankAccount>[];
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.92),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(child: sheetHandle(t)),
            sheetTitle(t, 'Record payment'),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              child: Text(
                  '${_a.title}${_a.outstanding > 0 ? ' · ${formatINR(_a.outstanding)} due' : ''}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: RunqText.caption.copyWith(color: t.muted)),
            ),
            Flexible(child: _body(accounts)),
            FormBottomBar(label: 'Record payment', busy: _saving, onPressed: _submit),
          ],
        ),
      ),
    );
  }

  Widget _body(List<BankAccount> accounts) {
    final t = RT(context);
    final plan = _value <= 0
        ? const <String>[]
        : paymentPlan(_value, widget.openOldestFirst, _chosen, _advance);
    return ListView(
      shrinkWrap: true,
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
      children: [
        FormAmountCard(
          label: 'AMOUNT PAID',
          controller: _amount,
          autofocus: true,
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 16),
        FormGroupCard(children: [
          _bankRow(accounts),
          FormPickerRow(
            icon: Icons.event_outlined,
            label: 'Date',
            value: DateFormat('d MMM yyyy').format(_date),
            onTap: _pickDate,
          ),
          FormTextRow(
            controller: _utr,
            label: 'UTR / reference',
            hint: 'Optional',
            cap: TextCapitalization.characters,
            maxLength: 50,
          ),
        ]),
        const SizedBox(height: 12),
        _advanceCard(t),
        if (!_advance && widget.openOldestFirst.isNotEmpty) ...[
          const SizedBox(height: 20),
          RecurringPeriodPicker(
            openOldestFirst: widget.openOldestFirst,
            chosen: _chosen,
            onToggle: _toggle,
          ),
        ],
        if (plan.isNotEmpty) ...[
          const SizedBox(height: 16),
          RecurringPlanPreview(lines: plan),
        ],
      ],
    );
  }

  Widget _advanceCard(RunqTokens t) => RunqCard(
        padding: const EdgeInsets.fromLTRB(14, 8, 8, 8),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Hold as advance', style: RunqText.bodyStrong.copyWith(color: t.ink)),
                  Text('Keep it for upcoming bills',
                      style: RunqText.caption.copyWith(color: t.muted)),
                ],
              ),
            ),
            Switch(value: _advance, onChanged: (v) => setState(() => _advance = v)),
          ],
        ),
      );

  Widget _bankRow(List<BankAccount> accounts) {
    final sel = accounts.where((a) => a.id == _bankId).firstOrNull;
    return FormPickerRow(
      icon: Icons.account_balance_outlined,
      label: 'Paid from',
      value: sel == null ? null : '${sel.bankName} ${sel.masked}',
      placeholder: 'Select account',
      onTap: () async {
        final picked = await _pickBank(accounts);
        if (picked != null) setState(() => _bankId = picked.id);
      },
    );
  }

  Future<BankAccount?> _pickBank(List<BankAccount> accounts) =>
      showBankAccountSheet(context, accounts: accounts, selectedId: _bankId);

}
