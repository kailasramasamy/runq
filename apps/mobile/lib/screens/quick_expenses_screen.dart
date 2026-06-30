import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../api/api_client.dart';
import '../api/models.dart';
import '../api/repos.dart';
import '../providers/data_providers.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import '../utils/format_inr.dart';
import '../widgets/runq_snack.dart';

/// History of captured quick payments (QR/UPI). Pending ones are editable
/// until the bank statement matches them; each card shows its match status.
class QuickExpensesScreen extends ConsumerWidget {
  const QuickExpensesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = RT(context);
    final async = ref.watch(pendingPaymentsProvider);
    return Scaffold(
      backgroundColor: t.bgWarmer,
      appBar: AppBar(title: const Text('Quick payments')),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: RunqColors.indigo,
        foregroundColor: Colors.white,
        onPressed: () => context.push('/quick-payment'),
        icon: const Icon(Icons.add),
        label: const Text('New'),
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => Center(child: Text('Could not load payments', style: RunqText.body.copyWith(color: t.muted))),
        data: (items) => RefreshIndicator(
          onRefresh: () async => ref.invalidate(pendingPaymentsProvider),
          child: items.isEmpty
              ? _EmptyState(t: t)
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
                  itemCount: items.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (_, i) => _PaymentCard(item: items[i]),
                ),
        ),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  final RunqTokens t;
  const _EmptyState({required this.t});

  @override
  Widget build(BuildContext context) {
    // ListView so RefreshIndicator still works when empty.
    return ListView(
      children: [
        const SizedBox(height: 120),
        Icon(Icons.qr_code_scanner_outlined, size: 48, color: t.muted2),
        const SizedBox(height: 12),
        Center(child: Text('No quick payments yet', style: RunqText.h4.copyWith(color: t.ink))),
        const SizedBox(height: 4),
        Center(
          child: Text('Tap + to log a QR/UPI payment you made',
              style: RunqText.caption.copyWith(color: t.muted)),
        ),
      ],
    );
  }
}

class _PaymentCard extends StatelessWidget {
  final PendingPayment item;
  const _PaymentCard({required this.item});

  Future<void> _viewAttachment(BuildContext context) async {
    try {
      final list = await bankingRepo.attachments(item.attachmentEntityType, item.attachmentEntityId);
      if (!context.mounted) return;
      if (list.isEmpty) {
        showRunqSnack(context, 'No attachment found.', kind: SnackKind.error);
        return;
      }
      context.push('/attachments/view', extra: list.first);
    } on ApiException catch (e) {
      if (context.mounted) showRunqSnack(context, e.message, kind: SnackKind.error);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final payee = item.payeeName?.trim() ?? '';
    final note = item.note?.trim() ?? '';
    return Material(
      // surface (not bgWarm) lifts above the scaffold in BOTH themes — in dark
      // mode bgWarm is darker than the bg, so cards would recede. Hairline
      // border adds definition.
      color: t.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: t.hairline),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        // Only pending captures are editable — matched/cancelled are locked.
        onTap: item.isPending ? () => context.push('/quick-payment', extra: item) : null,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Left column: category icon + payment date (bold) beneath it.
              SizedBox(
                width: 46,
                child: Column(
                  children: [
                    Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        color: RunqColors.indigo.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(Icons.sell_outlined, color: RunqColors.indigo, size: 20),
                    ),
                    const SizedBox(height: 6),
                    Text(_dayMon(item.paymentDate),
                        textAlign: TextAlign.center,
                        style: RunqText.caption.copyWith(color: t.ink, fontWeight: FontWeight.w700)),
                    Text(_year(item.paymentDate),
                        textAlign: TextAlign.center,
                        style: RunqText.micro.copyWith(color: t.muted2)),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Category + amount on the top line.
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Text(item.glAccountName ?? 'Uncategorised',
                              style: RunqText.bodyStrong.copyWith(color: t.ink),
                              maxLines: 1, overflow: TextOverflow.ellipsis),
                        ),
                        const SizedBox(width: 8),
                        Text(formatINR(item.amount),
                            style: RunqText.tabular(size: 16, w: FontWeight.w700, color: t.ink)),
                      ],
                    ),
                    // Name (who) and reason (what for) on their own lines.
                    if (payee.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(payee, style: RunqText.body.copyWith(color: t.ink),
                          maxLines: 1, overflow: TextOverflow.ellipsis),
                    ],
                    if (note.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(note, style: RunqText.caption.copyWith(color: t.muted),
                          maxLines: 2, overflow: TextOverflow.ellipsis),
                    ],
                    const SizedBox(height: 10),
                    // Footer: bank · attachment · status chip, all inline.
                    Row(
                      children: [
                        Expanded(
                          child: Text(item.bankLabel,
                              style: RunqText.micro.copyWith(color: t.muted2),
                              maxLines: 1, overflow: TextOverflow.ellipsis),
                        ),
                        if (item.hasAttachment)
                          InkWell(
                            onTap: () => _viewAttachment(context),
                            borderRadius: BorderRadius.circular(6),
                            child: Padding(
                              padding: const EdgeInsets.all(4),
                              child: Icon(Icons.image_outlined, size: 18, color: t.muted),
                            ),
                          ),
                        const SizedBox(width: 6),
                        _StatusChip(status: item.status),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

String _dayMon(String iso) {
  final p = iso.split('-');
  if (p.length != 3) return iso;
  final m = int.tryParse(p[1]) ?? 0;
  final d = int.tryParse(p[2]) ?? 0;
  if (m < 1 || m > 12 || d < 1) return iso;
  return '$d ${_months[m - 1]}';
}

String _year(String iso) {
  final p = iso.split('-');
  return p.isNotEmpty ? p[0] : '';
}

class _StatusChip extends StatelessWidget {
  final String status;
  const _StatusChip({required this.status});

  @override
  Widget build(BuildContext context) {
    final (label, color, icon) = switch (status) {
      'matched' => ('Matched to bank txn', const Color(0xFF22C55E), Icons.account_balance_outlined),
      'cancelled' => ('Cancelled', const Color(0xFF94A3B8), Icons.cancel_outlined),
      _ => ('Awaiting bank txn', const Color(0xFFF59E0B), Icons.schedule_outlined),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: color),
          const SizedBox(width: 4),
          Text(label, style: RunqText.label.copyWith(color: color)),
        ],
      ),
    );
  }
}
