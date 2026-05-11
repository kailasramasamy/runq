import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../api/api_client.dart';
import '../api/models.dart';
import '../api/repos.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import '../utils/format_inr.dart';
import '../widgets/runq_snack.dart';
import 'expenses_screen.dart' show expensesProvider;

final expenseDetailProvider =
    FutureProvider.autoDispose.family<ExpenseClaim, String>((ref, id) async {
  return expensesRepo.get(id);
});

/// Single-claim view + actions. Shows the items, lets the owner advance the
/// claim through its status states (submit / approve / reject / mark
/// reimbursed) and copies pay-out details when ready to transfer money.
class ExpenseDetailScreen extends ConsumerWidget {
  final String id;
  const ExpenseDetailScreen({super.key, required this.id});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final value = ref.watch(expenseDetailProvider(id));
    return Scaffold(
      backgroundColor: t.bgWarmer,
      appBar: AppBar(
        title: const Text('Expense'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18),
          onPressed: () => context.pop(),
        ),
        actions: [
          value.maybeWhen(
            data: (claim) => _DetailMenu(claim: claim, ref: ref),
            orElse: () => const SizedBox.shrink(),
          ),
        ],
      ),
      body: SafeArea(
        child: value.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) {
            final msg = e is ApiException ? e.message : 'Could not load expense';
            return Center(child: Text(msg, style: RunqText.body.copyWith(color: RunqColors.redInk)));
          },
          data: (claim) => _Body(claim: claim),
        ),
      ),
    );
  }
}

class _Body extends ConsumerStatefulWidget {
  final ExpenseClaim claim;
  const _Body({required this.claim});

  @override
  ConsumerState<_Body> createState() => _BodyState();
}

class _BodyState extends ConsumerState<_Body> {
  bool _busy = false;

  Future<void> _run(Future<ExpenseClaim> Function() action, {required String success}) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await action();
      if (!mounted) return;
      ref.invalidate(expenseDetailProvider(widget.claim.id));
      ref.invalidate(expensesProvider);
      showRunqSnack(context, success);
    } on ApiException catch (e) {
      if (mounted) showRunqSnack(context, e.message, kind: SnackKind.error);
    } catch (_) {
      if (mounted) showRunqSnack(context, 'Action failed.', kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _date(DateTime d) {
    const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${d.day} ${m[d.month - 1]} ${d.year}';
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final c = widget.claim;
    return Column(
      children: [
        Expanded(
          child: ListView(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
            children: [
              _Header(claim: c),
              const SizedBox(height: 14),
              _SectionCard(
                title: 'Items',
                child: Column(
                  children: [
                    for (var i = 0; i < c.items.length; i++) ...[
                      if (i > 0) Divider(height: 16, color: t.hairlineSoft),
                      _ItemRow(item: c.items[i], dateFmt: _date),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 14),
              _SectionCard(
                title: 'Totals',
                child: Row(
                  children: [
                    Expanded(child: Text('Total', style: RunqText.bodyStrong.copyWith(color: t.ink))),
                    Text(formatINR(c.totalAmount),
                        style: RunqText.tabular(size: 18, w: FontWeight.w700, color: t.ink)),
                  ],
                ),
              ),
              if (c.rejectionReason != null && c.rejectionReason!.isNotEmpty) ...[
                const SizedBox(height: 14),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0x14EF4444),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(Icons.error_outline_rounded, size: 16, color: RunqColors.redInk),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(c.rejectionReason!,
                            style: RunqText.caption.copyWith(color: RunqColors.redInk)),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
        _Footer(claim: c, busy: _busy, onRun: _run),
      ],
    );
  }
}

class _Header extends StatelessWidget {
  final ExpenseClaim claim;
  const _Header({required this.claim});

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
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(claim.claimNumber,
                  style: RunqText.tabular(size: 13, w: FontWeight.w600, color: t.muted)),
              const Spacer(),
              _StatusPill(status: claim.status),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            (claim.description != null && claim.description!.isNotEmpty)
                ? claim.description!
                : 'Expense claim',
            style: RunqText.h3.copyWith(color: t.ink, fontSize: 18),
          ),
          if (claim.claimantName != null) ...[
            const SizedBox(height: 2),
            Text('by ${claim.claimantName}',
                style: RunqText.caption.copyWith(color: t.muted)),
          ],
        ],
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  final String status;
  const _StatusPill({required this.status});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    Color fg;
    Color bg;
    switch (status) {
      case 'approved': fg = RunqColors.greenInk; bg = RunqColors.greenBg; break;
      case 'submitted': fg = const Color(0xFFB45309); bg = const Color(0x33F59E0B); break;
      case 'rejected': fg = RunqColors.redInk; bg = const Color(0x22EF4444); break;
      case 'reimbursed': fg = RunqColors.indigo; bg = RunqColors.indigo.withValues(alpha: 0.12); break;
      default: fg = t.muted; bg = t.hairlineSoft; break;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Text(status.toUpperCase(),
          style: RunqText.caption.copyWith(
            fontSize: 10,
            color: fg,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.5,
          )),
    );
  }
}

class _SectionCard extends StatelessWidget {
  final String title;
  final Widget child;
  const _SectionCard({required this.title, required this.child});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        border: Border.all(color: t.hairline, width: 0.5),
      ),
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title.toUpperCase(),
              style: RunqText.caption.copyWith(
                fontSize: 10.5,
                color: t.muted,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.6,
              )),
          const SizedBox(height: 10),
          child,
        ],
      ),
    );
  }
}

class _ItemRow extends StatelessWidget {
  final ExpenseItem item;
  final String Function(DateTime) dateFmt;
  const _ItemRow({required this.item, required this.dateFmt});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(item.description,
                  style: RunqText.bodyStrong.copyWith(color: t.ink),
                  maxLines: 2, overflow: TextOverflow.ellipsis),
              const SizedBox(height: 2),
              Text('${item.category} · ${dateFmt(item.expenseDate)}',
                  style: RunqText.caption.copyWith(color: t.muted, fontSize: 11)),
            ],
          ),
        ),
        const SizedBox(width: 8),
        Text(formatINR(item.amount),
            style: RunqText.tabular(size: 14, w: FontWeight.w700, color: t.ink)),
      ],
    );
  }
}

class _Footer extends StatelessWidget {
  final ExpenseClaim claim;
  final bool busy;
  final Future<void> Function(Future<ExpenseClaim> Function(), {required String success}) onRun;
  const _Footer({required this.claim, required this.busy, required this.onRun});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final action = _action(context);
    if (action == null) {
      return Container(
        padding: EdgeInsets.fromLTRB(16, 10, 16, 10 + MediaQuery.of(context).viewPadding.bottom),
        decoration: BoxDecoration(
          color: t.bgWarm,
          border: Border(top: BorderSide(color: t.hairline, width: 0.5)),
        ),
        child: Center(
          child: Text(_terminalMessage(claim.status),
              style: RunqText.caption.copyWith(color: t.muted)),
        ),
      );
    }
    return Container(
      padding: EdgeInsets.fromLTRB(16, 10, 16, 10 + MediaQuery.of(context).viewPadding.bottom),
      decoration: BoxDecoration(
        color: t.bgWarm,
        border: Border(top: BorderSide(color: t.hairline, width: 0.5)),
      ),
      child: SizedBox(
        width: double.infinity,
        child: FilledButton.icon(
          onPressed: busy ? null : action.onTap,
          style: FilledButton.styleFrom(
            backgroundColor: action.color,
            padding: const EdgeInsets.symmetric(vertical: 14),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
          icon: busy
              ? const SizedBox(
                  width: 16, height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              : Icon(action.icon, size: 18, color: Colors.white),
          label: Text(busy ? 'Working…' : action.label,
              style: RunqText.bodyStrong.copyWith(color: Colors.white)),
        ),
      ),
    );
  }

  _ActionConfig? _action(BuildContext context) {
    switch (claim.status) {
      case 'draft':
        return _ActionConfig(
          label: 'Submit & approve',
          icon: Icons.check_rounded,
          color: RunqColors.indigo,
          onTap: () async {
            await onRun(() async {
              final s = await expensesRepo.submit(claim.id);
              return await expensesRepo.approve(s.id, approved: true);
            }, success: 'Approved · ready for reimbursement');
          },
        );
      case 'submitted':
        return _ActionConfig(
          label: 'Approve',
          icon: Icons.check_rounded,
          color: RunqColors.indigo,
          onTap: () async {
            await onRun(() => expensesRepo.approve(claim.id, approved: true),
                success: 'Approved');
          },
        );
      case 'approved':
        return _ActionConfig(
          label: 'Mark reimbursed · ${formatINR(claim.totalAmount)}',
          icon: Icons.account_balance_wallet_rounded,
          color: RunqColors.greenInk,
          onTap: () async {
            await onRun(() => expensesRepo.reimburse(claim.id),
                success: 'Marked as reimbursed');
          },
        );
    }
    return null;
  }

  String _terminalMessage(String status) {
    switch (status) {
      case 'reimbursed':
        return 'Reimbursed · payment recorded';
      case 'rejected':
        return 'Rejected — no further actions';
      default:
        return '';
    }
  }
}

class _ActionConfig {
  final String label;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;
  _ActionConfig({required this.label, required this.icon, required this.color, required this.onTap});
}

/// Overflow menu — surfaces Amend + Delete. Same gate as web/API:
/// amend allowed unless reimbursed or rejected (terminal states); delete
/// allowed unless reimbursed (money already moved).
class _DetailMenu extends StatelessWidget {
  final ExpenseClaim claim;
  final WidgetRef ref;
  const _DetailMenu({required this.claim, required this.ref});

  bool get _canAmend => claim.status != 'reimbursed' && claim.status != 'rejected';
  bool get _canDelete => claim.status != 'reimbursed';

  Future<void> _delete(BuildContext context) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delete claim?'),
        content: Text('${claim.claimNumber} will be permanently removed.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: RunqColors.redInk),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await expensesRepo.hardDelete(claim.id);
      ref.invalidate(expensesProvider);
      if (!context.mounted) return;
      showRunqSnack(context, 'Expense ${claim.claimNumber} deleted.');
      context.pop();
    } on ApiException catch (e) {
      if (context.mounted) showRunqSnack(context, e.message, kind: SnackKind.error);
    } catch (_) {
      if (context.mounted) showRunqSnack(context, 'Could not delete expense.', kind: SnackKind.error);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_canAmend && !_canDelete) return const SizedBox.shrink();
    return PopupMenuButton<String>(
      icon: const Icon(Icons.more_vert_rounded),
      onSelected: (v) {
        if (v == 'amend') {
          context.push('/expenses/${claim.id}/edit');
        } else if (v == 'delete') {
          _delete(context);
        }
      },
      itemBuilder: (_) => [
        if (_canAmend)
          const PopupMenuItem(
            value: 'amend',
            child: Row(
              children: [
                Icon(Icons.edit_outlined, size: 18),
                SizedBox(width: 10),
                Text('Amend'),
              ],
            ),
          ),
        if (_canDelete)
          PopupMenuItem(
            value: 'delete',
            child: Row(
              children: [
                Icon(Icons.delete_outline_rounded, size: 18, color: RunqColors.redInk),
                const SizedBox(width: 10),
                Text('Delete', style: TextStyle(color: RunqColors.redInk)),
              ],
            ),
          ),
      ],
    );
  }
}
