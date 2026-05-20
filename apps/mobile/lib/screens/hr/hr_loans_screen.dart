// Employee loans screen.
// * Shows the employee's own loans + status.
// * 'Request loan' FAB is gated by the tenant loan-policy + per-employee
//   eligibility (tenure, active-loan cap, CTC). If ineligible we show why.
// * Managers also see a 'Team requests' section listing loan requests from
//   their direct reports that they need to approve or reject.

library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../api/hr_phase_next.dart';
import '../../widgets/runq_snack.dart';

final _money = NumberFormat('#,##,###');
const _hrAccent = Color(0xFF0891B2);

class HrLoansScreen extends ConsumerWidget {
  const HrLoansScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final loansAsync = ref.watch(myLoansProvider);
    final eligAsync = ref.watch(loanEligibilityProvider);
    final teamAsync = ref.watch(teamLoanRequestsProvider);

    final canRequest = eligAsync.maybeWhen(
      data: (e) => e.policy.employeeRequestsEnabled,
      orElse: () => false,
    );

    return Scaffold(
      appBar: AppBar(title: const Text('Loans & advances')),
      floatingActionButton: canRequest
          ? FloatingActionButton.extended(
              onPressed: () => _onRequestPressed(context, ref, eligAsync.value),
              backgroundColor: _hrAccent,
              foregroundColor: Colors.white,
              icon: const Icon(Icons.add),
              label: const Text('Request loan'),
            )
          : null,
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(myLoansProvider);
          ref.invalidate(loanEligibilityProvider);
          ref.invalidate(teamLoanRequestsProvider);
        },
        child: ListView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          padding: const EdgeInsets.only(bottom: 96),
          children: [
            teamAsync.maybeWhen(
              data: (rows) => rows.isEmpty ? const SizedBox.shrink() : _TeamRequestsSection(rows: rows),
              orElse: () => const SizedBox.shrink(),
            ),
            eligAsync.when(
              loading: () => const SizedBox.shrink(),
              error: (e, _) => const SizedBox.shrink(),
              data: (elig) => _EligibilityBanner(elig: elig),
            ),
            loansAsync.when(
              loading: () => const Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator())),
              error: (e, _) => Padding(padding: const EdgeInsets.all(40), child: Center(child: Text('$e'))),
              data: (rows) => rows.isEmpty
                  ? const Padding(
                      padding: EdgeInsets.all(40),
                      child: Center(child: Text('No loans yet')),
                    )
                  : Column(children: rows.map((l) => _LoanCard(loan: l)).toList()),
            ),
          ],
        ),
      ),
    );
  }

  void _onRequestPressed(BuildContext context, WidgetRef ref, HrLoanEligibility? elig) {
    if (elig == null) return;
    if (!elig.eligible) {
      _showIneligibleSheet(context, elig);
      return;
    }
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: Color.alphaBlend(
        _hrAccent.withValues(alpha: 0.10),
        Theme.of(context).colorScheme.surface,
      ),
      builder: (_) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: _RequestLoanForm(elig: elig),
      ),
    );
  }

  void _showIneligibleSheet(BuildContext context, HrLoanEligibility elig) {
    showModalBottomSheet(
      context: context,
      showDragHandle: true,
      builder: (_) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 32),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Row(children: [
            Icon(Icons.info_outline, color: Colors.orange),
            SizedBox(width: 8),
            Text('You can\'t request a loan yet', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          ]),
          const SizedBox(height: 12),
          for (final r in elig.reasons)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('• ', style: TextStyle(fontWeight: FontWeight.bold)),
                Expanded(child: Text(r)),
              ]),
            ),
          const SizedBox(height: 12),
          const Text(
            'Speak to HR if you believe these limits should not apply to you.',
            style: TextStyle(color: Colors.black54, fontSize: 13),
          ),
        ]),
      ),
    );
  }
}

class _EligibilityBanner extends StatelessWidget {
  const _EligibilityBanner({required this.elig});
  final HrLoanEligibility elig;

  @override
  Widget build(BuildContext context) {
    if (!elig.policy.employeeRequestsEnabled) return const SizedBox.shrink();
    if (!elig.eligible) return const SizedBox.shrink();
    return Card(
      color: _hrAccent.withValues(alpha: 0.08),
      margin: const EdgeInsets.fromLTRB(12, 12, 12, 0),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(children: [
          const Icon(Icons.check_circle, color: _hrAccent, size: 20),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'You can request up to ₹${_money.format(elig.maxAmount)}'
              '${elig.policy.managerApprovalRequired ? " — needs manager + HR approval" : " — needs HR approval"}.',
              style: const TextStyle(fontSize: 13),
            ),
          ),
        ]),
      ),
    );
  }
}

class _TeamRequestsSection extends ConsumerWidget {
  const _TeamRequestsSection({required this.rows});
  final List<HrTeamLoanRequest> rows;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          const Icon(Icons.groups_2, size: 18, color: _hrAccent),
          const SizedBox(width: 6),
          Text(
            'Team requests (${rows.length})',
            style: const TextStyle(fontWeight: FontWeight.bold, color: _hrAccent),
          ),
        ]),
        const SizedBox(height: 6),
        for (final r in rows) _TeamRequestCard(req: r),
        const Divider(height: 32),
      ]),
    );
  }
}

class _TeamRequestCard extends ConsumerWidget {
  const _TeamRequestCard({required this.req});
  final HrTeamLoanRequest req;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 4),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(child: Text(req.employeeName, style: const TextStyle(fontWeight: FontWeight.bold))),
            if (req.employeeCode != null)
              Text(req.employeeCode!, style: const TextStyle(fontSize: 12, color: Colors.black54)),
          ]),
          const SizedBox(height: 4),
          Text('${_kindLabel(req.kind)} — ₹${_money.format(req.principal)} over ${req.totalInstalments} months'),
          if (req.reason != null && req.reason!.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text('Reason: ${req.reason}', style: const TextStyle(fontSize: 12, color: Colors.black54)),
            ),
          const SizedBox(height: 8),
          Row(mainAxisAlignment: MainAxisAlignment.end, children: [
            TextButton(
              onPressed: () => _reject(context, ref),
              style: TextButton.styleFrom(foregroundColor: Colors.red),
              child: const Text('Reject'),
            ),
            const SizedBox(width: 8),
            FilledButton(
              onPressed: () => _approve(context, ref),
              style: FilledButton.styleFrom(backgroundColor: _hrAccent),
              child: const Text('Approve'),
            ),
          ]),
        ]),
      ),
    );
  }

  Future<void> _approve(BuildContext context, WidgetRef ref) async {
    try {
      await hrPhaseNextRepo.managerApproveLoan(req.id);
      ref.invalidate(teamLoanRequestsProvider);
      if (context.mounted) showRunqSnack(context, 'Forwarded to HR for final approval', kind: SnackKind.success);
    } catch (e) {
      if (context.mounted) showRunqSnack(context, 'Failed: $e', kind: SnackKind.error);
    }
  }

  Future<void> _reject(BuildContext context, WidgetRef ref) async {
    final controller = TextEditingController();
    final reason = await showDialog<String>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Reject loan request'),
        content: TextField(
          controller: controller,
          autofocus: true,
          textCapitalization: TextCapitalization.sentences,
          decoration: const InputDecoration(hintText: 'Reason (shown to employee)'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(context, controller.text.trim()),
            child: const Text('Reject'),
          ),
        ],
      ),
    );
    if (reason == null || reason.isEmpty) return;
    try {
      await hrPhaseNextRepo.managerRejectLoan(req.id, reason);
      ref.invalidate(teamLoanRequestsProvider);
      if (context.mounted) showRunqSnack(context, 'Request rejected', kind: SnackKind.success);
    } catch (e) {
      if (context.mounted) showRunqSnack(context, 'Failed: $e', kind: SnackKind.error);
    }
  }
}

class _LoanCard extends ConsumerWidget {
  const _LoanCard({required this.loan});
  final HrLoan loan;

  bool get _isActive => loan.status == 'active';
  bool get _isClosed => loan.status == 'closed' || loan.status == 'written_off';
  bool get _isPending => loan.status == 'requested' || loan.status == 'manager_approved';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final statusColor = _statusColor(loan.status);
    final paid = loan.principal - loan.outstanding;
    final progress = loan.principal > 0 ? (paid / loan.principal).clamp(0.0, 1.0) : 0.0;
    final paidInstalments = loan.emiAmount > 0 ? (paid / loan.emiAmount).round() : 0;

    return Card(
      margin: const EdgeInsets.fromLTRB(12, 8, 12, 0),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: _isPending
            ? null
            : () => Navigator.of(context).push(MaterialPageRoute(
                  builder: (_) => HrLoanDetailScreen(loanId: loan.id),
                )),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            // Header: kind + status pill
            Row(children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: _hrAccent.withValues(alpha: isDark ? 0.18 : 0.10),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(_kindIcon(loan.kind), color: _hrAccent, size: 20),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(_kindLabel(loan.kind), style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                  Text('₹${_money.format(loan.principal)} principal', style: TextStyle(fontSize: 12, color: theme.hintColor)),
                ]),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: statusColor.withValues(alpha: isDark ? 0.18 : 0.12),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(_statusLabel(loan.status), style: TextStyle(color: statusColor, fontSize: 11, fontWeight: FontWeight.w600)),
              ),
            ]),

            // Hero outstanding (active loans only)
            if (_isActive || _isClosed) ...[
              const SizedBox(height: 16),
              Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('Outstanding', style: TextStyle(fontSize: 12, color: theme.hintColor)),
                    const SizedBox(height: 2),
                    Text('₹${_money.format(loan.outstanding)}',
                        style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
                  ]),
                  const Spacer(),
                  Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                    Text('Paid ${paidInstalments}/${loan.totalInstalments}',
                        style: TextStyle(fontSize: 12, color: theme.hintColor)),
                    const SizedBox(height: 2),
                    Text('₹${_money.format(paid)}',
                        style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Colors.green.shade400)),
                  ]),
                ],
              ),
              const SizedBox(height: 10),
              ClipRRect(
                borderRadius: BorderRadius.circular(6),
                child: LinearProgressIndicator(
                  value: progress,
                  minHeight: 8,
                  backgroundColor: isDark ? Colors.white12 : Colors.black12,
                  valueColor: AlwaysStoppedAnimation(_hrAccent),
                ),
              ),
              const SizedBox(height: 12),
              Row(children: [
                Expanded(child: _miniStat(context, 'EMI', '₹${_money.format(loan.emiAmount)}')),
                Expanded(child: _miniStat(context, 'Disbursed', DateFormat('d MMM').format(loan.disbursedOn))),
                Expanded(child: _miniStat(context, 'Starts', DateFormat('MMM y').format(DateTime(loan.firstEmiYear, loan.firstEmiMonth)))),
              ]),
            ],

            // Pending: show requested terms
            if (_isPending) ...[
              const SizedBox(height: 12),
              _row(context, 'Amount', '₹${_money.format(loan.principal)}'),
              _row(context, 'EMI', '₹${_money.format(loan.emiAmount)} × ${loan.totalInstalments} months'),
              _row(context, 'Repayment starts', DateFormat('MMM y').format(DateTime(loan.firstEmiYear, loan.firstEmiMonth))),
              if (loan.reason != null && loan.reason!.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text('Reason: ${loan.reason}', style: TextStyle(fontSize: 12, color: theme.hintColor)),
                ),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton.icon(
                  onPressed: () => _withdraw(context, ref, loan.id),
                  icon: const Icon(Icons.close, size: 16),
                  label: const Text('Withdraw'),
                  style: TextButton.styleFrom(foregroundColor: Colors.red),
                ),
              ),
            ],

            // Rejected
            if (loan.status == 'rejected') ...[
              const SizedBox(height: 8),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Colors.red.withValues(alpha: isDark ? 0.15 : 0.08),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  loan.rejectionReason ?? 'Rejected',
                  style: const TextStyle(fontSize: 12, color: Colors.redAccent),
                ),
              ),
            ],
          ]),
        ),
      ),
    );
  }

  Widget _miniStat(BuildContext context, String label, String value) {
    final theme = Theme.of(context);
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label, style: TextStyle(fontSize: 11, color: theme.hintColor)),
      const SizedBox(height: 2),
      Text(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
    ]);
  }

  Future<void> _withdraw(BuildContext context, WidgetRef ref, String id) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Withdraw request?'),
        content: const Text('This will remove your pending loan request.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Withdraw')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await hrPhaseNextRepo.withdrawMyLoan(id);
      ref.invalidate(myLoansProvider);
      ref.invalidate(loanEligibilityProvider);
      if (context.mounted) showRunqSnack(context, 'Request withdrawn', kind: SnackKind.success);
    } catch (e) {
      if (context.mounted) showRunqSnack(context, 'Failed: $e', kind: SnackKind.error);
    }
  }

  Widget _row(BuildContext context, String k, String v) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 2),
    child: Row(children: [
      Expanded(child: Text(k, style: TextStyle(color: Theme.of(context).hintColor))),
      Text(v, style: const TextStyle(fontWeight: FontWeight.w600)),
    ]),
  );
}

Color _statusColor(String s) => switch (s) {
  'active' => Colors.green,
  'closed' => Colors.grey,
  'written_off' => Colors.red,
  'rejected' => Colors.red,
  'manager_approved' => _hrAccent,
  'requested' => Colors.orange,
  _ => Colors.orange,
};

IconData _kindIcon(String k) => switch (k) {
  'advance' => Icons.payments_outlined,
  'personal' => Icons.account_balance_wallet_outlined,
  'festival' => Icons.celebration_outlined,
  'education' => Icons.school_outlined,
  _ => Icons.account_balance_outlined,
};

String _kindLabel(String k) => switch (k) {
  'advance' => 'Salary advance',
  'personal' => 'Personal loan',
  'festival' => 'Festival loan',
  'education' => 'Education loan',
  _ => 'Loan',
};

String _statusLabel(String s) => switch (s) {
  'requested' => 'pending manager',
  'manager_approved' => 'pending HR',
  'rejected' => 'rejected',
  'active' => 'active',
  'closed' => 'closed',
  'written_off' => 'written off',
  _ => s,
};

class _RequestLoanForm extends ConsumerStatefulWidget {
  const _RequestLoanForm({required this.elig});
  final HrLoanEligibility elig;
  @override
  ConsumerState<_RequestLoanForm> createState() => _RequestLoanFormState();
}

class _RequestLoanFormState extends ConsumerState<_RequestLoanForm> {
  final _formKey = GlobalKey<FormState>();
  late String _kind;
  final _principal = TextEditingController();
  final _instalments = TextEditingController(text: '6');
  late int _firstMonth;
  late int _firstYear;
  final _reason = TextEditingController();
  bool _saving = false;

  List<String> get _allowedKinds {
    return widget.elig.policy.allowedKinds ??
        const ['advance', 'personal', 'festival', 'education', 'other'];
  }

  @override
  void initState() {
    super.initState();
    _kind = _allowedKinds.first;
    final now = DateTime.now();
    final next = DateTime(now.year, now.month + 1, 1);
    _firstMonth = next.month;
    _firstYear = next.year;
  }

  @override
  void dispose() {
    _principal.dispose();
    _instalments.dispose();
    _reason.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() => _saving = true);
    try {
      await hrPhaseNextRepo.requestLoan(
        kind: _kind,
        principal: double.parse(_principal.text),
        totalInstalments: int.parse(_instalments.text),
        firstEmiMonth: _firstMonth,
        firstEmiYear: _firstYear,
        reason: _reason.text.trim(),
      );
      ref.invalidate(myLoansProvider);
      ref.invalidate(loanEligibilityProvider);
      if (mounted) {
        Navigator.pop(context);
        showRunqSnack(context, 'Request submitted', kind: SnackKind.success);
      }
    } catch (e) {
      if (mounted) showRunqSnack(context, 'Failed: $e', kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final principal = double.tryParse(_principal.text) ?? 0;
    final months = int.tryParse(_instalments.text) ?? 0;
    final emi = (principal > 0 && months > 0) ? (principal / months) : 0;
    final maxAmount = widget.elig.maxAmount;
    return SingleChildScrollView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      child: Form(
        key: _formKey,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Request loan or advance', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          Text(
            'You can request up to ₹${_money.format(maxAmount)}.',
            style: const TextStyle(color: Colors.black54, fontSize: 13),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _kind,
            decoration: const InputDecoration(labelText: 'Type', border: OutlineInputBorder()),
            items: _allowedKinds.map((k) => DropdownMenuItem(value: k, child: Text(_kindLabel(k)))).toList(),
            onChanged: (v) => setState(() => _kind = v ?? _allowedKinds.first),
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _principal,
            decoration: InputDecoration(
              labelText: 'Amount (₹)',
              helperText: 'Max ₹${_money.format(maxAmount)}',
              border: const OutlineInputBorder(),
            ),
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
            textCapitalization: TextCapitalization.none,
            onChanged: (_) => setState(() {}),
            validator: (v) {
              final n = double.tryParse(v ?? '');
              if (n == null || n <= 0) return 'Enter a valid amount';
              if (n > maxAmount) return 'Above your limit of ₹${_money.format(maxAmount)}';
              return null;
            },
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _instalments,
            decoration: const InputDecoration(labelText: 'Repayment months', border: OutlineInputBorder()),
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            textCapitalization: TextCapitalization.none,
            onChanged: (_) => setState(() {}),
            validator: (v) {
              final n = int.tryParse(v ?? '');
              if (n == null || n < 1 || n > 120) return 'Enter 1 – 120';
              return null;
            },
          ),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(
              child: DropdownButtonFormField<int>(
                initialValue: _firstMonth,
                decoration: const InputDecoration(labelText: 'Repayment starts', border: OutlineInputBorder()),
                items: List.generate(12, (i) => i + 1)
                    .map((m) => DropdownMenuItem(value: m, child: Text(DateFormat('MMMM').format(DateTime(2000, m)))))
                    .toList(),
                onChanged: (v) => setState(() => _firstMonth = v ?? _firstMonth),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: DropdownButtonFormField<int>(
                initialValue: _firstYear,
                decoration: const InputDecoration(labelText: 'Year', border: OutlineInputBorder()),
                items: List.generate(5, (i) => DateTime.now().year + i)
                    .map((y) => DropdownMenuItem(value: y, child: Text('$y')))
                    .toList(),
                onChanged: (v) => setState(() => _firstYear = v ?? _firstYear),
              ),
            ),
          ]),
          const SizedBox(height: 12),
          TextFormField(
            controller: _reason,
            decoration: const InputDecoration(labelText: 'Reason (optional)', border: OutlineInputBorder()),
            textCapitalization: TextCapitalization.sentences,
            maxLines: 3,
          ),
          if (emi > 0)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Text(
                'Approx EMI: ₹${_money.format(emi)} × $months months',
                style: const TextStyle(color: Colors.black54),
              ),
            ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              style: FilledButton.styleFrom(backgroundColor: _hrAccent),
              onPressed: _saving ? null : _submit,
              child: Text(_saving ? 'Submitting…' : 'Submit request'),
            ),
          ),
        ]),
      ),
    );
  }
}

class HrLoanDetailScreen extends ConsumerWidget {
  const HrLoanDetailScreen({super.key, required this.loanId});
  final String loanId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(myLoanDetailProvider(loanId));
    return Scaffold(
      appBar: AppBar(title: const Text('Loan details')),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(myLoanDetailProvider(loanId)),
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(child: Text('$e')),
          data: (d) => _LoanDetailBody(detail: d),
        ),
      ),
    );
  }
}

class _LoanDetailBody extends StatelessWidget {
  const _LoanDetailBody({required this.detail});
  final HrLoanDetail detail;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final loan = detail.loan;
    final paid = loan.principal - loan.outstanding;
    final progress = loan.principal > 0 ? (paid / loan.principal).clamp(0.0, 1.0) : 0.0;
    final paidCount = detail.instalments.where((i) => i.isPaid).length;
    final upcoming = detail.instalments.firstWhere(
      (i) => !i.isPaid,
      orElse: () => detail.instalments.last,
    );

    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.only(bottom: 24),
      children: [
        // Hero card
        Container(
          margin: const EdgeInsets.fromLTRB(12, 12, 12, 0),
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: isDark
                  ? [_hrAccent.withValues(alpha: 0.25), _hrAccent.withValues(alpha: 0.10)]
                  : [_hrAccent.withValues(alpha: 0.18), _hrAccent.withValues(alpha: 0.06)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Icon(_kindIcon(loan.kind), color: _hrAccent),
              const SizedBox(width: 8),
              Text(_kindLabel(loan.kind), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            ]),
            const SizedBox(height: 14),
            Text('Outstanding', style: TextStyle(fontSize: 12, color: theme.hintColor)),
            const SizedBox(height: 2),
            Text('₹${_money.format(loan.outstanding)}', style: const TextStyle(fontSize: 32, fontWeight: FontWeight.bold)),
            const SizedBox(height: 10),
            ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: LinearProgressIndicator(
                value: progress,
                minHeight: 8,
                backgroundColor: Colors.white24,
                valueColor: AlwaysStoppedAnimation(_hrAccent),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Paid ₹${_money.format(paid)} of ₹${_money.format(loan.principal)} ($paidCount/${loan.totalInstalments} EMIs)',
              style: TextStyle(fontSize: 12, color: theme.hintColor),
            ),
          ]),
        ),

        // Stat grid
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
          child: Row(children: [
            Expanded(child: _statCard(context, 'EMI', '₹${_money.format(loan.emiAmount)}', Icons.event_repeat)),
            const SizedBox(width: 8),
            Expanded(child: _statCard(context, 'Disbursed', DateFormat('d MMM y').format(loan.disbursedOn), Icons.savings_outlined)),
          ]),
        ),
        if (loan.status == 'active')
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
            child: _statCard(
              context,
              'Next EMI',
              '${DateFormat('MMM y').format(DateTime(upcoming.dueYear, upcoming.dueMonth))} • ₹${_money.format(upcoming.amount)}',
              Icons.schedule,
            ),
          ),

        // Schedule
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 24, 16, 8),
          child: Text('Repayment schedule', style: TextStyle(fontWeight: FontWeight.bold, color: theme.hintColor, fontSize: 13)),
        ),
        Card(
          margin: const EdgeInsets.symmetric(horizontal: 12),
          child: Column(children: [
            for (var i = 0; i < detail.instalments.length; i++)
              _instalmentRow(context, detail.instalments[i], i == detail.instalments.length - 1),
          ]),
        ),
      ],
    );
  }

  Widget _statCard(BuildContext context, String label, String value, IconData icon) {
    final theme = Theme.of(context);
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(children: [
          Icon(icon, color: _hrAccent, size: 20),
          const SizedBox(width: 8),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(label, style: TextStyle(fontSize: 11, color: theme.hintColor)),
              const SizedBox(height: 2),
              Text(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
            ]),
          ),
        ]),
      ),
    );
  }

  Widget _instalmentRow(BuildContext context, HrLoanInstalment inst, bool isLast) {
    final theme = Theme.of(context);
    final isPaid = inst.isPaid;
    final color = isPaid ? Colors.green : theme.hintColor;
    return Column(children: [
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(children: [
          Container(
            width: 28, height: 28,
            decoration: BoxDecoration(
              color: isPaid ? Colors.green.withValues(alpha: 0.15) : theme.hintColor.withValues(alpha: 0.12),
              shape: BoxShape.circle,
            ),
            child: Icon(isPaid ? Icons.check : Icons.schedule, size: 16, color: color),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(
                DateFormat('MMMM y').format(DateTime(inst.dueYear, inst.dueMonth)),
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
              Text(
                isPaid && inst.paidAt != null
                    ? 'Paid on ${DateFormat('d MMM y').format(inst.paidAt!.toLocal())}'
                    : 'Pending',
                style: TextStyle(fontSize: 12, color: color),
              ),
            ]),
          ),
          Text('₹${_money.format(inst.amount)}', style: const TextStyle(fontWeight: FontWeight.w600)),
        ]),
      ),
      if (!isLast) Divider(height: 1, color: theme.dividerColor.withValues(alpha: 0.4)),
    ]);
  }
}
