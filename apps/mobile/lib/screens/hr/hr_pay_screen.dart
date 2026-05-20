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
import 'hr_expense_claims_screen.dart';
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
    final systemRole = me?.systemRole.toLowerCase();
    final isAdminHr = systemRole == 'owner'
        || systemRole == 'accountant'
        || systemRole == 'hr';
    // The admin / HR "team payroll" surface stays on Pay (they run
    // payroll from here). Plain managers — Ramesh's case — don't have a
    // team payroll function, so Pay shows their own pay items same as
    // My View. Team-review surfaces (Leaves, Expenses) live as
    // dedicated routes pushed from Home quick actions.
    final manager = isAdminHr && persona == HrPersona.manager;
    final labels = manager
        ? const ['Payroll', 'Approvals', 'Expenses']
        : const ['Payslips', 'Leave', 'Expenses'];

    // Parent scaffold owns a single FAB that swaps action by sub-tab:
    //   Leave tab    → Apply leave  (employees only)
    //   Expenses tab → New claim    (everyone — managers can also file)
    // Manager Approvals tab gets no FAB; review actions live in-row.
    final showApplyLeaveFab = !manager && _tab == 1;
    // "New claim" only makes sense in My View — Manager view's Expenses
    // tab is a review/approval queue, not a place to file your own.
    final showNewClaimFab = !manager && _tab == 2;

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
      floatingActionButton: showApplyLeaveFab
          ? FloatingActionButton.extended(
              heroTag: 'apply-leave',
              backgroundColor: HrColors.teal,
              foregroundColor: Colors.white,
              icon: const Icon(Icons.event_available_rounded),
              label: const Text('Apply leave'),
              onPressed: () => _openApplyLeave(),
            )
          : showNewClaimFab
              ? FloatingActionButton.extended(
                  heroTag: 'new-claim',
                  backgroundColor: HrColors.teal,
                  foregroundColor: Colors.white,
                  icon: const Icon(Icons.add_rounded),
                  label: const Text('New claim'),
                  onPressed: () => context.push('/hr/expense-claims/new'),
                )
              : null,
    );
  }

  Future<void> _openApplyLeave() async {
    final types = await ref.read(hrMyLeaveTypesProvider.future);
    final tlist = types.map((lt) => (id: lt.id, code: lt.code, name: lt.name)).toList();
    if (!mounted) return;
    final res = await showApplyLeaveSheet(context, leaveTypes: tlist);
    if (res == null) return;
    final me = ref.read(hrMeProvider).asData?.value;
    final empId = me?.employee?.id;
    if (empId == null) {
      if (mounted) showRunqSnack(context, 'No employee record linked', kind: SnackKind.error);
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
      if (mounted) showRunqSnack(context, 'Leave request submitted', kind: SnackKind.success);
    } catch (e) {
      if (mounted) showRunqSnack(context, '$e', kind: SnackKind.error);
    }
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
    // Trough uses a theme-aware soft hairline (was a fixed grey that
    // looked muddy on white and washed out on dark). Active pill rides
    // on surface with a thin hairline border + deeper drop shadow so it
    // reads as a tactile layer, not just a color swap.
    final troughBg = isDark
        ? Colors.white.withValues(alpha: 0.05)
        : Colors.black.withValues(alpha: 0.05);
    final pillBg = t.surface;
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: troughBg,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: List.generate(labels.length, (i) {
          final sel = i == active;
          return Expanded(
            child: GestureDetector(
              onTap: () => onChange(i),
              behavior: HitTestBehavior.opaque,
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 220),
                curve: Curves.easeOutCubic,
                padding: const EdgeInsets.symmetric(vertical: 9),
                decoration: BoxDecoration(
                  color: sel ? pillBg : Colors.transparent,
                  borderRadius: BorderRadius.circular(9),
                  border: sel ? Border.all(color: t.hairline, width: 0.5) : null,
                  boxShadow: sel
                      ? [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: isDark ? 0.32 : 0.08),
                            blurRadius: 6,
                            offset: const Offset(0, 1),
                          ),
                        ]
                      : null,
                ),
                child: Center(
                  child: AnimatedDefaultTextStyle(
                    duration: const Duration(milliseconds: 200),
                    style: TextStyle(
                      color: sel ? t.ink : t.muted,
                      fontSize: 13,
                      fontWeight: sel ? FontWeight.w700 : FontWeight.w500,
                      letterSpacing: sel ? 0.1 : 0.0,
                    ),
                    child: Text(labels[i]),
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
                paidDays: latest.paidDays,
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
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  // Match the hero's clamp: never show a negative
                  // paycheck on a list row. The detail screen still
                  // has the full breakdown if HR digs in.
                  Text(hrFormatINR(ps.netPay < 0 ? 0 : ps.netPay),
                      style: RunqText.tabular(size: 15, w: FontWeight.w700, color: t.ink)),
                  if (ps.netPay < 0)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text('${hrFormatINR(-ps.netPay)} owed',
                          style: RunqText.caption.copyWith(
                              color: const Color(0xFFDC2626), fontSize: 10.5, fontWeight: FontWeight.w600)),
                    ),
                ],
              ),
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

    return RefreshIndicator(
      color: HrColors.brand(context),
      onRefresh: () async {
        ref.invalidate(hrMyLeaveBalancesProvider);
        ref.invalidate(hrMyLeaveRequestsProvider);
        await Future<void>.delayed(const Duration(milliseconds: 250));
      },
      child: ListView(
      padding: const EdgeInsets.fromLTRB(16, 32, 16, 140),
      physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
      children: [
        balances.when(
          data: (rows) {
            if (rows.isEmpty) {
              return Text('No leave balances', style: RunqText.body.copyWith(color: t.muted));
            }
            // Show up to 5 pills to match the Home strip — the earlier
            // 3-cap silently hid EL (the only accruing type) plus LOP.
            // Per-pill width shrinks via Expanded; 5 fit comfortably.
            final shown = rows.take(5).toList();
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    for (var i = 0; i < shown.length; i++) ...[
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
                              Text(shown[i].balance.toStringAsFixed(shown[i].balance % 1 == 0 ? 0 : 1),
                                  style: TextStyle(color: t.ink, fontSize: 20, fontWeight: FontWeight.w700)),
                              Text(shown[i].typeCode,
                                  style: TextStyle(color: t.muted, fontSize: 11, fontWeight: FontWeight.w600)),
                            ],
                          ),
                        ),
                      ),
                      if (i < shown.length - 1) const SizedBox(width: 8),
                    ],
                  ],
                ),
                // Legend — codes alone aren't self-explanatory ("EL"?
                // "LOP"?). The full names come straight off the balance
                // rows so a tenant that adds custom types (e.g. BL =
                // Bereavement) gets the right legend automatically, no
                // hardcoded mapping.
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 6,
                  children: [
                    for (final b in shown) _LegendChip(code: b.typeCode, name: b.typeName, t: t),
                  ],
                ),
              ],
            );
          },
          loading: () => const SizedBox.shrink(),
          error: (_, __) => const SizedBox.shrink(),
        ),
        const SizedBox(height: 32),
        reqs.when(
          data: (rows) {
            if (rows.isEmpty) {
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 24),
                child: Center(child: Text('No leave requests yet',
                    style: RunqText.body.copyWith(color: t.muted))),
              );
            }
            // Split into "Active" (pending, or approved still upcoming /
            // in progress) vs "History" (approved-past, rejected,
            // cancelled). Both sorted newest-applied first so the most
            // recent action is at the top of its section.
            final today = DateTime(DateTime.now().year, DateTime.now().month, DateTime.now().day);
            final active = <HrLeaveRequest>[];
            final history = <HrLeaveRequest>[];
            for (final r in rows) {
              final isActive = r.status == 'pending' ||
                  (r.status == 'approved' && !r.toDate.isBefore(today));
              (isActive ? active : history).add(r);
            }
            int byApplied(HrLeaveRequest a, HrLeaveRequest b) {
              final ta = a.appliedAt?.millisecondsSinceEpoch ?? 0;
              final tb = b.appliedAt?.millisecondsSinceEpoch ?? 0;
              return tb.compareTo(ta);
            }
            active.sort(byApplied);
            history.sort(byApplied);
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (active.isNotEmpty) ...[
                  _LeaveSectionHeader(label: 'Active', count: active.length, ink: t.ink, muted: t.muted),
                  const SizedBox(height: 4),
                  ...active.map((r) => _LeaveRow(req: r)),
                ],
                if (history.isNotEmpty) ...[
                  SizedBox(height: active.isEmpty ? 0 : 32),
                  _LeaveSectionHeader(label: 'History', count: history.length, ink: t.ink, muted: t.muted),
                  const SizedBox(height: 4),
                  ...history.map((r) => _LeaveRow(req: r)),
                ],
              ],
            );
          },
          loading: () => const Padding(padding: EdgeInsets.symmetric(vertical: 24), child: Center(child: CircularProgressIndicator())),
          error: (e, _) => Text('$e', style: RunqText.body.copyWith(color: t.muted)),
        ),
      ],
      ),
    );
  }
}

// Compact "CL · Casual Leave" chip rendered under the balance pills so
// the abbreviation row is self-explanatory. Uses the type's `name` from
// the balance row directly, so custom leave types added per-tenant pick
// up the legend automatically.
class _LegendChip extends StatelessWidget {
  final String code, name;
  final RunqTokens t;
  const _LegendChip({required this.code, required this.name, required this.t});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: t.hairlineSoft,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text.rich(
        TextSpan(
          children: [
            TextSpan(
              text: code,
              style: TextStyle(color: t.ink, fontSize: 11, fontWeight: FontWeight.w700),
            ),
            const TextSpan(text: '  '),
            TextSpan(
              text: name,
              style: TextStyle(color: t.muted, fontSize: 11, fontWeight: FontWeight.w500),
            ),
          ],
        ),
      ),
    );
  }
}

// Section header above the Active / History request lists. Inline pill
// shows the row count so empty sections (hidden) are immediately
// distinguishable from "0 of N" sections.
class _LeaveSectionHeader extends StatelessWidget {
  final String label;
  final int count;
  final Color ink, muted;
  const _LeaveSectionHeader({
    required this.label,
    required this.count,
    required this.ink,
    required this.muted,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(label, style: RunqText.bodyStrong.copyWith(color: ink)),
        const SizedBox(width: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
          decoration: BoxDecoration(
            color: muted.withValues(alpha: 0.15),
            borderRadius: BorderRadius.circular(999),
          ),
          child: Text('$count',
              style: RunqText.caption.copyWith(
                  color: muted, fontSize: 10.5, fontWeight: FontWeight.w700)),
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
            const SizedBox(width: 2),
            IconButton(
              tooltip: 'Edit request',
              icon: Icon(Icons.edit_outlined, color: t.muted, size: 18),
              visualDensity: VisualDensity.compact,
              onPressed: () => _openEdit(context, ref, req),
            ),
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

  Future<void> _openEdit(BuildContext context, WidgetRef ref, HrLeaveRequest r) async {
    final types = await ref.read(hrMyLeaveTypesProvider.future);
    final tlist = types.map((lt) => (id: lt.id, code: lt.code, name: lt.name)).toList();
    if (!context.mounted) return;
    final res = await showApplyLeaveSheet(
      context,
      leaveTypes: tlist,
      submitLabel: 'Save changes',
      initial: ApplyLeaveResult(
        leaveTypeId: r.leaveTypeId,
        fromDate: r.fromDate,
        toDate: r.toDate,
        halfDay: r.halfDay,
        reason: r.reason,
      ),
    );
    if (res == null) return;
    try {
      await hrRepo.updateLeave(
        id: r.id,
        leaveTypeId: res.leaveTypeId,
        fromDate: res.fromDate,
        toDate: res.toDate,
        halfDay: res.halfDay,
        reason: res.reason ?? '',
      );
      ref.invalidate(hrMyLeaveRequestsProvider);
      ref.invalidate(hrMyLeaveBalancesProvider);
      if (context.mounted) showRunqSnack(context, 'Leave request updated', kind: SnackKind.success);
    } catch (e) {
      if (context.mounted) showRunqSnack(context, '$e', kind: SnackKind.error);
    }
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
    final pendingAsync = ref.watch(hrPendingLeaveRequestsProvider);
    final reviewedAsync = ref.watch(hrReviewedLeaveRequestsProvider);
    return RefreshIndicator(
      color: HrColors.brand(context),
      onRefresh: () async {
        ref.invalidate(hrPendingLeaveRequestsProvider);
        ref.invalidate(hrReviewedLeaveRequestsProvider);
        await Future<void>.delayed(const Duration(milliseconds: 250));
      },
      child: pendingAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e', style: RunqText.body.copyWith(color: t.muted))),
        data: (pending) {
          final reviewed = reviewedAsync.asData?.value ?? const <HrLeaveRequest>[];
          // Sort reviewed newest-first by reviewedAt (or appliedAt as a
          // sensible fallback for cancellations that skip review).
          final history = [...reviewed]..sort((a, b) {
            int t(HrLeaveRequest r) =>
                (r.appliedAt ?? DateTime.fromMillisecondsSinceEpoch(0))
                    .millisecondsSinceEpoch;
            return t(b).compareTo(t(a));
          });
          if (pending.isEmpty && history.isEmpty) {
            return ListView(
              physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
              padding: const EdgeInsets.fromLTRB(16, 30, 16, 140),
              children: [
                const SizedBox(height: 30),
                Center(child: Text('🎉', style: TextStyle(fontSize: 36))),
                const SizedBox(height: 8),
                Center(child: Text('All caught up!', style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 16))),
                const SizedBox(height: 4),
                Center(child: Text('No leave requests yet', style: RunqText.caption.copyWith(color: t.muted))),
              ],
            );
          }
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 32, 16, 140),
            physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
            children: [
              if (pending.isNotEmpty) ...[
                _LeaveSectionHeader(
                  label: 'Pending approval',
                  count: pending.length,
                  ink: t.ink, muted: t.muted,
                ),
                const SizedBox(height: 12),
                for (final r in pending) ...[
                  HrPendingLeaveCard(
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
                      ref.invalidate(hrReviewedLeaveRequestsProvider);
                      ref.invalidate(hrWhoIsOutTodayProvider);
                      ref.invalidate(hrRecentActivityProvider);
                    },
                  ),
                  const SizedBox(height: 10),
                ],
              ],
              if (history.isNotEmpty) ...[
                SizedBox(height: pending.isEmpty ? 0 : 20),
                _LeaveSectionHeader(
                  label: 'Recent decisions',
                  count: history.length,
                  ink: t.ink, muted: t.muted,
                ),
                const SizedBox(height: 12),
                for (final r in history.take(20)) ...[
                  _ReviewedLeaveRow(req: r),
                  const SizedBox(height: 8),
                ],
              ],
            ],
          );
        },
      ),
    );
  }
}

// Compact row for an already-decided leave — same employee + dates the
// pending card shows, but no decision buttons; status chip stands in.
class _ReviewedLeaveRow extends StatelessWidget {
  final HrLeaveRequest req;
  const _ReviewedLeaveRow({required this.req});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    final dateLabel = req.fromDate == req.toDate
        ? '${req.fromDate.day} ${m[req.fromDate.month - 1]}'
        : '${req.fromDate.day} ${m[req.fromDate.month - 1]} → ${req.toDate.day} ${m[req.toDate.month - 1]}';
    return Container(
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
                Text(req.employeeName,
                    style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 13.5)),
                const SizedBox(height: 2),
                Text(
                  '${req.typeCode} · $dateLabel · ${req.totalDays.toStringAsFixed(req.totalDays % 1 == 0 ? 0 : 1)}d',
                  style: RunqText.caption.copyWith(color: t.muted, fontSize: 11.5),
                ),
              ],
            ),
          ),
          HrStatusBadge(status: req.status),
        ],
      ),
    );
  }
}

// ─── Shared → Expenses ────────────────────────────────────────────────────
// Embeds the same body widget the dedicated /hr/expense-claims route
// uses, so this sub-tab is fully functional in-place — no jump to a
// separate screen, filter chips + list + tap-to-detail all work. The
// "New claim" FAB lives on the parent Pay scaffold, gated to this tab.

class _ExpensesTab extends StatelessWidget {
  const _ExpensesTab();

  @override
  Widget build(BuildContext context) {
    return const HrExpenseClaimsBody();
  }
}
