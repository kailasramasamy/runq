import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../api/models.dart';
import '../providers/data_providers.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import '../utils/format_inr.dart';

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

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final subtitle = [item.payeeName, item.note].where((s) => s != null && s.isNotEmpty).join(' · ');
    return Material(
      color: t.bgWarm,
      borderRadius: BorderRadius.circular(14),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        // Only pending captures are editable — matched/cancelled are locked.
        onTap: item.isPending ? () => context.push('/quick-payment', extra: item) : null,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: const Color(0xFF22C55E).withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(Icons.sell_outlined, color: Color(0xFF22C55E), size: 20),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(item.glAccountName ?? 'Uncategorised',
                        style: RunqText.bodyStrong.copyWith(color: t.ink),
                        maxLines: 1, overflow: TextOverflow.ellipsis),
                  ),
                  const SizedBox(width: 8),
                  Text(formatINR(item.amount), style: RunqText.tabular(size: 16, w: FontWeight.w700, color: t.ink)),
                ],
              ),
              if (subtitle.isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(subtitle, style: RunqText.caption.copyWith(color: t.muted), maxLines: 2, overflow: TextOverflow.ellipsis),
              ],
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      [item.paymentDate, item.bankLabel].where((s) => s.isNotEmpty).join('  ·  '),
                      style: RunqText.micro.copyWith(color: t.muted2),
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const SizedBox(width: 8),
                  _StatusChip(status: item.status),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  final String status;
  const _StatusChip({required this.status});

  @override
  Widget build(BuildContext context) {
    final (label, color, icon) = switch (status) {
      'matched' => ('Reconciled', const Color(0xFF22C55E), Icons.check_circle_outline),
      'cancelled' => ('Cancelled', const Color(0xFF94A3B8), Icons.cancel_outlined),
      _ => ('Pending', const Color(0xFFF59E0B), Icons.schedule_outlined),
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
