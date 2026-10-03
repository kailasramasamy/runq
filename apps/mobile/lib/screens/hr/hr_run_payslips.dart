import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/hr_models.dart';
import '../../providers/hr_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/status_pill.dart';
import 'widgets/hr_widgets.dart';

/// A run's payslips. Once the run is approved each row also says whether
/// that employee's salary has been transferred, so the owner can see at a
/// glance who is still to be paid.
class RunPayslipsCard extends ConsumerWidget {
  final HrPayrollRun run;
  final List<HrPayslip> slips;
  const RunPayslipsCard({super.key, required this.run, required this.slips});

  bool get _tracksTransfers => run.status == 'approved' || run.status == 'closed';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final transfers = _tracksTransfers ? ref.watch(hrRunTransfersProvider(run.id)).value : null;
    final paid = transfers == null
        ? null
        : slips.where((s) => transfers[s.employeeId]?.isPaid ?? false).length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 0, 4, 6),
          child: Row(
            children: [
              Expanded(
                child: Text('PAYSLIPS (${slips.length})',
                    style: RunqText.label.copyWith(color: t.muted2, letterSpacing: 0.5)),
              ),
              if (paid != null)
                Text('$paid of ${slips.length} paid', style: RunqText.caption.copyWith(color: t.muted)),
            ],
          ),
        ),
        Container(
          decoration: BoxDecoration(
            color: t.surface,
            borderRadius: BorderRadius.circular(RunqRadii.smallCard),
            border: Border.all(color: t.hairline, width: 0.5),
            boxShadow: RunqShadows.card,
          ),
          child: Column(
            children: [
              for (var i = 0; i < slips.length; i++) ...[
                _PayslipRow(runId: run.id, ps: slips[i], transfer: transfers?[slips[i].employeeId], tracked: transfers != null),
                if (i < slips.length - 1)
                  Divider(height: 1, thickness: 0.5, color: t.hairlineSoft, indent: 14),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _PayslipRow extends StatelessWidget {
  final String runId;
  final HrPayslip ps;
  final HrSalaryTransfer? transfer;
  final bool tracked;
  const _PayslipRow({required this.runId, required this.ps, required this.transfer, required this.tracked});

  String _days(double d) => d.toStringAsFixed(d % 1 == 0 ? 0 : 1);

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final paid = transfer?.isPaid ?? false;
    return InkWell(
      onTap: () => context.push('/hr/payslips/$runId/${ps.id}'),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            HrAvatar(name: ps.employeeName ?? ps.employeeId, employeeId: ps.employeeId, size: 36),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(ps.employeeName ?? '—',
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: RunqText.bodyStrong.copyWith(color: t.ink)),
                  const SizedBox(height: 2),
                  Text(
                    [
                      if (ps.employeeCode != null) ps.employeeCode!,
                      'Paid ${_days(ps.paidDays)}d',
                      if (ps.lopDays > 0) 'LOP ${_days(ps.lopDays)}d',
                      if (paid && (transfer!.reference?.isNotEmpty ?? false)) 'UTR ${transfer!.reference}',
                    ].join(' · '),
                    style: RunqText.caption.copyWith(color: t.muted),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(hrFormatINR(ps.netPay),
                    style: RunqText.tabular(size: 14, w: FontWeight.w700, color: t.ink)),
                if (tracked && ps.netPay > 0) ...[
                  const SizedBox(height: 4),
                  StatusPill(paid ? 'paid' : 'pending', label: paid ? 'PAID' : 'NOT PAID'),
                ],
              ],
            ),
            const SizedBox(width: 4),
            Icon(Icons.chevron_right_rounded, size: 16, color: t.muted2),
          ],
        ),
      ),
    );
  }
}
