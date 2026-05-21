// Pay tab — two sub-tabs that flip based on persona:
//   Employee: Payslips | Expenses
//   Manager:  Payroll  | Expenses
// Leave moved to its own screen (HrLeaveScreen, /hr/leaves). The initial
// tab can be overridden via ?tab=expenses.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/hr_models.dart';
import '../../providers/hr_persona_provider.dart';
import '../../providers/hr_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
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
    if (widget.initialTab == 'expenses') _tab = 1;
    // Opening the screen fresh — e.g. from a notification tap about a
    // payslip or expense decision — should show current data, not whatever
    // a prior visit left cached. Deferred a frame: ref.invalidate reads an
    // inherited widget, which is illegal during initState.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      ref.invalidate(hrMyPayslipsProvider);
      ref.invalidate(hrDashboardProvider);
      // Whole family — the Expenses tab keys this provider by filter chip,
      // and any of those cached lists predates a just-decided claim.
      ref.invalidate(hrExpenseClaimsProvider);
    });
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
    // My View.
    final manager = isAdminHr && persona == HrPersona.manager;
    final labels = manager
        ? const ['Payroll', 'Expenses']
        : const ['Payslips', 'Expenses'];

    // "New claim" only makes sense in My View — Manager view's Expenses
    // tab is a review/approval queue, not a place to file your own.
    final showNewClaimFab = !manager && _tab == 1;

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
                  Text('Pay', style: RunqText.h1.copyWith(color: t.ink)),
                ],
              ),
            ),
            HrSubTabs(labels: labels, active: _tab, onChange: (i) => setState(() => _tab = i)),
            Expanded(
              child: IndexedStack(
                index: _tab,
                children: manager
                    ? const [_PayrollTab(), _ExpensesTab()]
                    : const [_PayslipsTab(), _ExpensesTab()],
              ),
            ),
          ],
        ),
      ),
      floatingActionButton: showNewClaimFab
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
                    Text(ps.periodLabel, style: RunqText.bodyStrong.copyWith(color: t.ink)),
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
                              color: const Color(0xFFDC2626), fontWeight: FontWeight.w600)),
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
                    style: RunqText.body.copyWith(color: Colors.white70)),
                const SizedBox(height: 6),
                Text(d.payrollTotalNet > 0 ? hrFormatINR(d.payrollTotalNet) : '—',
                    style: RunqText.tabular(size: 28, w: FontWeight.w800, color: Colors.white)),
                const SizedBox(height: 2),
                Text(
                  d.payrollRunId == null
                      ? 'No run started yet'
                      : 'Latest run · ${(d.payrollStatus ?? 'draft').replaceAll('_', ' ')}',
                  style: RunqText.caption.copyWith(color: Colors.white70),
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
          Text(label, style: RunqText.caption.copyWith(color: Colors.white70)),
          const SizedBox(height: 2),
          Text(value, style: RunqText.tabular(size: 13, w: FontWeight.w700, color: Colors.white)),
        ],
      );
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
