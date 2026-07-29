import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../api/models.dart';
import '../providers/data_providers.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import '../utils/format_inr.dart';
import '../widgets/date_range_sheet.dart';
import '../widgets/list_filter_kit.dart';
import '../widgets/payment_detail_sheet.dart';
import 'payments_made_widgets.dart';

/// History of captured payments made (QR/UPI). Pending ones are editable
/// until the bank statement matches them; each row shows its match status.
///
/// Layout: filter bar (date range + status) → summary cards → searchable
/// transaction history, each row carrying its own date block.
class PaymentsMadeScreen extends ConsumerStatefulWidget {
  const PaymentsMadeScreen({super.key});

  @override
  ConsumerState<PaymentsMadeScreen> createState() => _PaymentsMadeScreenState();
}

class _PaymentsMadeScreenState extends ConsumerState<PaymentsMadeScreen> {
  final _searchCtrl = TextEditingController();
  String _query = '';
  String _status = 'all'; // all | pending | matched | cancelled
  DateTime? _from;
  DateTime? _to;

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  bool _inRange(String iso) {
    final d = DateTime.tryParse(iso);
    if (d == null) return true;
    if (_from != null && d.isBefore(DateTime(_from!.year, _from!.month, _from!.day))) return false;
    if (_to != null && d.isAfter(DateTime(_to!.year, _to!.month, _to!.day, 23, 59))) return false;
    return true;
  }

  bool _matchesQuery(PendingPayment p) {
    if (_query.isEmpty) return true;
    final hay = [
      p.payeeName ?? '',
      p.note ?? '',
      p.glAccountName ?? '',
      p.upiRef ?? '',
      p.bankLabel,
      p.amount.toStringAsFixed(2),
    ].join(' ').toLowerCase();
    return hay.contains(_query);
  }

  List<PendingPayment> _apply(List<PendingPayment> all) {
    final rows = all
        .where((p) => _status == 'all' || p.status == _status)
        .where((p) => _inRange(p.paymentDate))
        .where(_matchesQuery)
        .toList();
    // Newest first — the API order isn't guaranteed once filters mix statuses.
    rows.sort((a, b) => b.paymentDate.compareTo(a.paymentDate));
    return rows;
  }

  Future<void> _pickRange() async {
    final res = await showDateRangeSheet(context, initialFrom: _from, initialTo: _to);
    if (res == null) return;
    setState(() {
      _from = res.from;
      _to = res.to;
    });
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final async = ref.watch(pendingPaymentsProvider);
    return Scaffold(
      backgroundColor: t.bgWarmer,
      appBar: AppBar(title: const Text('Payments made')),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: RunqColors.indigo,
        foregroundColor: Colors.white,
        onPressed: () => context.push('/payment-made'),
        icon: const Icon(Icons.add),
        label: const Text('New'),
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, _) => Center(
            child: Text('Could not load payments', style: RunqText.body.copyWith(color: t.muted))),
        data: (all) {
          // Range + status drive the summary; search only narrows the list, so
          // the cards keep showing the period total while typing.
          final scoped = all
              .where((p) => _status == 'all' || p.status == _status)
              .where((p) => _inRange(p.paymentDate))
              .toList();
          final rows = _apply(all);
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(pendingPaymentsProvider),
            child: ListView(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
              children: [
                _header(t, scoped, rows.length, all.isEmpty),
                if (rows.isNotEmpty) _PaymentList(rows: rows),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _header(RunqTokens t, List<PendingPayment> scoped, int shown, bool noneAtAll) {
    final paid = scoped.where((p) => p.status != 'cancelled').fold<double>(0, (s, p) => s + p.amount);
    final awaiting = scoped.where((p) => p.isPending).fold<double>(0, (s, p) => s + p.amount);
    final awaitingCount = scoped.where((p) => p.isPending).length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        PaymentsFilterBar(
          rangeLabel: listRangeLabel(_from, _to),
          rangeActive: _from != null || _to != null,
          status: _status,
          onRange: _pickRange,
          onStatus: (s) => setState(() => _status = s),
        ),
        const SizedBox(height: 14),
        Row(
          children: [
            Expanded(
              child: PaymentsSummaryCard(
                label: 'Total paid',
                value: formatINR(paid),
                caption: '${scoped.where((p) => p.status != 'cancelled').length} payments',
                color: RunqColors.indigo,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: PaymentsSummaryCard(
                label: 'Awaiting bank',
                value: formatINR(awaiting),
                caption: '$awaitingCount pending',
                color: const Color(0xFFF59E0B),
              ),
            ),
          ],
        ),
        const SizedBox(height: 18),
        Text('Transaction history', style: RunqText.h3.copyWith(color: t.ink)),
        const SizedBox(height: 10),
        PaymentsSearchField(
          controller: _searchCtrl,
          onChanged: (v) => setState(() => _query = v.trim().toLowerCase()),
        ),
        const SizedBox(height: 12),
        if (shown == 0) PaymentsEmptyState(t: t, noneAtAll: noneAtAll),
      ],
    );
  }
}

class _PaymentList extends StatelessWidget {
  final List<PendingPayment> rows;
  const _PaymentList({required this.rows});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    // No day headers: each row carries its own date block, so a run of
    // payments reads as one continuous card instead of many small ones.
    return Material(
      color: t.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: t.hairline),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          for (var i = 0; i < rows.length; i++) ...[
            if (i > 0) Divider(height: 1, thickness: 1, color: t.hairlineSoft, indent: 72),
            _PaymentRow(item: rows[i]),
          ],
        ],
      ),
    );
  }
}

class _PaymentRow extends StatelessWidget {
  final PendingPayment item;
  const _PaymentRow({required this.item});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final payee = item.payeeName?.trim() ?? '';
    final category = item.glAccountName ?? 'Uncategorised';
    final memo = item.note?.trim() ?? '';
    // Vendor leads — you scan this list by who you paid. The memo sits under
    // it as the "what for"; the category lives in the detail sheet.
    final title = payee.isNotEmpty ? payee : (memo.isNotEmpty ? memo : category);
    final sub = payee.isNotEmpty ? memo : '';
    final cancelled = item.status == 'cancelled';
    return InkWell(
      onTap: () => showPaymentDetailSheet(context, item),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            ListDateBlock(date: DateTime.tryParse(item.paymentDate) ?? DateTime.now()),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      style: RunqText.bodyStrong.copyWith(
                        color: cancelled ? t.muted : t.ink,
                        decoration: cancelled ? TextDecoration.lineThrough : null,
                      ),
                      maxLines: 1, overflow: TextOverflow.ellipsis),
                  if (sub.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(sub,
                        style: RunqText.caption.copyWith(color: t.muted),
                        maxLines: 1, overflow: TextOverflow.ellipsis),
                  ],
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      _StatusChip(status: item.status),
                      const SizedBox(width: 6),
                      Flexible(
                        child: Text(item.bankLabel,
                            style: RunqText.micro.copyWith(color: t.muted2),
                            maxLines: 1, overflow: TextOverflow.ellipsis),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Text(formatINR(-item.amount),
                style: RunqText.tabular(
                    size: 16, w: FontWeight.w700, color: cancelled ? t.muted2 : t.ink)),
          ],
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
      'matched' => ('Matched', const Color(0xFF22C55E), Icons.account_balance_outlined),
      'cancelled' => ('Cancelled', const Color(0xFF94A3B8), Icons.cancel_outlined),
      _ => ('Awaiting bank', const Color(0xFFF59E0B), Icons.schedule_outlined),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: color),
          const SizedBox(width: 4),
          Text(label, style: RunqText.label.copyWith(color: color)),
        ],
      ),
    );
  }
}
