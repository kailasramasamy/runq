// Pay tab — three sub-tabs that flip based on persona:
//   Employee: Payslips | Leave | Expenses
//   Manager:  Payroll  | Approvals | Expenses
// The initial tab can be overridden via ?tab= query string (e.g. the FAB
// "Apply for leave" lands on `tab=leave`).

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/hr_models.dart';
import '../../api/hr_repo.dart';
import '../../providers/hr_persona_provider.dart';
import '../../providers/hr_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_snack.dart';
import 'widgets/hr_colors.dart';
import 'widgets/hr_widgets.dart';

class HrPayScreen extends ConsumerStatefulWidget {
  final String? initialTab;
  const HrPayScreen({super.key, this.initialTab});

  @override
  ConsumerState<HrPayScreen> createState() => _HrPayScreenState();
}

class _HrPayScreenState extends ConsumerState<HrPayScreen> {
  int _tab = 0;

  @override
  void initState() {
    super.initState();
    switch (widget.initialTab) {
      case 'leave': case 'approvals': _tab = 1; break;
      case 'expenses': _tab = 2; break;
      default: _tab = 0;
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final persona = ref.watch(hrPersonaProvider);
    final me = ref.watch(hrMeProvider).asData?.value;
    final manager = (me?.isManager ?? false) && persona == HrPersona.manager;
    final labels = manager
        ? const ['Payroll', 'Approvals', 'Expenses']
        : const ['Payslips', 'Leave', 'Expenses'];

    return Scaffold(
      backgroundColor: t.bgWarm,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 12, 20, 8),
              child: Row(
                children: [
                  IconButton(
                    onPressed: () => Navigator.of(context).maybePop(),
                    icon: Icon(Icons.arrow_back_rounded, color: t.ink),
                  ),
                  const SizedBox(width: 4),
                  Text(manager ? 'Pay & Approvals' : 'Pay', style: RunqText.h1.copyWith(color: t.ink)),
                ],
              ),
            ),
            _SubTabs(labels: labels, active: _tab, onChange: (i) => setState(() => _tab = i)),
            Expanded(
              child: IndexedStack(
                index: _tab,
                children: manager
                    ? const [_PayrollTab(), _ApprovalsTab(), _ExpensesTab()]
                    : const [_PayslipsTab(), _LeaveTab(), _ExpensesTab()],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SubTabs extends StatelessWidget {
  final List<String> labels;
  final int active;
  final ValueChanged<int> onChange;
  const _SubTabs({required this.labels, required this.active, required this.onChange});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    // In dark mode the active pill takes the surface tone so its text reads
    // against it; the trough stays the same neutral semi-transparent gray.
    final pillBg = isDark ? t.surface : Colors.white;
    final pillInk = isDark ? t.ink : Colors.black;
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: const Color(0x1F767680),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: List.generate(labels.length, (i) {
          final sel = i == active;
          return Expanded(
            child: GestureDetector(
              onTap: () => onChange(i),
              behavior: HitTestBehavior.opaque,
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 180),
                padding: const EdgeInsets.symmetric(vertical: 8),
                decoration: BoxDecoration(
                  color: sel ? pillBg : Colors.transparent,
                  borderRadius: BorderRadius.circular(8),
                  boxShadow: sel
                      ? const [BoxShadow(color: Color(0x1F000000), blurRadius: 3, offset: Offset(0, 1))]
                      : null,
                ),
                child: Center(
                  child: Text(
                    labels[i],
                    style: TextStyle(
                      color: sel ? pillInk : t.muted,
                      fontSize: 13, fontWeight: sel ? FontWeight.w600 : FontWeight.w500,
                    ),
                  ),
                ),
              ),
            ),
          );
        }),
      ),
    );
  }
}

// ─── Employee → Payslips ──────────────────────────────────────────────────

class _PayslipsTab extends ConsumerWidget {
  const _PayslipsTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final slips = ref.watch(hrMyPayslipsProvider);
    return RefreshIndicator(
      color: HrColors.brand(context),
      onRefresh: () async {
        ref.invalidate(hrMyPayslipsProvider);
        await Future<void>.delayed(const Duration(milliseconds: 250));
      },
      child: slips.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e', style: RunqText.body.copyWith(color: t.muted))),
        data: (list) {
          if (list.isEmpty) {
            return ListView(
              physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
              children: [
                const SizedBox(height: 60),
                Center(child: Text('No payslips yet', style: RunqText.body.copyWith(color: t.muted))),
              ],
            );
          }
          final latest = list.first;
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 140),
            physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
            children: [
              HrPayslipHero(
                periodLabel: latest.periodLabel,
                netPay: latest.netPay,
                gross: latest.gross,
                deductions: latest.totalDeductions,
                workingDays: latest.workingDays,
                statusLabel: _runStatusLabel(latest.runStatus),
                onTap: () => context.push('/hr/payslips/${latest.payrollRunId}/${latest.id}'),
              ),
              const SizedBox(height: 16),
              Text('Previous', style: RunqText.bodyStrong.copyWith(color: t.ink)),
              const SizedBox(height: 8),
              for (final ps in list.skip(1)) _PayslipRow(ps: ps),
            ],
          );
        },
      ),
    );
  }

  static String _runStatusLabel(String s) => switch (s) {
        'closed' || 'approved' => 'Paid',
        'processed' => 'Processed',
        _ => 'Draft',
      };
}

class _PayslipRow extends StatelessWidget {
  final HrPayslip ps;
  const _PayslipRow({required this.ps});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: t.hairline, width: 0.5),
      ),
      child: InkWell(
        onTap: () => context.push('/hr/payslips/${ps.payrollRunId}/${ps.id}'),
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(ps.periodLabel, style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 14)),
                    const SizedBox(height: 2),
                    Text('Gross ${hrFormatINR(ps.gross)}', style: RunqText.caption.copyWith(color: t.muted)),
                  ],
                ),
              ),
              Text(hrFormatINR(ps.netPay), style: RunqText.tabular(size: 15, w: FontWeight.w700, color: t.ink)),
              const SizedBox(width: 4),
              Icon(Icons.chevron_right_rounded, size: 18, color: t.muted),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Employee → Leave ─────────────────────────────────────────────────────

class _LeaveTab extends ConsumerWidget {
  const _LeaveTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final balances = ref.watch(hrMyLeaveBalancesProvider);
    final reqs = ref.watch(hrMyLeaveRequestsProvider);
    final types = ref.watch(hrLeaveTypesProvider);

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 140),
      physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
      children: [
        balances.when(
          data: (rows) => rows.isEmpty
              ? Text('No leave balances', style: RunqText.body.copyWith(color: t.muted))
              : Row(
                  children: [
                    for (var i = 0; i < rows.take(3).length; i++) ...[
                      Expanded(
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          decoration: BoxDecoration(
                            color: t.surface,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: t.hairline, width: 0.5),
                            boxShadow: RunqShadows.card,
                          ),
                          child: Column(
                            children: [
                              Text(rows[i].balance.toStringAsFixed(rows[i].balance % 1 == 0 ? 0 : 1),
                                  style: TextStyle(color: t.ink, fontSize: 20, fontWeight: FontWeight.w700)),
                              Text(rows[i].typeCode, style: TextStyle(color: t.muted, fontSize: 11, fontWeight: FontWeight.w600)),
                            ],
                          ),
                        ),
                      ),
                      if (i < rows.take(3).length - 1) const SizedBox(width: 8),
                    ],
                  ],
                ),
          loading: () => const SizedBox.shrink(),
          error: (_, __) => const SizedBox.shrink(),
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            Text('Requests', style: RunqText.bodyStrong.copyWith(color: t.ink)),
            const Spacer(),
            TextButton(
              onPressed: types.asData == null ? null : () async {
                final tlist = types.asData!.value
                    .map((lt) => (id: lt.id, code: lt.code, name: lt.name))
                    .toList();
                final res = await showApplyLeaveSheet(context, leaveTypes: tlist);
                if (res == null) return;
                final me = ref.read(hrMeProvider).asData?.value;
                final empId = me?.employee?.id;
                if (empId == null) {
                  if (context.mounted) showRunqSnack(context, 'No employee record linked', kind: SnackKind.error);
                  return;
                }
                try {
                  await hrRepo.applyLeave(
                    employeeId: empId,
                    leaveTypeId: res.leaveTypeId,
                    fromDate: res.fromDate,
                    toDate: res.toDate,
                    halfDay: res.halfDay,
                    reason: res.reason,
                  );
                  ref.invalidate(hrMyLeaveRequestsProvider);
                  ref.invalidate(hrMyLeaveBalancesProvider);
                  if (context.mounted) showRunqSnack(context, 'Leave request submitted', kind: SnackKind.success);
                } catch (e) {
                  if (context.mounted) showRunqSnack(context, '$e', kind: SnackKind.error);
                }
              },
              child: const Text('Apply'),
            ),
          ],
        ),
        const SizedBox(height: 4),
        reqs.when(
          data: (rows) {
            if (rows.isEmpty) return Padding(padding: const EdgeInsets.symmetric(vertical: 24), child: Center(child: Text('No leave requests yet', style: RunqText.body.copyWith(color: t.muted))));
            return Column(children: rows.map((r) => _LeaveRow(req: r)).toList());
          },
          loading: () => const Padding(padding: EdgeInsets.symmetric(vertical: 24), child: Center(child: CircularProgressIndicator())),
          error: (e, _) => Text('$e', style: RunqText.body.copyWith(color: t.muted)),
        ),
      ],
    );
  }
}

class _LeaveRow extends ConsumerWidget {
  final HrLeaveRequest req;
  const _LeaveRow({required this.req});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    final dateLabel = req.fromDate == req.toDate
        ? '${req.fromDate.day} ${m[req.fromDate.month - 1]}'
        : '${req.fromDate.day} ${m[req.fromDate.month - 1]} → ${req.toDate.day} ${m[req.toDate.month - 1]}';
    // The leave list on Pay shows the logged-in user's own requests, so a
    // pending row is always cancellable from here without an ownership
    // check (server enforces too).
    final canCancel = req.status == 'pending';
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: t.hairline, width: 0.5),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(req.typeName, style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 13)),
                const SizedBox(height: 2),
                Text('$dateLabel · ${req.totalDays.toStringAsFixed(req.totalDays % 1 == 0 ? 0 : 1)}d',
                    style: RunqText.caption.copyWith(color: t.muted)),
              ],
            ),
          ),
          HrStatusBadge(status: req.status),
          if (canCancel) ...[
            const SizedBox(width: 4),
            IconButton(
              tooltip: 'Cancel request',
              icon: Icon(Icons.close_rounded, color: t.muted, size: 18),
              visualDensity: VisualDensity.compact,
              onPressed: () => _confirmCancel(context, ref, req),
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _confirmCancel(BuildContext context, WidgetRef ref, HrLeaveRequest r) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Cancel this leave request?'),
        content: Text('${r.typeName} · ${r.totalDays.toStringAsFixed(r.totalDays % 1 == 0 ? 0 : 1)} day(s)'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Keep')),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: TextButton.styleFrom(foregroundColor: const Color(0xFFDC2626)),
            child: const Text('Cancel request'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await hrRepo.cancelLeave(r.id);
      ref.invalidate(hrMyLeaveRequestsProvider);
      ref.invalidate(hrMyLeaveBalancesProvider);
      if (context.mounted) showRunqSnack(context, 'Leave request cancelled', kind: SnackKind.success);
    } catch (e) {
      if (context.mounted) showRunqSnack(context, 'Could not cancel: $e', kind: SnackKind.error);
    }
  }
}

// ─── Manager → Payroll ────────────────────────────────────────────────────

class _PayrollTab extends ConsumerWidget {
  const _PayrollTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final dashboard = ref.watch(hrDashboardProvider);
    final now = DateTime.now();
    const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 140),
      physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
      children: [
        dashboard.when(
          data: (d) => Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              gradient: const LinearGradient(colors: [Color(0xFF0E7490), Color(0xFF06B6D4)]),
              borderRadius: BorderRadius.circular(RunqRadii.card),
              boxShadow: RunqShadows.card,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('${m[(d.payrollMonth >= 1 && d.payrollMonth <= 12 ? d.payrollMonth : now.month) - 1]} ${d.payrollYear > 0 ? d.payrollYear : now.year}',
                    style: const TextStyle(color: Colors.white70, fontSize: 13)),
                const SizedBox(height: 6),
                Text(d.payrollTotalNet > 0 ? hrFormatINR(d.payrollTotalNet) : '—',
                    style: const TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w800)),
                const SizedBox(height: 2),
                Text(
                  d.payrollRunId == null
                      ? 'No run started yet'
                      : 'Latest run · ${(d.payrollStatus ?? 'draft').replaceAll('_', ' ')}',
                  style: const TextStyle(color: Colors.white70, fontSize: 12),
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    Expanded(child: _heroStat('Salary missing', '${d.employeesWithoutSalary}')),
                    const SizedBox(width: 12),
                    Expanded(child: _heroStat('Attendance gaps', '${d.attendanceNotMarkedToday}')),
                  ],
                ),
              ],
            ),
          ),
          loading: () => const SizedBox(height: 140, child: Center(child: CircularProgressIndicator())),
          error: (_, __) => Text('Could not load payroll summary', style: RunqText.body.copyWith(color: t.muted)),
        ),
        const SizedBox(height: 16),
        Text('Manage payroll runs from the web app for now.',
            style: RunqText.caption.copyWith(color: t.muted)),
      ],
    );
  }

  Widget _heroStat(String label, String value) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(color: Colors.white70, fontSize: 11)),
          const SizedBox(height: 2),
          Text(value, style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w700)),
        ],
      );
}

// ─── Manager → Approvals ─────────────────────────────────────────────────

class _ApprovalsTab extends ConsumerWidget {
  const _ApprovalsTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final pending = ref.watch(hrPendingLeaveRequestsProvider);
    return RefreshIndicator(
      color: HrColors.brand(context),
      onRefresh: () async {
        ref.invalidate(hrPendingLeaveRequestsProvider);
        await Future<void>.delayed(const Duration(milliseconds: 250));
      },
      child: pending.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e', style: RunqText.body.copyWith(color: t.muted))),
        data: (rows) {
          if (rows.isEmpty) {
            return ListView(
              physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
              padding: const EdgeInsets.fromLTRB(16, 30, 16, 140),
              children: [
                const SizedBox(height: 30),
                Center(child: Text('🎉', style: TextStyle(fontSize: 36))),
                const SizedBox(height: 8),
                Center(child: Text('All caught up!', style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 16))),
                const SizedBox(height: 4),
                Center(child: Text('No pending leave requests', style: RunqText.caption.copyWith(color: t.muted))),
              ],
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 140),
            physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
            itemCount: rows.length,
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (_, i) {
              final r = rows[i];
              return HrPendingLeaveCard(
                employeeId: r.employeeId,
                employeeName: r.employeeName,
                employeeCode: r.employeeCode,
                employeePhotoUrl: r.employeePhotoUrl,
                leaveTypeName: r.typeName,
                fromDate: r.fromDate,
                toDate: r.toDate,
                totalDays: r.totalDays,
                reason: r.reason,
                onDecide: (approved) async {
                  try {
                    await hrRepo.reviewLeave(
                      id: r.id,
                      approved: approved,
                      rejectionReason: approved ? null : 'Rejected from mobile',
                    );
                  } catch (e) {
                    if (context.mounted) showRunqSnack(context, 'Could not update request', kind: SnackKind.error);
                  }
                  ref.invalidate(hrPendingLeaveRequestsProvider);
                },
              );
            },
          );
        },
      ),
    );
  }
}

// ─── Shared → Expenses (lightweight stub that links into Finance) ─────────

class _ExpensesTab extends StatelessWidget {
  const _ExpensesTab();

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 140),
      physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
      children: [
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: t.surface,
            borderRadius: BorderRadius.circular(RunqRadii.smallCard),
            border: Border.all(color: t.hairline, width: 0.5),
            boxShadow: RunqShadows.card,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Expense claims', style: RunqText.bodyStrong.copyWith(color: t.ink)),
              const SizedBox(height: 4),
              Text('Use the dedicated Expenses screen to submit, browse, and approve out-of-pocket claims.',
                  style: RunqText.caption.copyWith(color: t.muted)),
              const SizedBox(height: 14),
              Align(
                alignment: Alignment.centerLeft,
                child: FilledButton(
                  onPressed: () => context.push('/hr/expense-claims'),
                  style: FilledButton.styleFrom(
                    backgroundColor: HrColors.teal,
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  child: const Text('Open Expenses'),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
