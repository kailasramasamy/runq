import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_slidable/flutter_slidable.dart';
import 'package:go_router/go_router.dart';
import '../api/api_client.dart';
import '../api/models.dart';
import '../api/repos.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import '../utils/format_inr.dart';
import '../widgets/avatar.dart';
import '../widgets/runq_snack.dart';
import '../widgets/swipe_action.dart';

final poInboxProvider = FutureProvider.autoDispose<List<PoInboxRow>>((ref) async {
  return poRepo.listInbox(limit: 100);
});

/// Mobile PO Inbox — paginated list of every PO upload (parsing, ready,
/// invoiced, error). Tap a row to open the parse review screen, or tap the
/// linked invoice chip on an invoiced row to jump straight to that invoice.
class PoInboxScreen extends ConsumerWidget {
  const PoInboxScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final inbox = ref.watch(poInboxProvider);
    return Scaffold(
      backgroundColor: t.bgWarmer,
      appBar: AppBar(
        title: const Text('PO Inbox'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18),
          onPressed: () => context.pop(),
        ),
      ),
      body: SafeArea(
        child: RefreshIndicator(
          color: RunqColors.indigo,
          onRefresh: () async {
            ref.invalidate(poInboxProvider);
            await ref.read(poInboxProvider.future).catchError((_) => <PoInboxRow>[]);
          },
          child: inbox.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) {
              final msg = e is ApiException ? e.message : 'Could not load PO inbox';
              return _Centered(
                icon: Icons.error_outline_rounded,
                title: msg,
                action: 'Retry',
                onAction: () => ref.invalidate(poInboxProvider),
              );
            },
            data: (rows) {
              if (rows.isEmpty) {
                return const _Centered(
                  icon: Icons.inbox_outlined,
                  title: 'No POs yet',
                  subtitle:
                      'Share or upload a PO from a customer — it lands here, AI parses it, and you approve it into an invoice.',
                );
              }
              return ListView.separated(
                physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 24),
                itemCount: rows.length,
                separatorBuilder: (_, __) => const SizedBox(height: 8),
                itemBuilder: (_, i) => _PoRow(
                  row: rows[i],
                  onAfterDelete: () => ref.invalidate(poInboxProvider),
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}

class _PoRow extends StatelessWidget {
  final PoInboxRow row;
  final VoidCallback onAfterDelete;
  const _PoRow({required this.row, required this.onAfterDelete});

  Future<void> _confirmDelete(BuildContext context) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete this PO?'),
        content: Text(
          row.reviewStatus == 'approved'
              ? 'This PO has already been converted to invoice ${row.approvedInvoiceNumber ?? ''}. Deleting the PO will not delete the invoice. Continue?'
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
      await poRepo.discard(row.id);
      if (!context.mounted) return;
      showRunqSnack(context, 'PO deleted');
      onAfterDelete();
    } on ApiException catch (e) {
      if (context.mounted) showRunqSnack(context, e.message, kind: SnackKind.error);
    } catch (_) {
      if (context.mounted) showRunqSnack(context, 'Could not delete the PO.', kind: SnackKind.error);
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
      child: Material(
        color: t.surface,
        borderRadius: BorderRadius.circular(RunqRadii.smallCard),
        child: InkWell(
          borderRadius: BorderRadius.circular(RunqRadii.smallCard),
          onTap: () => context.push('/po-drafts/${row.id}'),
          child: Container(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
            decoration: BoxDecoration(
              border: Border.all(color: t.hairline, width: 0.5),
              borderRadius: BorderRadius.circular(RunqRadii.smallCard),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    RqAvatar(name: row.displayTitle, size: 36),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(row.displayTitle,
                              style: RunqText.bodyStrong.copyWith(color: t.ink),
                              maxLines: 1, overflow: TextOverflow.ellipsis),
                          const SizedBox(height: 2),
                          Text(_subtitle(),
                              style: RunqText.caption.copyWith(color: t.muted, fontSize: 11),
                              maxLines: 1, overflow: TextOverflow.ellipsis),
                        ],
                      ),
                    ),
                    if (row.grandTotal != null && row.grandTotal! > 0)
                      Text(formatINR(row.grandTotal!),
                          style: RunqText.tabular(size: 14, w: FontWeight.w700, color: t.ink)),
                  ],
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    _StatusPill(status: row.displayStatus),
                    const Spacer(),
                    if (row.approvedInvoiceId != null)
                      _InvoiceChip(
                        number: row.approvedInvoiceNumber ?? 'invoice',
                        onTap: () => context.push('/invoices/${row.approvedInvoiceId}'),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  String _subtitle() {
    final parts = <String>[];
    if (row.poNumberExtracted != null && row.poNumberExtracted!.isNotEmpty) {
      parts.add('PO #${row.poNumberExtracted!}');
    }
    parts.add(_relativeDate(row.uploadedAt));
    return parts.join(' · ');
  }

  String _relativeDate(DateTime d) {
    final now = DateTime.now();
    final diff = now.difference(d);
    if (diff.inMinutes < 1) return 'just now';
    if (diff.inHours < 1) return '${diff.inMinutes}m ago';
    if (diff.inDays < 1) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${d.day} ${months[d.month - 1]}';
  }
}

class _StatusPill extends StatelessWidget {
  final String status;
  const _StatusPill({required this.status});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final s = status.toLowerCase();
    Color fg;
    Color bg;
    if (s == 'invoiced') {
      fg = RunqColors.greenInk;
      bg = RunqColors.greenBg;
    } else if (s == 'ready') {
      fg = RunqColors.greenInk;
      bg = RunqColors.greenBg;
    } else if (s == 'needs review' || s == 'parsing') {
      fg = const Color(0xFFB45309);
      bg = const Color(0x33F59E0B);
    } else if (s == 'error' || s == 'rejected') {
      fg = RunqColors.redInk;
      bg = const Color(0x22EF4444);
    } else {
      fg = t.muted;
      bg = t.hairlineSoft;
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
                  fontSize: 11,
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

class _Centered extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  final String? action;
  final VoidCallback? onAction;
  const _Centered({
    required this.icon,
    required this.title,
    this.subtitle,
    this.action,
    this.onAction,
  });

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
        if (action != null) ...[
          const SizedBox(height: 16),
          Center(
            child: OutlinedButton(onPressed: onAction, child: Text(action!)),
          ),
        ],
      ],
    );
  }
}
