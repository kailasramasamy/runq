import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../api/api_client.dart';
import '../api/models.dart';
import '../api/repos.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import '../utils/format_inr.dart';

final expensesProvider = FutureProvider.autoDispose<List<ExpenseClaim>>((ref) async {
  return expensesRepo.list();
});

/// Expenses landing — shows the owner every out-of-pocket claim batched by
/// status, with a totals strip on top and a one-tap entry to record a new
/// expense. Designed for the solo-owner workflow: most claims start as
/// 'draft', flip to 'reimbursed' once the company account transfers them
/// the money back.
class ExpensesScreen extends ConsumerWidget {
  const ExpensesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final claims = ref.watch(expensesProvider);
    return Scaffold(
      backgroundColor: t.bgWarmer,
      appBar: AppBar(
        title: const Text('Expenses'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18),
          onPressed: () => context.pop(),
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: RunqColors.indigo,
        foregroundColor: Colors.white,
        onPressed: () => context.push('/expenses/new'),
        icon: const Icon(Icons.add_rounded, size: 18),
        label: const Text('Record expense'),
      ),
      body: SafeArea(
        child: RefreshIndicator(
          color: RunqColors.indigo,
          onRefresh: () async {
            ref.invalidate(expensesProvider);
            await ref.read(expensesProvider.future).catchError((_) => <ExpenseClaim>[]);
          },
          child: claims.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) {
              final msg = e is ApiException ? e.message : 'Could not load expenses';
              return _Centered(icon: Icons.error_outline_rounded, title: msg);
            },
            data: (list) {
              if (list.isEmpty) {
                return const _Centered(
                  icon: Icons.receipt_outlined,
                  title: 'No expenses yet',
                  subtitle:
                      'Snap receipts and record what you spent from your pocket — the company account will reimburse you in one transfer.',
                );
              }
              return _Body(claims: list);
            },
          ),
        ),
      ),
    );
  }
}

class _Body extends StatelessWidget {
  final List<ExpenseClaim> claims;
  const _Body({required this.claims});

  @override
  Widget build(BuildContext context) {
    final pending = claims.where((c) => c.status == 'draft' || c.status == 'submitted').toList();
    final approved = claims.where((c) => c.status == 'approved').toList();
    final paid = claims.where((c) => c.status == 'reimbursed').toList();
    final rejected = claims.where((c) => c.status == 'rejected').toList();

    final pendingTotal = pending.fold<double>(0, (s, c) => s + c.totalAmount);
    final approvedTotal = approved.fold<double>(0, (s, c) => s + c.totalAmount);
    final paidTotal = paid.fold<double>(0, (s, c) => s + c.totalAmount);

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
      children: [
        _SummaryStrip(
          pendingTotal: pendingTotal,
          approvedTotal: approvedTotal,
          paidTotal: paidTotal,
        ),
        if (approved.isNotEmpty) ...[
          const SizedBox(height: 18),
          _Section(title: 'Awaiting reimbursement', items: approved),
        ],
        if (pending.isNotEmpty) ...[
          const SizedBox(height: 18),
          _Section(title: 'In progress', items: pending),
        ],
        if (paid.isNotEmpty) ...[
          const SizedBox(height: 18),
          _Section(title: 'Reimbursed', items: paid),
        ],
        if (rejected.isNotEmpty) ...[
          const SizedBox(height: 18),
          _Section(title: 'Rejected', items: rejected),
        ],
      ],
    );
  }
}

class _SummaryStrip extends StatelessWidget {
  final double pendingTotal, approvedTotal, paidTotal;
  const _SummaryStrip({
    required this.pendingTotal,
    required this.approvedTotal,
    required this.paidTotal,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: t.hairline, width: 0.5),
      ),
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      child: Row(
        children: [
          Expanded(
            child: _StatTile(
              label: 'Awaiting',
              value: formatINR(approvedTotal, compact: true),
              color: RunqColors.greenInk,
            ),
          ),
          Container(width: 0.5, height: 38, color: t.hairline),
          Expanded(
            child: _StatTile(
              label: 'In progress',
              value: formatINR(pendingTotal, compact: true),
              color: const Color(0xFFB45309),
            ),
          ),
          Container(width: 0.5, height: 38, color: t.hairline),
          Expanded(
            child: _StatTile(
              label: 'Reimbursed',
              value: formatINR(paidTotal, compact: true),
              color: t.muted,
            ),
          ),
        ],
      ),
    );
  }
}

class _StatTile extends StatelessWidget {
  final String label, value;
  final Color color;
  const _StatTile({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Text(label,
            style: RunqText.micro.copyWith(color: t.muted, letterSpacing: 0.5)),
        const SizedBox(height: 4),
        Text(value, style: RunqText.tabular(size: 16, w: FontWeight.w700, color: color)),
      ],
    );
  }
}

class _Section extends StatelessWidget {
  final String title;
  final List<ExpenseClaim> items;
  const _Section({required this.title, required this.items});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(2, 0, 2, 8),
          child: Row(
            children: [
              Text(title.toUpperCase(),
                  style: RunqText.micro.copyWith(
                    color: t.muted,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.6,
                  )),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                decoration: BoxDecoration(
                  color: t.hairlineSoft,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text('${items.length}',
                    style: RunqText.tabular(size: 10, w: FontWeight.w700, color: t.muted)),
              ),
            ],
          ),
        ),
        Container(
          decoration: BoxDecoration(
            color: t.surface,
            borderRadius: BorderRadius.circular(RunqRadii.smallCard),
            border: Border.all(color: t.hairline, width: 0.5),
          ),
          child: Column(
            children: [
              for (var i = 0; i < items.length; i++) ...[
                _ClaimRow(claim: items[i]),
                if (i < items.length - 1)
                  Padding(
                    padding: const EdgeInsets.only(left: 56),
                    child: Divider(height: 1, thickness: 0.5, color: t.hairline),
                  ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _ClaimRow extends StatelessWidget {
  final ExpenseClaim claim;
  const _ClaimRow({required this.claim});

  String _date(DateTime d) {
    const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${d.day} ${m[d.month - 1]}';
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final desc = (claim.description != null && claim.description!.isNotEmpty)
        ? claim.description!
        : '${claim.items.length} ${claim.items.length == 1 ? 'item' : 'items'}';
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () => context.push('/expenses/${claim.id}'),
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
          child: Row(
            children: [
              Container(
                width: 36, height: 36,
                decoration: BoxDecoration(
                  color: _statusColor(claim.status).withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(_statusIcon(claim.status),
                    size: 18, color: _statusColor(claim.status)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(desc,
                        style: RunqText.bodyStrong.copyWith(color: t.ink),
                        maxLines: 1, overflow: TextOverflow.ellipsis),
                    const SizedBox(height: 2),
                    Text(
                      '${claim.claimNumber} · ${_date(claim.claimDate)}',
                      style: RunqText.caption.copyWith(color: t.muted),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Text(formatINR(claim.totalAmount),
                  style: RunqText.tabular(size: 14, w: FontWeight.w700, color: t.ink)),
            ],
          ),
        ),
      ),
    );
  }
}

Color _statusColor(String status) {
  switch (status) {
    case 'draft': return const Color(0xFF71717A);
    case 'submitted': return const Color(0xFFB45309);
    case 'approved': return RunqColors.greenInk;
    case 'rejected': return RunqColors.redInk;
    case 'reimbursed': return RunqColors.indigo;
    default: return const Color(0xFF71717A);
  }
}

IconData _statusIcon(String status) {
  switch (status) {
    case 'draft': return Icons.edit_note_rounded;
    case 'submitted': return Icons.hourglass_top_rounded;
    case 'approved': return Icons.check_rounded;
    case 'rejected': return Icons.close_rounded;
    case 'reimbursed': return Icons.account_balance_wallet_rounded;
    default: return Icons.receipt_outlined;
  }
}

class _Centered extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  const _Centered({required this.icon, required this.title, this.subtitle});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        const SizedBox(height: 80),
        Icon(icon, size: 36, color: t.muted),
        const SizedBox(height: 12),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Text(title,
              textAlign: TextAlign.center,
              style: RunqText.bodyStrong.copyWith(color: t.ink)),
        ),
        if (subtitle != null) ...[
          const SizedBox(height: 6),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Text(subtitle!,
                textAlign: TextAlign.center,
                style: RunqText.caption.copyWith(color: t.muted)),
          ),
        ],
      ],
    );
  }
}
