// Admin/HR "Advances & deductions" — two tabs:
//   Advances    — active loans across employees (GET /hr/loans).
//   Deductions  — goods/canteen/damage/uniform/fine/other (GET /hr/deductions).
//
// FAB offers "Record advance paid" (owner/accountant only — it moves money)
// and "Add deduction" (owner/accountant/hr).

library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/hr_recovery.dart';
import '../../providers/app_role_provider.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import 'widgets/hr_advance_detail_sheet.dart';
import 'widgets/hr_colors.dart';
import 'widgets/hr_deduction_detail_sheet.dart';
import 'widgets/hr_recovery_sheets.dart';
import 'widgets/hr_widgets.dart';

class HrRecoveriesScreen extends ConsumerStatefulWidget {
  const HrRecoveriesScreen({super.key});
  @override
  ConsumerState<HrRecoveriesScreen> createState() => _HrRecoveriesScreenState();
}

class _HrRecoveriesScreenState extends ConsumerState<HrRecoveriesScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final role = ref.watch(appRoleProvider);
    // Advances move real money out the door — restricted to owner/accountant
    // on the server (AppRole.admin here). Deductions are the wider
    // owner/accountant/hr set, matched by canManageHrSetup.
    final canRecordAdvance = role == AppRole.admin;
    final canAddDeduction = role.canManageHrSetup;

    return Scaffold(
      backgroundColor: t.bgWarm,
      appBar: AppBar(
        title: const Text('Advances & deductions'),
        bottom: TabBar(
          controller: _tabs,
          indicatorColor: HrColors.teal,
          labelColor: HrColors.brand(context),
          unselectedLabelColor: t.muted,
          labelStyle: RunqText.bodyStrong,
          unselectedLabelStyle: RunqText.body,
          tabs: const [Tab(text: 'Advances'), Tab(text: 'Deductions')],
        ),
      ),
      body: TabBarView(controller: _tabs, children: const [_AdvancesTab(), _DeductionsTab()]),
      floatingActionButton: (canRecordAdvance || canAddDeduction)
          ? FloatingActionButton.extended(
              onPressed: () => _openActionSheet(context, canRecordAdvance, canAddDeduction),
              backgroundColor: HrColors.teal,
              foregroundColor: Colors.white,
              icon: const Icon(Icons.add),
              label: const Text('Add'),
            )
          : null,
    );
  }

  void _openActionSheet(BuildContext context, bool canRecordAdvance, bool canAddDeduction) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (_) => _AddActionSheet(canRecordAdvance: canRecordAdvance, canAddDeduction: canAddDeduction),
    );
  }
}

class _AddActionSheet extends StatelessWidget {
  final bool canRecordAdvance, canAddDeduction;
  const _AddActionSheet({required this.canRecordAdvance, required this.canAddDeduction});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      decoration: BoxDecoration(
        color: t.bgWarmer,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: EdgeInsets.fromLTRB(20, 12, 20, 16 + MediaQuery.of(context).padding.bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 36, height: 4,
              decoration: BoxDecoration(color: t.hairline, borderRadius: BorderRadius.circular(999)),
            ),
          ),
          const SizedBox(height: 12),
          if (canRecordAdvance)
            _tile(context, Icons.payments_outlined, 'Record advance paid',
                'Hand over cash/bank now, recover through payroll', () {
              Navigator.of(context).pop();
              showRecordAdvanceSheet(context);
            }),
          if (canRecordAdvance && canAddDeduction) const SizedBox(height: 8),
          if (canAddDeduction)
            _tile(context, Icons.remove_circle_outline, 'Add deduction',
                'Goods, canteen, damage, uniform, fine…', () {
              Navigator.of(context).pop();
              showAddDeductionSheet(context);
            }),
        ],
      ),
    );
  }

  Widget _tile(BuildContext context, IconData icon, String title, String sub, VoidCallback onTap) {
    final t = RT(context);
    return Material(
      color: t.surface,
      borderRadius: BorderRadius.circular(RunqRadii.smallCard),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(RunqRadii.smallCard),
            border: Border.all(color: t.hairline, width: 0.5),
          ),
          child: Row(children: [
            Container(
              width: 40, height: 40,
              decoration: BoxDecoration(color: HrColors.tealSubtle, borderRadius: BorderRadius.circular(10)),
              child: Icon(icon, size: 20, color: HrColors.brand(context)),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: RunqText.bodyStrong.copyWith(color: t.ink)),
                  const SizedBox(height: 2),
                  Text(sub, style: RunqText.caption.copyWith(color: t.muted)),
                ],
              ),
            ),
          ]),
        ),
      ),
    );
  }
}

// ─── Advances tab ────────────────────────────────────────────────────────

class _AdvancesTab extends ConsumerWidget {
  const _AdvancesTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final async = ref.watch(hrAdminLoansProvider);
    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(hrAdminLoansProvider),
      child: async.when(
        loading: () => const Center(child: CircularProgressIndicator(color: HrColors.teal)),
        error: (e, _) => _errorList(t, '$e', () => ref.invalidate(hrAdminLoansProvider)),
        data: (rows) => rows.isEmpty
            ? _emptyList(t, 'No active advances')
            : ListView.builder(
                physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 120),
                itemCount: rows.length,
                itemBuilder: (_, i) => _AdvanceRow(loan: rows[i]),
              ),
      ),
    );
  }
}

class _AdvanceRow extends StatelessWidget {
  final HrAdminLoan loan;
  const _AdvanceRow({required this.loan});

  static const _kindLabels = <String, String>{
    'advance': 'Salary advance',
    'personal': 'Personal loan',
    'festival': 'Festival loan',
    'education': 'Education loan',
  };

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final l = loan.loan;
    return Material(
      color: t.surface,
      borderRadius: BorderRadius.circular(RunqRadii.smallCard),
      child: InkWell(
        onTap: () => showAdvanceDetailSheet(context, loanId: l.id, employeeId: loan.employeeId),
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        child: Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(RunqRadii.smallCard),
            border: Border.all(color: t.hairline, width: 0.5),
            boxShadow: RunqShadows.card,
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(loan.employeeName, style: RunqText.bodyStrong.copyWith(color: t.ink)),
                    if (loan.employeeCode != null)
                      Text(loan.employeeCode!, style: RunqText.caption.copyWith(color: t.muted)),
                    const SizedBox(height: 4),
                    Text(_kindLabels[l.kind] ?? 'Loan', style: RunqText.caption.copyWith(color: t.muted)),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(hrFormatINR(l.outstanding), style: RunqText.tabular(size: 15, color: t.ink)),
                  const SizedBox(height: 2),
                  Text('of ${hrFormatINR(l.principal)}', style: RunqText.caption.copyWith(color: t.muted)),
                  const SizedBox(height: 6),
                  HrStatusBadge(status: l.status),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Deductions tab ──────────────────────────────────────────────────────

class _DeductionsTab extends ConsumerWidget {
  const _DeductionsTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final async = ref.watch(hrDeductionsProvider(const HrDeductionsQuery()));
    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(hrDeductionsProvider),
      child: async.when(
        loading: () => const Center(child: CircularProgressIndicator(color: HrColors.teal)),
        error: (e, _) => _errorList(t, '$e', () => ref.invalidate(hrDeductionsProvider)),
        data: (rows) => rows.isEmpty
            ? _emptyList(t, 'No deductions yet')
            : ListView.builder(
                physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 120),
                itemCount: rows.length,
                itemBuilder: (_, i) => _DeductionRow(deduction: rows[i]),
              ),
      ),
    );
  }
}

class _DeductionRow extends StatelessWidget {
  final HrDeduction deduction;
  const _DeductionRow({required this.deduction});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final d = deduction;
    return Material(
      color: t.surface,
      borderRadius: BorderRadius.circular(RunqRadii.smallCard),
      child: InkWell(
        onTap: () => showDeductionDetailSheet(context, d.id),
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        child: Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(RunqRadii.smallCard),
            border: Border.all(color: t.hairline, width: 0.5),
            boxShadow: RunqShadows.card,
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(d.employeeName, style: RunqText.bodyStrong.copyWith(color: t.ink)),
                    if (d.employeeCode != null)
                      Text(d.employeeCode!, style: RunqText.caption.copyWith(color: t.muted)),
                    const SizedBox(height: 4),
                    Text(hrDeductionCategoryLabel(d.category), style: RunqText.caption.copyWith(color: t.muted)),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(hrFormatINR(d.outstanding), style: RunqText.tabular(size: 15, color: t.ink)),
                  const SizedBox(height: 2),
                  Text('of ${hrFormatINR(d.amount)}', style: RunqText.caption.copyWith(color: t.muted)),
                  const SizedBox(height: 6),
                  HrStatusBadge(status: d.status),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Shared empty/error states ───────────────────────────────────────────

Widget _emptyList(RunqTokens t, String label) {
  return ListView(
    physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
    padding: const EdgeInsets.fromLTRB(16, 80, 16, 120),
    children: [Center(child: Text(label, style: RunqText.body.copyWith(color: t.muted)))],
  );
}

Widget _errorList(RunqTokens t, String message, VoidCallback onRetry) {
  return ListView(
    physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
    padding: const EdgeInsets.fromLTRB(16, 80, 16, 120),
    children: [
      Center(child: Text(message, style: RunqText.body.copyWith(color: t.muted))),
      const SizedBox(height: 12),
      Center(child: TextButton(onPressed: onRetry, child: const Text('Retry'))),
    ],
  );
}
