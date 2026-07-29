import 'package:flutter/material.dart';
import 'package:flutter_slidable/flutter_slidable.dart';
import 'package:go_router/go_router.dart';
import '../api/api_client.dart';
import '../api/models.dart';
import '../api/repos.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import '../utils/format_inr.dart';
import '../widgets/list_filter_kit.dart';
import '../widgets/runq_snack.dart';
import '../widgets/swipe_action.dart';

class OrderInboxRow extends StatelessWidget {
  final CustomerOrderRow row;
  final VoidCallback onAfterDelete;
  const OrderInboxRow({super.key, required this.row, required this.onAfterDelete});

  Future<void> _confirmDelete(BuildContext context) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete this order?'),
        content: Text(
          row.reviewStatus == 'approved'
              ? 'This order has already been converted to invoice ${row.approvedInvoiceNumber ?? ''}. Deleting the order will not delete the invoice. Continue?'
              : 'This permanently removes the upload and parsed draft. The original file can be re-uploaded later.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    try {
      await orderRepo.discard(row.id);
      if (!context.mounted) return;
      showRunqSnack(context, 'Order deleted');
      onAfterDelete();
    } on ApiException catch (e) {
      if (context.mounted) showRunqSnack(context, e.message, kind: SnackKind.error);
    } catch (_) {
      if (context.mounted) showRunqSnack(context, 'Could not delete the order.', kind: SnackKind.error);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Slidable(
      key: ValueKey(row.id),
      endActionPane: ActionPane(
        motion: const ScrollMotion(),
        extentRatio: 0.28,
        children: [
          SwipeAction(
            icon: Icons.delete_outline_rounded,
            label: 'Delete',
            color: Colors.red,
            onTap: () => _confirmDelete(context),
          ),
        ],
      ),
      // Flat row: the list screen stacks these inside one shared card with
      // dividers, so the row carries no chrome of its own.
      child: Material(
        color: t.surface,
        child: InkWell(
          onTap: () => context.push('/sales/orders/${row.id}'),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
            child: Row(
              // Top-align so the amount sits on the title line, not visually
              // centred against title + subtitle — matches the invoice list.
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ListDateBlock(date: row.uploadedAt),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(row.displayTitle,
                          style: RunqText.bodyStrong.copyWith(color: t.ink),
                          maxLines: 1, overflow: TextOverflow.ellipsis),
                      if (_subtitle().isNotEmpty) ...[
                        const SizedBox(height: 2),
                        Text(_subtitle(),
                            style: RunqText.caption.copyWith(color: t.muted),
                            maxLines: 1, overflow: TextOverflow.ellipsis),
                      ],
                      const SizedBox(height: 6),
                      Row(
                        children: [
                          _StatusPill(status: row.displayStatus),
                          if (row.approvedInvoiceId != null) ...[
                            const SizedBox(width: 6),
                            Flexible(
                              child: _InvoiceChip(
                                number: row.approvedInvoiceNumber ?? 'invoice',
                                onTap: () => context.push('/invoices/${row.approvedInvoiceId}'),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ],
                  ),
                ),
                if (row.grandTotal != null && row.grandTotal! > 0) ...[
                  const SizedBox(width: 8),
                  Text(formatINR(row.grandTotal!),
                      style: RunqText.tabular(size: 15, w: FontWeight.w700, color: t.ink)),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  /// PO number plus the upload time — the date itself now lives in the
  /// leading block, so this only carries the intra-day "2h ago" detail.
  String _subtitle() {
    final parts = <String>[];
    if (row.poNumberExtracted != null && row.poNumberExtracted!.isNotEmpty) {
      parts.add('PO #${row.poNumberExtracted!}');
    }
    final fresh = _freshness(row.uploadedAt);
    if (fresh != null) parts.add(fresh);
    return parts.join(' · ');
  }

  String? _freshness(DateTime d) {
    final diff = DateTime.now().difference(d);
    if (diff.inMinutes < 1) return 'just now';
    if (diff.inHours < 1) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    return null;
  }
}

class _StatusPill extends StatelessWidget {
  final String status;
  const _StatusPill({required this.status});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final s = status.toLowerCase();
    Color fg;
    Color bg;
    // Use alpha-tinted backgrounds throughout so pills render correctly on
    // both light and dark surfaces — solid pastel backgrounds (e.g. light
    // mint green) blow out against a dark canvas. Text colours flip per
    // mode so contrast on the tinted bg stays readable.
    if (s == 'invoiced') {
      fg = isDark ? const Color(0xFF34D399) : RunqColors.greenInk;
      bg = const Color(0x3310B981);  // emerald @20% alpha
    } else if (s == 'ready') {
      fg = isDark ? const Color(0xFFA5B4FC) : RunqColors.indigo;
      bg = const Color(0x1F4F46E5);
    } else if (s == 'needs review' || s == 'parsing') {
      fg = isDark ? const Color(0xFFFCD34D) : const Color(0xFFB45309);
      bg = const Color(0x33F59E0B);
    } else if (s == 'error' || s == 'rejected') {
      fg = isDark ? const Color(0xFFFCA5A5) : RunqColors.redInk;
      bg = const Color(0x22EF4444);
    } else {
      fg = t.muted;
      bg = t.hairlineSoft;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Text(status.toUpperCase(),
          style: RunqText.micro.copyWith(
            color: fg,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.5,
          )),
    );
  }
}

class _InvoiceChip extends StatelessWidget {
  final String number;
  final VoidCallback onTap;
  const _InvoiceChip({required this.number, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(999),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: RunqColors.indigo.withValues(alpha: 0.10),
          borderRadius: BorderRadius.circular(999),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.receipt_long_rounded, size: 12, color: RunqColors.indigo),
            const SizedBox(width: 4),
            Text(number,
                style: RunqText.caption.copyWith(
                  color: RunqColors.indigo,
                  fontWeight: FontWeight.w700,
                )),
            const SizedBox(width: 2),
            const Icon(Icons.chevron_right_rounded, size: 14, color: RunqColors.indigo),
          ],
        ),
      ),
    );
  }
}
