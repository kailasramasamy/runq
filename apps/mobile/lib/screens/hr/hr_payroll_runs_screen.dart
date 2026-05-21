// Payroll runs — list + detail.
//
// Lifecycle (server-gated, mobile mirrors):
//   draft → processed → approved → closed
//
// On detail:
//   • draft     → "Process" generates payslips for every active employee
//                 with a salary assignment.
//   • processed → "Approve" finalises numbers, then "Close" posts to GL.
//   • closed    → terminal — payslips are sealed; per-row edit blocked.
//
// Per-employee payslip drill reuses HrPayslipDetailScreen at
// /hr/payslips/:runId/:payslipId.

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/hr_models.dart';
import '../../api/hr_repo.dart';
import '../../providers/hr_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../widgets/runq_snack.dart';
import 'widgets/hr_colors.dart';
import 'widgets/hr_form.dart';
import 'widgets/hr_widgets.dart';

// ─── List ─────────────────────────────────────────────────────────────────

class HrPayrollRunsScreen extends ConsumerWidget {
  const HrPayrollRunsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final runsAsync = ref.watch(hrPayrollRunsProvider);

    return Scaffold(
      backgroundColor: t.bgWarm,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 12, 16, 4),
              child: Row(
                children: [
                  IconButton(
                    onPressed: () => Navigator.of(context).maybePop(),
                    icon: Icon(Icons.arrow_back_rounded, color: t.ink),
                  ),
                  const SizedBox(width: 4),
                  Text('Payroll runs', style: RunqText.h1.copyWith(color: t.ink)),
                ],
              ),
            ),
            Expanded(
              child: RefreshIndicator(
                color: HrColors.brand(context),
                onRefresh: () async {
                  ref.invalidate(hrPayrollRunsProvider);
                  await Future<void>.delayed(const Duration(milliseconds: 250));
                },
                child: runsAsync.when(
                  loading: () => const Center(child: CircularProgressIndicator(color: HrColors.teal)),
                  error: (e, _) => Center(child: Text('$e', style: RunqText.body.copyWith(color: t.muted))),
                  data: (rows) {
                    if (rows.isEmpty) {
                      return ListView(
                        physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
                        padding: const EdgeInsets.fromLTRB(16, 60, 16, 120),
                        children: [
                          Icon(Icons.calculate_outlined, size: 40, color: t.muted2),
                          const SizedBox(height: 10),
                          Center(child: Text('No payroll runs yet',
                              style: RunqText.bodyStrong.copyWith(color: t.ink))),
                          const SizedBox(height: 4),
                          Center(child: Text('Tap + to start the first run.',
                              style: RunqText.caption.copyWith(color: t.muted))),
                        ],
                      );
                    }
                    return ListView.builder(
                      physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
                      padding: const EdgeInsets.fromLTRB(16, 4, 16, 120),
                      itemCount: rows.length,
                      itemBuilder: (_, i) => _RunRow(run: rows[i]),
                    );
                  },
                ),
              ),
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        heroTag: 'new-run',
        backgroundColor: HrColors.teal,
        foregroundColor: Colors.white,
        onPressed: () => _openCreateSheet(context, ref),
        icon: const Icon(Icons.add_rounded),
        label: const Text('New run'),
      ),
    );
  }
}

class _RunRow extends StatelessWidget {
  final HrPayrollRun run;
  const _RunRow({required this.run});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: t.hairline, width: 0.5),
        boxShadow: RunqShadows.card,
      ),
      child: InkWell(
        onTap: () => context.push('/hr/payroll-runs/${run.id}'),
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          child: Row(
            children: [
              Container(
                width: 40, height: 40,
                decoration: BoxDecoration(
                  color: HrColors.tealSubtle,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(Icons.calculate_outlined, color: HrColors.brand(context), size: 20),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(run.periodLabel,
                        style: RunqText.bodyStrong.copyWith(color: t.ink)),
                    const SizedBox(height: 2),
                    Text('${run.totalEmployees} employees',
                        style: RunqText.caption.copyWith(color: t.muted)),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    run.totalNet > 0 ? hrFormatINR(run.totalNet) : '—',
                    style: RunqText.tabular(size: 14, w: FontWeight.w700, color: t.ink),
                  ),
                  const SizedBox(height: 4),
                  HrStatusBadge(status: run.status),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Create sheet ─────────────────────────────────────────────────────────

Future<void> _openCreateSheet(BuildContext context, WidgetRef ref) async {
  final created = await showModalBottomSheet<HrPayrollRun?>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (_) => const _CreateRunSheet(),
  );
  ref.invalidate(hrPayrollRunsProvider);
  if (created != null && context.mounted) {
    context.push('/hr/payroll-runs/${created.id}');
  }
}

class _CreateRunSheet extends StatefulWidget {
  const _CreateRunSheet();
  @override
  State<_CreateRunSheet> createState() => _CreateRunSheetState();
}

class _CreateRunSheetState extends State<_CreateRunSheet> {
  late int _month;
  late int _year;
  final _notes = TextEditingController();
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    // Default to last month — most payrolls are run in arrears.
    final now = DateTime.now();
    if (now.month == 1) {
      _month = 12; _year = now.year - 1;
    } else {
      _month = now.month - 1; _year = now.year;
    }
  }

  @override
  void dispose() {
    _notes.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_saving) return;
    setState(() => _saving = true);
    try {
      final run = await hrRepo.createPayrollRun(
        month: _month,
        year: _year,
        notes: _notes.text.trim().isEmpty ? null : _notes.text.trim(),
      );
      if (mounted) Navigator.of(context).pop(run);
    } catch (e) {
      if (mounted) {
        setState(() => _saving = false);
        showRunqSnack(context, 'Create failed: $e', kind: SnackKind.error);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final inset = MediaQuery.of(context).viewInsets.bottom;
    return Container(
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
            child: Row(
              children: [Text('New payroll run', style: RunqText.h3.copyWith(color: t.ink))],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: HrFormSection(children: [
              HrSelectField<int>(
                label: 'Month',
                value: _month,
                required: true,
                options: List.generate(12, (i) => i + 1),
                display: (m) {
                  const months = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];
                  return months[m - 1];
                },
                onChanged: (m) => setState(() => _month = m ?? DateTime.now().month),
              ),
              HrSelectField<int>(
                label: 'Year',
                value: _year,
                required: true,
                options: List.generate(5, (i) => DateTime.now().year - 2 + i),
                display: (y) => '$y',
                onChanged: (y) => setState(() => _year = y ?? DateTime.now().year),
              ),
              HrTextField(
                label: 'Notes',
                controller: _notes,
                hint: 'Optional context — bonus month, prorate notes',
                maxLines: 2,
              ),
            ]),
          ),
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 0),
            child: Text(
              'Run starts in DRAFT. "Process" generates payslips for every active employee with a salary assignment.',
              style: RunqText.caption.copyWith(color: t.muted2),
            ),
          ),
          const SizedBox(height: 14),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: SizedBox(
              width: double.infinity,
              child: HrSubmitButton(
                label: 'Create run',
                loading: _saving,
                enabled: true,
                onPressed: _save,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Detail ───────────────────────────────────────────────────────────────

class HrPayrollRunDetailScreen extends ConsumerWidget {
  final String id;
  const HrPayrollRunDetailScreen({super.key, required this.id});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final runAsync = ref.watch(hrPayrollRunProvider(id));
    final payslipsAsync = ref.watch(hrRunPayslipsProvider(id));

    return Scaffold(
      backgroundColor: t.bgWarm,
      body: SafeArea(
        bottom: false,
        child: runAsync.when(
          loading: () => const Center(child: CircularProgressIndicator(color: HrColors.teal)),
          error: (e, _) => Center(child: Text('$e', style: RunqText.body.copyWith(color: t.muted))),
          data: (run) {
            return Column(
              children: [
                _DetailHeader(run: run),
                Expanded(
                  child: RefreshIndicator(
                    color: HrColors.brand(context),
                    onRefresh: () async {
                      ref.invalidate(hrPayrollRunProvider(id));
                      ref.invalidate(hrRunPayslipsProvider(id));
                      await Future<void>.delayed(const Duration(milliseconds: 250));
                    },
                    child: ListView(
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                      physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
                      children: [
                        _SummaryCard(run: run),
                        const SizedBox(height: 12),
                        payslipsAsync.when(
                          loading: () => const Padding(
                            padding: EdgeInsets.symmetric(vertical: 24),
                            child: Center(child: CircularProgressIndicator(color: HrColors.teal)),
                          ),
                          error: (e, _) =>
                              Text('$e', style: RunqText.body.copyWith(color: t.muted)),
                          data: (slips) {
                            if (slips.isEmpty) {
                              return _EmptyPayslips(run: run);
                            }
                            return _PayslipsCard(runId: run.id, slips: slips);
                          },
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            );
          },
        ),
      ),
      // Move action bar into bottomNavigationBar slot so SnackBars lift
      // above it automatically (ScaffoldMessenger respects this slot).
      bottomNavigationBar: runAsync.maybeWhen(
        data: (run) => _ActionBar(run: run),
        orElse: () => null,
      ),
    );
  }
}

class _DetailHeader extends StatelessWidget {
  final HrPayrollRun run;
  const _DetailHeader({required this.run});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 12, 16, 4),
      child: Row(
        children: [
          IconButton(
            onPressed: () => Navigator.of(context).maybePop(),
            icon: Icon(Icons.arrow_back_rounded, color: t.ink),
          ),
          const SizedBox(width: 4),
          Expanded(
            child: Text('${run.periodLabel} payroll',
                style: RunqText.h2.copyWith(color: t.ink)),
          ),
          HrStatusBadge(status: run.status),
        ],
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  final HrPayrollRun run;
  const _SummaryCard({required this.run});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: HrColors.heroGradient,
        borderRadius: BorderRadius.circular(RunqRadii.card),
        boxShadow: RunqShadows.card,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Net payroll',
              style: RunqText.caption.copyWith(
                color: Colors.white.withValues(alpha: 0.85),
                letterSpacing: 0.3,
              )),
          const SizedBox(height: 8),
          Text(run.totalNet > 0 ? hrFormatINR(run.totalNet) : '—',
              style: RunqText.tabular(size: 30, w: FontWeight.w800, color: Colors.white)),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(child: _heroStat('Gross', hrFormatINR(run.totalGross))),
              const SizedBox(width: 12),
              Expanded(child: _heroStat('Deductions', hrFormatINR(run.totalDeductions))),
              const SizedBox(width: 12),
              Expanded(child: _heroStat('Employees', '${run.totalEmployees}')),
            ],
          ),
          if (run.notes != null && run.notes!.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(run.notes!,
                style: RunqText.body.copyWith(color: Colors.white.withValues(alpha: 0.9))),
          ],
        ],
      ),
    );
  }

  Widget _heroStat(String label, String value) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              style: RunqText.label.copyWith(color: Colors.white.withValues(alpha: 0.7))),
          const SizedBox(height: 2),
          Text(value,
              style: RunqText.tabular(size: 13, w: FontWeight.w700, color: Colors.white)),
        ],
      );
}

class _EmptyPayslips extends StatelessWidget {
  final HrPayrollRun run;
  const _EmptyPayslips({required this.run});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 28, horizontal: 16),
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: t.hairline, width: 0.5),
      ),
      child: Column(
        children: [
          Icon(Icons.receipt_long_outlined, size: 32, color: t.muted2),
          const SizedBox(height: 10),
          Text('No payslips yet',
              style: RunqText.bodyStrong.copyWith(color: t.ink)),
          const SizedBox(height: 4),
          Text(
            run.canProcess
                ? 'Tap "Process" below to generate payslips for every active employee with a salary assignment.'
                : 'No employees were eligible when this run was processed.',
            textAlign: TextAlign.center,
            style: RunqText.caption.copyWith(color: t.muted),
          ),
        ],
      ),
    );
  }
}

class _PayslipsCard extends StatelessWidget {
  final String runId;
  final List<HrPayslip> slips;
  const _PayslipsCard({required this.runId, required this.slips});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 0, 4, 6),
          child: Text('PAYSLIPS (${slips.length})',
              style: RunqText.label.copyWith(color: t.muted2, letterSpacing: 0.5)),
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
                _PayslipRow(runId: runId, ps: slips[i]),
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
  const _PayslipRow({required this.runId, required this.ps});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return InkWell(
      onTap: () => context.push('/hr/payslips/$runId/${ps.id}'),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            HrAvatar(
              name: ps.employeeName ?? ps.employeeId,
              employeeId: ps.employeeId,
              size: 36,
            ),
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
                      'Paid ${ps.paidDays.toStringAsFixed(ps.paidDays % 1 == 0 ? 0 : 1)}d',
                      if (ps.lopDays > 0)
                        'LOP ${ps.lopDays.toStringAsFixed(ps.lopDays % 1 == 0 ? 0 : 1)}d',
                    ].join(' · '),
                    style: RunqText.caption.copyWith(color: t.muted),
                  ),
                ],
              ),
            ),
            Text(hrFormatINR(ps.netPay),
                style: RunqText.tabular(size: 14, w: FontWeight.w700, color: t.ink)),
            const SizedBox(width: 4),
            Icon(Icons.chevron_right_rounded, size: 16, color: t.muted2),
          ],
        ),
      ),
    );
  }
}

class _ActionBar extends ConsumerWidget {
  final HrPayrollRun run;
  const _ActionBar({required this.run});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Lifecycle action gating mirrors the server's enum order — server
    // will refuse out-of-sequence transitions, but we hide the button so
    // the user never sees it.
    final actions = <Widget>[];
    if (run.canProcess) {
      actions.add(Expanded(
        child: HrSubmitButton(
          label: 'Process',
          enabled: true,
          onPressed: () => _process(context, ref),
        ),
      ));
    } else if (run.canApprove) {
      actions.add(Expanded(
        child: HrSubmitButton(
          label: 'Approve',
          enabled: true,
          onPressed: () => _approve(context, ref),
        ),
      ));
    } else if (run.canClose) {
      actions.add(Expanded(
        child: HrSubmitButton(
          label: 'Close run',
          enabled: true,
          onPressed: () => _close(context, ref),
        ),
      ));
    }
    if (actions.isEmpty) return const SizedBox.shrink();
    return SafeArea(
      top: false,
      // Flush bottom bar — no surface strip (matches HrFormScreen and
      // the expense claim detail). Snack lifts via Scaffold's
      // bottomNavigationBar slot, not via margin math here.
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
        child: Row(children: actions),
      ),
    );
  }

  /// Generic confirm + transition helper — keeps each lifecycle action
  /// tight (no fork in the call site) and avoids stale-context bugs.
  Future<void> _runTransition(
    BuildContext context,
    WidgetRef ref, {
    required String title,
    required String body,
    required Future<HrPayrollRun> Function() exec,
    required String successMessage,
  }) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: Text(title),
        content: Text(body),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: TextButton.styleFrom(foregroundColor: HrColors.teal),
            child: const Text('Continue'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await exec();
      ref.invalidate(hrPayrollRunProvider(run.id));
      ref.invalidate(hrRunPayslipsProvider(run.id));
      ref.invalidate(hrPayrollRunsProvider);
      // Dashboard surfaces totalNet via the latest run — refresh so the
      // manager Home updates immediately.
      ref.invalidate(hrDashboardProvider);
      if (context.mounted) showRunqSnack(context, successMessage, kind: SnackKind.success);
    } catch (e) {
      if (context.mounted) showRunqSnack(context, '$e', kind: SnackKind.error);
    }
  }

  Future<void> _process(BuildContext context, WidgetRef ref) => _runTransition(
        context,
        ref,
        title: 'Process payroll?',
        body: 'Generate payslips for every active employee with a salary assignment. Attendance and leave for the period are folded in.',
        exec: () => hrRepo.processPayrollRun(run.id),
        successMessage: 'Payroll processed',
      );

  Future<void> _approve(BuildContext context, WidgetRef ref) => _runTransition(
        context,
        ref,
        title: 'Approve payroll?',
        body: 'Approving locks the numbers. Use "Close run" next to post to the GL and freeze.',
        exec: () => hrRepo.approvePayrollRun(run.id),
        successMessage: 'Payroll approved',
      );

  Future<void> _close(BuildContext context, WidgetRef ref) => _runTransition(
        context,
        ref,
        title: 'Close payroll run?',
        body: 'Posts the run to the GL and freezes payslips. Cannot be undone.',
        exec: () => hrRepo.closePayrollRun(run.id),
        successMessage: 'Payroll closed',
      );
}
