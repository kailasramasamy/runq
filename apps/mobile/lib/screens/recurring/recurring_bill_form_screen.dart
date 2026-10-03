import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/api_client.dart';
import '../../api/models.dart';
import '../../api/recurring_bill_models.dart';
import '../../api/recurring_bills_repo.dart';
import '../../providers/recurring_bill_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../utils/format_inr.dart';
import '../../widgets/async_slot.dart';
import '../../widgets/runq_snack.dart';
import '../../widgets/vendor_picker_screen.dart';
import 'bill_day_sheet.dart';
import 'month_picker_sheet.dart';
import 'recurring_form_kit.dart';
import 'recurring_widgets.dart';

/// Create (editId == null) or edit an agreement.
class RecurringBillFormScreen extends ConsumerWidget {
  final String? editId;
  const RecurringBillFormScreen({super.key, this.editId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final id = editId;
    if (id == null) return const _Form();
    return Scaffold(
      backgroundColor: RT(context).bgWarmer,
      appBar: AppBar(title: const Text('Edit agreement')),
      body: AsyncSlot<RecurringBillDetail>(
        value: ref.watch(recurringBillDetailProvider(id)),
        onRetry: () => ref.invalidate(recurringBillDetailProvider(id)),
        data: (d) => _Form(existing: d.agreement),
      ),
    );
  }
}

class _Form extends ConsumerStatefulWidget {
  final RecurringBill? existing;
  const _Form({this.existing});

  @override
  ConsumerState<_Form> createState() => _FormState();
}

class _FormState extends ConsumerState<_Form> {
  late final _title = TextEditingController(text: widget.existing?.title);
  late final _amount = TextEditingController(
      text: widget.existing == null ? '' : widget.existing!.amount.toStringAsFixed(2));
  late int _day = widget.existing?.billDay ?? 1;
  late String _category = widget.existing?.category ?? 'rent';
  late String _frequency = widget.existing?.frequency ?? 'monthly';
  late DateTime _start = parseIso(widget.existing?.startMonth ?? '') ??
      DateTime(DateTime.now().year, DateTime.now().month);
  late DateTime? _end = parseIso(widget.existing?.endMonth ?? '');
  VendorSummary? _vendor;
  bool _saving = false;

  bool get _isEdit => widget.existing != null;

  @override
  void dispose() {
    _title.dispose();
    _amount.dispose();
    super.dispose();
  }

  String? _validate() {
    if (!_isEdit && _vendor == null) return 'Pick a vendor';
    if (_title.text.trim().isEmpty) return 'Enter a title';
    if ((double.tryParse(_amount.text.trim()) ?? 0) <= 0) return 'Enter the monthly amount';
    final end = _end;
    if (end != null && end.isBefore(_start)) return 'End month is before start month';
    return null;
  }

  Future<void> _save() async {
    final err = _validate();
    if (err != null) return showRunqSnack(context, err, kind: SnackKind.warning);
    setState(() => _saving = true);
    try {
      await _send();
      ref.invalidate(recurringBillsProvider);
      final e = widget.existing;
      if (e != null) ref.invalidate(recurringBillDetailProvider(e.id));
      if (mounted) context.pop();
    } on ApiException catch (e) {
      if (mounted) showRunqSnack(context, e.message, kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _send() {
    final amount = double.parse(_amount.text.trim());
    final e = widget.existing;
    if (e != null) {
      return recurringBillsRepo.update(e.id, {
        'title': _title.text.trim(),
        'amount': amount,
        'billDay': _day,
        'endMonth': _end == null ? null : RecurringBillsRepo.monthIso(_end!),
      });
    }
    return recurringBillsRepo.create(
      vendorId: _vendor!.id,
      title: _title.text.trim(),
      category: _category,
      frequency: _frequency,
      amount: amount,
      billDay: _day,
      startMonth: _start,
      endMonth: _end,
    );
  }

  Future<void> _pickVendor() async {
    final v = await showVendorPicker(context, currentVendorId: _vendor?.id);
    if (v != null) setState(() => _vendor = v);
  }

  Future<void> _pickDay() async {
    final d = await showBillDayPicker(context, _day);
    if (d != null) setState(() => _day = d);
  }

  Future<void> _pickMonth({required bool start}) async {
    final m = await showMonthPicker(context, (start ? _start : _end) ?? _start);
    if (m == null) return;
    setState(() => start ? _start = m : _end = m);
  }

  double get _amountValue => double.tryParse(_amount.text.trim()) ?? 0;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final twice = _frequency == 'semi_monthly';
    return Scaffold(
      backgroundColor: t.bgWarmer,
      appBar: _isEdit ? null : AppBar(title: const Text('New agreement')),
      body: SafeArea(
        child: ListView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
          children: [
            FormAmountCard(
              label: 'MONTHLY AMOUNT',
              controller: _amount,
              onChanged: (_) => setState(() {}),
              caption: twice && _amountValue > 0
                  ? '2 bills of ${formatINR(_amountValue / 2)}'
                  : null,
            ),
            const SizedBox(height: 20),
            const FormSectionHeader('Agreement'),
            _agreementCard(),
            const SizedBox(height: 20),
            const FormSectionHeader('Schedule'),
            _scheduleCard(),
            if (_isEdit) ...[
              const SizedBox(height: 12),
              Padding(
                padding: const EdgeInsets.only(left: 4),
                child: Text('Changes apply from the next bill.',
                    style: RunqText.caption.copyWith(color: t.muted)),
              ),
            ],
          ],
        ),
      ),
      bottomNavigationBar: FormBottomBar(
        label: _isEdit ? 'Save changes' : 'Create agreement',
        busy: _saving,
        onPressed: _save,
      ),
    );
  }

  Widget _agreementCard() => FormGroupCard(children: [
        FormPickerRow(
          icon: Icons.storefront_outlined,
          label: 'Vendor',
          value: widget.existing?.vendorName ?? _vendor?.name,
          placeholder: 'Select vendor',
          onTap: _isEdit ? null : _pickVendor,
        ),
        FormTextRow(
          controller: _title,
          label: 'Title',
          hint: 'e.g. Warehouse rent',
          cap: TextCapitalization.sentences,
        ),
        FormChoiceRow(
          label: 'Type',
          selected: _category,
          options: [for (final c in const ['rent', 'transport', 'other']) (c, categoryLabel(c))],
          onChanged: _isEdit ? null : (v) => setState(() => _category = v),
        ),
      ]);

  Widget _scheduleCard() => FormGroupCard(children: [
        FormChoiceRow(
          label: 'Frequency',
          selected: _frequency,
          options: const [('monthly', 'Monthly'), ('semi_monthly', 'Twice a month')],
          onChanged: _isEdit ? null : (v) => setState(() => _frequency = v),
        ),
        if (_frequency == 'monthly')
          FormPickerRow(
            icon: Icons.receipt_long_outlined,
            label: 'Billed on',
            value: '${ordinal(_day)} of next month',
            onTap: _pickDay,
          )
        else
          _twiceInfoRow(),
        FormPickerRow(
          icon: Icons.event_outlined,
          label: 'Start month',
          value: monthLabel(_start.toIso8601String()),
          onTap: _isEdit ? null : () => _pickMonth(start: true),
        ),
        FormPickerRow(
          icon: Icons.event_busy_outlined,
          label: 'End month (optional)',
          value: _end == null ? null : monthLabel(_end!.toIso8601String()),
          placeholder: 'No end',
          onTap: () => _pickMonth(start: false),
          onClear: _end == null ? null : () => setState(() => _end = null),
        ),
      ]);

  Widget _twiceInfoRow() {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.all(14),
      child: Row(
        children: [
          Icon(Icons.info_outline_rounded, size: 18, color: t.muted),
          const SizedBox(width: 10),
          Expanded(
            child: Text('1st half billed on the 16th · 2nd half on the 1st of next month',
                style: RunqText.caption.copyWith(color: t.muted)),
          ),
        ],
      ),
    );
  }
}
