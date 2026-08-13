// Advance (employee loan) detail sheet — instalment schedule (which are
// paid/part-paid and which payroll run took them) plus Edit / Write off /
// Delete. Opened by tapping an advance row on the Advances tab of
// hr_recoveries_screen.dart, or an advance line in an employee's Pay tab.
//
// NOT to be confused with widgets/hr_advance_sheet.dart, which records an
// advance against a *contract-labour* engagement — a different concept.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../api/api_client.dart';
import '../../../api/hr_phase_next.dart';
import '../../../api/hr_recovery.dart';
import '../../../providers/app_role_provider.dart';
import '../../../theme/runq_theme.dart';
import '../../../theme/runq_tokens.dart';
import '../../../widgets/runq_snack.dart';
import 'hr_advance_edit_sheet.dart';
import 'hr_colors.dart';
import 'hr_recovery_sheets.dart';
import 'hr_widgets.dart';

/// Loan states with nothing left to edit or retire.
const _terminalLoanStatuses = <String>{'closed', 'written_off', 'rejected'};

Future<void> showAdvanceDetailSheet(
  BuildContext context, {
  required String loanId,
  required String employeeId,
}) {
  return showModalBottomSheet<void>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (_) => _AdvanceDetailSheet(loanId: loanId, employeeId: employeeId),
  );
}

class _AdvanceDetailSheet extends ConsumerWidget {
  final String loanId, employeeId;
  const _AdvanceDetailSheet({required this.loanId, required this.employeeId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final query = HrAdvanceDetailQuery(loanId: loanId, employeeId: employeeId);
    final async = ref.watch(hrAdvanceDetailProvider(query));
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
  final HrAdvanceDetail detail;
  const _DetailBody({required this.detail});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final loan = detail.loan;
    final l = loan.loan;
    final role = ref.watch(appRoleProvider);
    final canManage = !_terminalLoanStatuses.contains(l.status);
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
                  Text(loan.employeeName, style: RunqText.h4.copyWith(color: t.ink)),
                  if (loan.employeeCode != null)
                    Text(loan.employeeCode!, style: RunqText.caption.copyWith(color: t.muted)),
                ],
              ),
            ),
            HrStatusBadge(status: l.status),
          ]),
          const SizedBox(height: 12),
          _summaryCard(t, loan),
          if (l.reason != null && l.reason!.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(l.reason!, style: RunqText.body.copyWith(color: t.muted)),
          ],
          const SizedBox(height: 18),
          Text('INSTALMENT SCHEDULE', style: RunqText.label.copyWith(color: t.muted2, letterSpacing: 0.5)),
          const SizedBox(height: 8),
          if (detail.instalments.isEmpty)
            _emptySchedule(t)
          else
            _scheduleCard(t, detail.instalments),
          if (canManage) ...[
            const SizedBox(height: 20),
            _actions(context, ref, loan, role),
          ],
        ],
      ),
    );
  }

  Widget _summaryCard(RunqTokens t, HrAdminLoan loan) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    final l = loan.loan;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: t.hairline, width: 0.5),
      ),
      child: Column(children: [
        _row(t, hrLoanKindLabel(l.kind), hrFormatINR(l.principal)),
        _row(t, 'EMI', hrFormatINR(l.emiAmount)),
        _row(t, 'Outstanding', hrFormatINR(l.outstanding)),
        _row(t, 'First EMI', '${months[l.firstEmiMonth - 1]} ${l.firstEmiYear}'),
        if (loan.isDisbursed)
          _row(t, 'Disbursed on',
              '${l.disbursedOn.day} ${months[l.disbursedOn.month - 1]} ${l.disbursedOn.year}'),
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

  Widget _emptySchedule(RunqTokens t) => Container(
    width: double.infinity,
    padding: const EdgeInsets.symmetric(vertical: 20),
    decoration: BoxDecoration(
      color: t.surface,
      borderRadius: BorderRadius.circular(RunqRadii.smallCard),
      border: Border.all(color: t.hairline, width: 0.5),
    ),
    child: Center(
      child: Text('No instalments scheduled', style: RunqText.body.copyWith(color: t.muted)),
    ),
  );

  Widget _scheduleCard(RunqTokens t, List<HrLoanInstalment> rows) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: t.hairline, width: 0.5),
      ),
      child: Column(children: [
        for (var i = 0; i < rows.length; i++) ...[
          _instalmentRow(t, rows[i], months),
          if (i < rows.length - 1) Divider(height: 1, color: t.hairlineSoft, indent: 14),
        ],
      ]),
    );
  }

  Widget _instalmentRow(RunqTokens t, HrLoanInstalment inst, List<String> months) {
    final isPaid = inst.isPaid;
    final isPartPaid = inst.isPartPaid;
    final color = isPaid ? const Color(0xFF16A34A) : (isPartPaid ? const Color(0xFFEA580C) : t.muted);
    final icon = isPaid ? Icons.check_circle_rounded : (isPartPaid ? Icons.timelapse_rounded : Icons.schedule_rounded);
    final statusLabel = isPaid
        ? 'Recovered${inst.paidPayrollRunId != null ? ' via payroll run' : ''}'
        : (isPartPaid ? 'Part recovered' : 'Pending');
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(children: [
        Icon(icon, size: 16, color: color),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('${months[inst.dueMonth - 1]} ${inst.dueYear}', style: RunqText.body.copyWith(color: t.ink)),
              Text(statusLabel, style: RunqText.caption.copyWith(color: color)),
            ],
          ),
        ),
        Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(hrFormatINR(inst.amount), style: RunqText.bodyStrong.copyWith(color: t.ink)),
            if (isPartPaid)
              Text('${hrFormatINR(inst.paidAmount)} recovered',
                  style: RunqText.caption.copyWith(color: t.muted)),
          ],
        ),
      ]),
    );
  }

  Widget _actions(BuildContext context, WidgetRef ref, HrAdminLoan loan, AppRole role) {
    final canWriteOff = role == AppRole.admin;
    final canDelete = !loan.isDisbursed;
    final buttons = <Widget>[
      _actionButton(context, 'Edit', RT(context).hairline, RT(context).ink,
          () => _edit(context, ref, loan)),
      if (canWriteOff)
        _actionButton(context, 'Write off', const Color(0xFFEA580C), const Color(0xFFEA580C),
            () => _writeOff(context, ref, loan)),
      if (canDelete)
        _actionButton(context, 'Delete', const Color(0xFFDC2626), const Color(0xFFDC2626),
            () => _delete(context, ref, loan)),
    ];
    return Row(children: [
      for (var i = 0; i < buttons.length; i++) ...[
        if (i > 0) const SizedBox(width: 8),
        Expanded(child: buttons[i]),
      ],
    ]);
  }

  Widget _actionButton(BuildContext context, String label, Color side, Color fg, VoidCallback onPressed) {
    return OutlinedButton(
      onPressed: onPressed,
      style: OutlinedButton.styleFrom(
        padding: const EdgeInsets.symmetric(vertical: 13),
        side: BorderSide(color: side),
        foregroundColor: fg,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
      child: Text(label),
    );
  }

  Future<void> _edit(BuildContext context, WidgetRef ref, HrAdminLoan loan) async {
    final ok = await showEditAdvanceSheet(context, loan);
    if (ok == true) _refresh(ref, loan);
  }

  void _refresh(WidgetRef ref, HrAdminLoan loan) {
    ref.invalidate(hrAdvanceDetailProvider(HrAdvanceDetailQuery(loanId: loan.loan.id, employeeId: loan.employeeId)));
    ref.invalidate(hrAdminLoansProvider);
    ref.invalidate(hrEmployeeRecoverySummaryProvider(loan.employeeId));
    ref.invalidate(myLoansProvider);
  }

  Future<void> _writeOff(BuildContext context, WidgetRef ref, HrAdminLoan loan) async {
    final reasonCtrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Write off this advance?'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('The remaining balance stops being recovered. Settled instalments and history stay as they are.'),
            const SizedBox(height: 12),
            TextField(
              controller: reasonCtrl,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(hintText: 'Reason (optional)'),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Keep')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Write off')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await hrRecoveryRepo.writeOffLoan(
        loan.loan.id,
        reason: reasonCtrl.text.trim().isEmpty ? null : reasonCtrl.text.trim(),
      );
      _refresh(ref, loan);
      if (context.mounted) {
        Navigator.of(context).pop();
        showRunqSnack(context, 'Advance written off', kind: SnackKind.success);
      }
    } on ApiException catch (e) {
      if (context.mounted) showRunqSnack(context, e.message, kind: SnackKind.error);
    } catch (e) {
      if (context.mounted) showRunqSnack(context, 'Failed: $e', kind: SnackKind.error);
    }
  }

  Future<void> _delete(BuildContext context, WidgetRef ref, HrAdminLoan loan) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delete this advance?'),
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
      await hrRecoveryRepo.deleteLoan(loan.loan.id);
      ref.invalidate(hrAdminLoansProvider);
      ref.invalidate(hrEmployeeRecoverySummaryProvider(loan.employeeId));
      ref.invalidate(myLoansProvider);
      if (context.mounted) {
        Navigator.of(context).pop();
        showRunqSnack(context, 'Advance deleted', kind: SnackKind.success);
      }
    } on ApiException catch (e) {
      // 409 (already disbursed/recovered against) lands here — show the
      // server's own message, which points at write-off instead.
      if (context.mounted) showRunqSnack(context, e.message, kind: SnackKind.error);
    } catch (e) {
      if (context.mounted) showRunqSnack(context, 'Failed: $e', kind: SnackKind.error);
    }
  }
}
