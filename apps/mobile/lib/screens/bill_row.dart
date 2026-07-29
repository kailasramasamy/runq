import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_slidable/flutter_slidable.dart';
import 'package:go_router/go_router.dart';
import '../api/api_client.dart';
import '../api/models.dart';
import '../api/repos.dart' show billsRepo;
import '../providers/data_providers.dart';
import '../theme/runq_tokens.dart';
import '../theme/runq_theme.dart';
import '../utils/format_inr.dart';
import '../widgets/avatar.dart';
import '../widgets/list_filter_kit.dart';
import '../widgets/runq_card.dart';
import '../widgets/runq_snack.dart';
import '../widgets/status_pill.dart';
import '../widgets/swipe_action.dart';

class BillRow extends ConsumerWidget {
  final Bill bill;
  /// Optional refresh callback wired from the host screen so swipe actions
  /// share the same fetch path as pull-to-refresh.
  final Future<void> Function()? onAfterAction;
  /// Compact = no card chrome — used by the dashboard's Recent bills section
  /// where many rows live inside a shared RunqCard with dividers.
  final bool compact;
  /// Swap the vendor avatar for a bold bill-date block. Bills are sparse
  /// enough that per-day section headers are overkill — the list screen
  /// carries the date on each row instead.
  final bool showDate;
  const BillRow({
    super.key,
    required this.bill,
    this.onAfterAction,
    this.compact = false,
    this.showDate = false,
  });

  String _date(DateTime d) {
    const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${d.day} ${m[d.month - 1]}';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    // Amount still payable to the vendor. Drafts/paid rows have nothing
    // outstanding, so they keep showing the bill value + its date.
    final hasBalance = bill.balanceDue > 0 && bill.status != 'draft';
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final due = DateTime(bill.dueDate.year, bill.dueDate.month, bill.dueDate.day);
    // Date-derived lateness so triage is honest regardless of status flag.
    final isLate = hasBalance && due.isBefore(today);
    final daysLate = isLate ? today.difference(due).inDays : 0;
    final headline = hasBalance ? bill.balanceDue : bill.totalAmount;
    final actions = _buildActions(context, ref);
    final body = Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (showDate)
          ListDateBlock(date: bill.invoiceDate)
        else
          RqAvatar(name: bill.vendorName, size: compact ? 36 : 44, square: true),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(bill.vendorName, style: RunqText.bodyStrong, maxLines: 1, overflow: TextOverflow.ellipsis),
              const SizedBox(height: 2),
              Text.rich(
                TextSpan(
                  style: RunqText.caption.copyWith(color: t.muted),
                  children: [
                    TextSpan(text: bill.invoiceNumber),
                    if (hasBalance) ...[
                      const TextSpan(text: '  ·  '),
                      TextSpan(
                        text: 'Due ${_date(bill.dueDate)}',
                        style: isLate ? TextStyle(color: RunqColors.redInk) : null,
                      ),
                    ] else if (!showDate) ...[
                      // With the date block on the left this would just repeat.
                      const TextSpan(text: '  ·  '),
                      TextSpan(text: _date(bill.invoiceDate)),
                    ],
                    if (isLate)
                      TextSpan(
                        text: '  ·  ${daysLate < 1 ? 'due today' : '${daysLate}d late'}',
                        style: TextStyle(color: RunqColors.redInk, fontWeight: FontWeight.w700),
                      ),
                  ],
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 6),
              Row(
                children: [
                  StatusPill(bill.status),
                  if (bill.matchStatus == 'matched') ...[
                    const SizedBox(width: 6),
                    _MatchChip(matched: true),
                  ] else if (bill.status == 'pending_match' || bill.matchStatus == 'mismatch') ...[
                    const SizedBox(width: 6),
                    _MatchChip(matched: false),
                  ],
                ],
              ),
            ],
          ),
        ),
        const SizedBox(width: 8),
        Text(formatINR(headline), style: RunqText.tabular(size: 16, w: FontWeight.w700)),
      ],
    );
    void tap() => context.push('/bills/${bill.id}');
    final tile = compact
        ? Material(
            color: RT(context).surface,
            child: InkWell(
              onTap: tap,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
                child: body,
              ),
            ),
          )
        : RunqCard(
            onTap: tap,
            padding: const EdgeInsets.all(14),
            child: body,
          );
    if (actions.isEmpty) return tile;
    return Slidable(
      groupTag: 'bills',
      key: ValueKey('bill-${bill.id}'),
      endActionPane: ActionPane(
        motion: const BehindMotion(),
        extentRatio: actions.length == 1 ? 0.28 : 0.52,
        children: actions,
      ),
      child: tile,
    );
  }

  List<Widget> _buildActions(BuildContext context, WidgetRef ref) {
    final s = bill.status;
    // API approval rules (three-way-match.service.ts:97):
    //   - bill with PO    → must be 'matched'
    //   - bill without PO → 'draft' or 'matched'
    // Anything else (pending_match, pending_approval) is never directly
    // approvable and must not show an Approve swipe — it would always fail.
    final canApprove = s == 'matched' || (s == 'draft' && !bill.hasPO);
    final canDelete = s == 'draft' || s == 'pending_match' || s == 'pending_approval';
    if (canApprove || canDelete) {
      return [
        if (canApprove)
          SwipeAction(
            icon: Icons.check_rounded,
            label: 'Approve',
            color: const Color(0xFF047857),
            onTap: () => _approve(context, ref),
          ),
        if (canDelete)
          SwipeAction(
            icon: Icons.delete_outline_rounded,
            label: 'Delete',
            color: RunqColors.redInk,
            onTap: () => _delete(context, ref),
          ),
      ];
    }
    if (s == 'approved' || s == 'partially_paid') {
      return [
        SwipeAction(
          icon: Icons.check_rounded,
          label: 'Mark paid',
          color: const Color(0xFF047857),
          onTap: () => _markPaid(context, ref),
        ),
      ];
    }
    return const [];
  }

  Future<void> _refreshAll(WidgetRef ref) async {
    ref.invalidate(billsProvider);
    ref.invalidate(billsSummaryProvider);
    ref.invalidate(billDetailProvider(bill.id));
    if (onAfterAction != null) await onAfterAction!();
  }

  Future<void> _approve(BuildContext context, WidgetRef ref) async {
    try {
      await billsRepo.approve(bill.id);
      await _refreshAll(ref);
      if (!context.mounted) return;
      showRunqSnack(context, 'Approved ${bill.invoiceNumber}',
          kind: SnackKind.success);
    } on ApiException catch (e) {
      if (!context.mounted) return;
      showRunqSnack(context, e.message, kind: SnackKind.error);
    } catch (_) {
      if (!context.mounted) return;
      showRunqSnack(context, "Couldn't approve the bill. Please try again.",
          kind: SnackKind.error);
    }
  }

  Future<void> _delete(BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(
      context: context,
      // dctx is the dialog route's own context — popping with the outer
      // context tears down the page in a GoRouter shell instead.
      builder: (dctx) => AlertDialog(
        title: const Text('Delete bill?'),
        content: Text('Remove ${bill.invoiceNumber} from ${bill.vendorName}?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dctx, false), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(dctx, true),
            style: FilledButton.styleFrom(
              backgroundColor: RunqColors.redInk,
              foregroundColor: Colors.white,
            ),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    if (!context.mounted) return;
    try {
      await billsRepo.remove(bill.id);
      await _refreshAll(ref);
      if (!context.mounted) return;
      showRunqSnack(context, 'Bill removed', kind: SnackKind.success);
    } on ApiException catch (e) {
      if (!context.mounted) return;
      showRunqSnack(context, e.message, kind: SnackKind.error);
    } catch (_) {
      if (!context.mounted) return;
      showRunqSnack(context, "Couldn't delete the bill. Please try again.",
          kind: SnackKind.error);
    }
  }

  Future<void> _markPaid(BuildContext context, WidgetRef ref) async {
    if (bill.id.isEmpty) return;
    final amount = bill.balanceDue > 0 ? bill.balanceDue : bill.totalAmount;
    final ok = await showDialog<bool>(
      context: context,
      // Use the builder's context (dctx) — popping with the outer context
      // walks up to the page navigator (only one page deep in the shell)
      // and tears the screen down instead of the dialog.
      builder: (dctx) => AlertDialog(
        title: const Text('Mark as paid?'),
        content: Text(
          'Record ${formatINR(amount)} for ${bill.invoiceNumber} as paid from your own money. '
          'This keeps your books balanced.',
          style: RunqText.body,
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dctx, false), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(dctx, true),
            style: FilledButton.styleFrom(backgroundColor: const Color(0xFF047857)),
            child: const Text('Mark paid'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    if (!context.mounted) return;
    try {
      await billsRepo.markPaid(bill.id, amount: amount);
      await _refreshAll(ref);
      if (!context.mounted) return;
      showRunqSnack(context,
          'Marked ${formatINR(amount, compact: true)} paid · ${bill.invoiceNumber}',
          kind: SnackKind.success);
    } on ApiException catch (e) {
      if (!context.mounted) return;
      showRunqSnack(context, e.message, kind: SnackKind.error);
    } catch (_) {
      if (!context.mounted) return;
      showRunqSnack(context, "Couldn't mark the bill as paid. Please try again.",
          kind: SnackKind.error);
    }
  }
}

class _MatchChip extends StatelessWidget {
  final bool matched;
  const _MatchChip({required this.matched});

  @override
  Widget build(BuildContext context) {
    final color = matched ? RunqColors.greenInk : RunqColors.amberInk;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(matched ? Icons.check_circle_rounded : Icons.error_outline_rounded, size: 12, color: color),
        const SizedBox(width: 3),
        Text(matched ? 'Verified' : 'Match needed',
            style: RunqText.label.copyWith(color: color)),
      ],
    );
  }
}
