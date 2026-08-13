// Deduction detail sheet — recovery history (which payroll run took how
// much) plus Edit / Cancel / Delete. Opened by tapping a row on the
// Deductions tab of hr_recoveries_screen.dart.

library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../api/api_client.dart';
import '../../../api/hr_recovery.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import '../../../widgets/runq_snack.dart';
import 'hr_colors.dart';
import 'hr_form.dart';
import 'hr_recovery_sheets.dart';
import 'hr_widgets.dart';

Future<void> showDeductionDetailSheet(BuildContext context, String id) {
  return showModalBottomSheet<void>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (_) => _DeductionDetailSheet(id: id),
  );
}

Future<bool?> showEditDeductionSheet(BuildContext context, HrDeduction deduction) {
  return showModalBottomSheet<bool>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (_) => _EditDeductionSheet(deduction: deduction),
  );
}

class _DeductionDetailSheet extends ConsumerWidget {
  final String id;
  const _DeductionDetailSheet({required this.id});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final async = ref.watch(hrDeductionDetailProvider(id));
    return Container(
      constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.85),
      decoration: BoxDecoration(
        color: t.bgWarmer,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: const EdgeInsets.fromLTRB(0, 12, 0, 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Center(
            child: Container(
              width: 36, height: 4,
              decoration: BoxDecoration(color: t.hairline, borderRadius: BorderRadius.circular(999)),
            ),
          ),
          Flexible(
            child: async.when(
              loading: () => const Padding(
                padding: EdgeInsets.all(40),
                child: Center(child: CircularProgressIndicator(color: HrColors.teal)),
              ),
              error: (e, _) => Padding(
                padding: const EdgeInsets.all(24),
                child: Text('$e', style: RunqText.body.copyWith(color: t.muted)),
              ),
              data: (detail) => _DetailBody(detail: detail),
            ),
          ),
        ],
      ),
    );
  }
}

class _DetailBody extends ConsumerWidget {
  final HrDeductionDetail detail;
  const _DetailBody({required this.detail});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final d = detail.deduction;
    final canManage = d.status == 'active';
    return SingleChildScrollView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(d.employeeName, style: RunqText.h4.copyWith(color: t.ink)),
                  if (d.employeeCode != null)
                    Text(d.employeeCode!, style: RunqText.caption.copyWith(color: t.muted)),
                ],
              ),
            ),
            HrStatusBadge(status: d.status),
          ]),
          const SizedBox(height: 12),
          _summaryCard(t, d),
          if (d.description != null && d.description!.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(d.description!, style: RunqText.body.copyWith(color: t.muted)),
          ],
          const SizedBox(height: 18),
          Text('RECOVERY HISTORY', style: RunqText.label.copyWith(color: t.muted2, letterSpacing: 0.5)),
          const SizedBox(height: 8),
          if (detail.recoveries.isEmpty)
            _emptyRecoveries(t)
          else
            _recoveriesCard(t, detail.recoveries),
          if (canManage) ...[
            const SizedBox(height: 20),
            _actions(context, ref, d),
          ] else ...[
            const SizedBox(height: 20),
            _deleteRow(context, ref, d),
          ],
        ],
      ),
    );
  }

  Widget _summaryCard(RunqTokens t, HrDeduction d) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: t.hairline, width: 0.5),
      ),
      child: Column(children: [
        _row(t, hrDeductionCategoryLabel(d.category), hrFormatINR(d.amount)),
        _row(t, 'Instalment', hrFormatINR(d.instalment)),
        _row(t, 'Outstanding', hrFormatINR(d.outstanding)),
        _row(t, 'Starts', '${months[d.startMonth - 1]} ${d.startYear}'),
      ]),
    );
  }

  Widget _row(RunqTokens t, String k, String v) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 4),
    child: Row(children: [
      Expanded(child: Text(k, style: RunqText.body.copyWith(color: t.muted))),
      Text(v, style: RunqText.bodyStrong.copyWith(color: t.ink)),
    ]),
  );

  Widget _emptyRecoveries(RunqTokens t) => Container(
    width: double.infinity,
    padding: const EdgeInsets.symmetric(vertical: 20),
    decoration: BoxDecoration(
      color: t.surface,
      borderRadius: BorderRadius.circular(RunqRadii.smallCard),
      border: Border.all(color: t.hairline, width: 0.5),
    ),
    child: Center(
      child: Text('No recoveries yet', style: RunqText.body.copyWith(color: t.muted)),
    ),
  );

  Widget _recoveriesCard(RunqTokens t, List<HrDeductionRecovery> rows) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: t.hairline, width: 0.5),
      ),
      child: Column(children: [
        for (var i = 0; i < rows.length; i++) ...[
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            child: Row(children: [
              Icon(Icons.event_repeat, size: 16, color: t.muted),
              const SizedBox(width: 10),
              Expanded(
                child: Text('${months[rows[i].month - 1]} ${rows[i].year} payroll run',
                    style: RunqText.body.copyWith(color: t.ink)),
              ),
              Text(hrFormatINR(rows[i].amount), style: RunqText.bodyStrong.copyWith(color: t.ink)),
            ]),
          ),
          if (i < rows.length - 1) Divider(height: 1, color: t.hairlineSoft, indent: 14),
        ],
      ]),
    );
  }

  Widget _actions(BuildContext context, WidgetRef ref, HrDeduction d) {
    return Row(children: [
      Expanded(
        child: OutlinedButton(
          onPressed: () => _edit(context, ref, d),
          style: OutlinedButton.styleFrom(
            padding: const EdgeInsets.symmetric(vertical: 13),
            side: BorderSide(color: RT(context).hairline),
            foregroundColor: RT(context).ink,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
          child: const Text('Edit'),
        ),
      ),
      const SizedBox(width: 8),
      Expanded(
        child: OutlinedButton(
          onPressed: () => _cancel(context, ref, d),
          style: OutlinedButton.styleFrom(
            padding: const EdgeInsets.symmetric(vertical: 13),
            side: const BorderSide(color: Color(0xFFEA580C)),
            foregroundColor: const Color(0xFFEA580C),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
          child: const Text('Cancel'),
        ),
      ),
      const SizedBox(width: 8),
      Expanded(
        child: OutlinedButton(
          onPressed: () => _delete(context, ref, d),
          style: OutlinedButton.styleFrom(
            padding: const EdgeInsets.symmetric(vertical: 13),
            side: const BorderSide(color: Color(0xFFDC2626)),
            foregroundColor: const Color(0xFFDC2626),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
          child: const Text('Delete'),
        ),
      ),
    ]);
  }

  Widget _deleteRow(BuildContext context, WidgetRef ref, HrDeduction d) {
    return SizedBox(
      width: double.infinity,
      child: OutlinedButton(
        onPressed: () => _delete(context, ref, d),
        style: OutlinedButton.styleFrom(
          padding: const EdgeInsets.symmetric(vertical: 13),
          side: const BorderSide(color: Color(0xFFDC2626)),
          foregroundColor: const Color(0xFFDC2626),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
        child: const Text('Delete'),
      ),
    );
  }

  Future<void> _edit(BuildContext context, WidgetRef ref, HrDeduction d) async {
    final ok = await showEditDeductionSheet(context, d);
    if (ok == true) {
      ref.invalidate(hrDeductionDetailProvider(d.id));
      ref.invalidate(hrDeductionsProvider);
    }
  }

  Future<void> _cancel(BuildContext context, WidgetRef ref, HrDeduction d) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Cancel this deduction?'),
        content: const Text('No further amounts will be recovered from payroll.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Keep')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Cancel deduction')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await hrRecoveryRepo.cancelDeduction(d.id);
      ref.invalidate(hrDeductionDetailProvider(d.id));
      ref.invalidate(hrDeductionsProvider);
      if (context.mounted) {
        Navigator.of(context).pop();
        showRunqSnack(context, 'Deduction cancelled', kind: SnackKind.success);
      }
    } on ApiException catch (e) {
      if (context.mounted) showRunqSnack(context, e.message, kind: SnackKind.error);
    } catch (e) {
      if (context.mounted) showRunqSnack(context, 'Failed: $e', kind: SnackKind.error);
    }
  }

  Future<void> _delete(BuildContext context, WidgetRef ref, HrDeduction d) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delete this deduction?'),
        content: const Text('This removes the record entirely. Cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Keep')),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            style: TextButton.styleFrom(foregroundColor: const Color(0xFFDC2626)),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await hrRecoveryRepo.deleteDeduction(d.id);
      ref.invalidate(hrDeductionsProvider);
      if (context.mounted) {
        Navigator.of(context).pop();
        showRunqSnack(context, 'Deduction deleted', kind: SnackKind.success);
      }
    } on ApiException catch (e) {
      // 409 (payroll already recovered against it) lands here — show the
      // server's own message rather than a generic one.
      if (context.mounted) showRunqSnack(context, e.message, kind: SnackKind.error);
    } catch (e) {
      if (context.mounted) showRunqSnack(context, 'Failed: $e', kind: SnackKind.error);
    }
  }
}

// ─── Edit deduction ─────────────────────────────────────────────────────

class _EditDeductionSheet extends ConsumerStatefulWidget {
  final HrDeduction deduction;
  const _EditDeductionSheet({required this.deduction});
  @override
  ConsumerState<_EditDeductionSheet> createState() => _EditDeductionSheetState();
}

class _EditDeductionSheetState extends ConsumerState<_EditDeductionSheet> {
  late String _category;
  late final TextEditingController _description;
  late final TextEditingController _months;
  late int _startMonth, _startYear;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final d = widget.deduction;
    _category = d.category;
    _description = TextEditingController(text: d.description ?? '');
    // Recover-over-N-months is derived (amount / instalment), rounded to
    // the nearest whole month — the server stores the instalment, not N.
    final months = d.instalment > 0 ? (d.amount / d.instalment).round() : 1;
    _months = TextEditingController(text: months <= 1 ? '' : '$months');
    _startMonth = d.startMonth;
    _startYear = d.startYear;
  }

  @override
  void dispose() {
    _description.dispose();
    _months.dispose();
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
            child: Row(children: [Text('Edit deduction', style: RunqText.h4.copyWith(color: t.ink))]),
          ),
          Flexible(child: SingleChildScrollView(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
            child: _fields(),
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

  Widget _fields() {
    return HrFormSection(children: [
      HrSelectField<String>(
        label: 'Category',
        value: _category,
        options: const ['goods_purchase', 'canteen', 'damage', 'uniform', 'fine', 'other'],
        display: hrDeductionCategoryLabel,
        required: true,
        onChanged: (c) => setState(() => _category = c ?? 'other'),
      ),
      HrTextField(
        label: 'Recover over (months)',
        hint: 'Leave blank to recover in one run',
        controller: _months,
        keyboard: TextInputType.number,
        formatters: [FilteringTextInputFormatter.digitsOnly],
        textCapitalization: TextCapitalization.none,
      ),
      Row(children: [
        Expanded(
          child: HrSelectField<int>(
            label: 'Start month',
            value: _startMonth,
            options: List.generate(12, (i) => i + 1),
            display: (m) => const ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m - 1],
            required: true,
            onChanged: (m) => setState(() => _startMonth = m ?? _startMonth),
          ),
        ),
        Expanded(
          child: HrSelectField<int>(
            label: 'Start year',
            value: _startYear,
            options: List.generate(5, (i) => DateTime.now().year - 1 + i),
            display: (y) => '$y',
            required: true,
            onChanged: (y) => setState(() => _startYear = y ?? _startYear),
          ),
        ),
      ]),
      HrTextField(label: 'Description', hint: 'Optional', controller: _description, maxLines: 2),
    ]);
  }

  Future<void> _save() async {
    if (_saving) return;
    setState(() => _saving = true);
    final months = int.tryParse(_months.text.trim());
    final instalment = (months == null || months <= 1) ? null : widget.deduction.amount / months;
    try {
      await hrRecoveryRepo.updateDeduction(
        widget.deduction.id,
        category: _category,
        description: _description.text.trim(),
        instalment: instalment,
        startMonth: _startMonth,
        startYear: _startYear,
      );
      if (!mounted) return;
      Navigator.of(context).pop(true);
      showRunqSnack(context, 'Deduction updated', kind: SnackKind.success);
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
