import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../api/models.dart';
import '../providers/data_providers.dart';
import '../theme/runq_tokens.dart';
import '../theme/runq_theme.dart';
import '../utils/format_inr.dart';
import '../widgets/async_slot.dart';
import '../widgets/avatar.dart';
import '../widgets/runq_card.dart';
import '../widgets/status_pill.dart';

class BillDetailScreen extends ConsumerWidget {
  final String id;
  const BillDetailScreen({super.key, required this.id});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detail = ref.watch(billDetailProvider(id));
    return Scaffold(
      body: SafeArea(
        child: AsyncSlot<BillWithDetails>(
          value: detail,
          onRetry: () => ref.invalidate(billDetailProvider(id)),
          data: (bill) => Column(
            children: [
              _Header(invoiceNumber: bill.invoiceNumber),
              Expanded(
                child: ListView(
                  physics: const BouncingScrollPhysics(),
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                  children: [
                    _HeroCard(bill: bill),
                    const SizedBox(height: 14),
                    if (bill.items.isNotEmpty) ...[
                      _LineItemsCard(items: bill.items),
                      const SizedBox(height: 14),
                    ],
                    _GstBreakdownCard(bill: bill),
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

class _Header extends StatelessWidget {
  final String invoiceNumber;
  const _Header({required this.invoiceNumber});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 8, 12),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18),
            onPressed: () => context.pop(),
            color: t.ink,
          ),
          Expanded(child: Center(child: Text(invoiceNumber, style: RunqText.bodyStrong.copyWith(color: t.ink)))),
          const SizedBox(width: 40),
        ],
      ),
    );
  }
}

class _HeroCard extends StatelessWidget {
  final BillWithDetails bill;
  const _HeroCard({required this.bill});

  String _date(DateTime d) {
    const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${d.day} ${m[d.month - 1]} ${d.year}';
  }

  @override
  Widget build(BuildContext context) {
    return RunqCard(
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              RqAvatar(name: bill.vendorName, size: 48),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(bill.vendorName, style: RunqText.h3.copyWith(fontSize: 16)),
                    const SizedBox(height: 4),
                    Text('Due ${_date(bill.dueDate)}',
                        style: RunqText.caption.copyWith(fontSize: 12)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),
          Text('TOTAL', style: RunqText.label),
          const SizedBox(height: 6),
          Text(formatINR(bill.totalAmount), style: RunqText.h1),
          if (bill.balanceDue > 0 && bill.balanceDue != bill.totalAmount) ...[
            const SizedBox(height: 4),
            Text('Balance ${formatINR(bill.balanceDue)}', style: RunqText.caption),
          ],
          const SizedBox(height: 10),
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
    );
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
        Text(matched ? '3WM' : 'Match needed',
            style: RunqText.caption.copyWith(color: color, fontSize: 11, fontWeight: FontWeight.w600)),
      ],
    );
  }
}

class _LineItemsCard extends StatelessWidget {
  final List<BillItem> items;
  const _LineItemsCard({required this.items});

  @override
  Widget build(BuildContext context) {
    return RunqCard(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('LINE ITEMS', style: RunqText.label),
          const SizedBox(height: 8),
          for (var i = 0; i < items.length; i++) ...[
            _ItemRow(item: items[i]),
            if (i < items.length - 1)
              Divider(height: 20, thickness: 1, color: RT(context).hairline),
          ],
        ],
      ),
    );
  }
}

class _ItemRow extends StatelessWidget {
  final BillItem item;
  const _ItemRow({required this.item});

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          flex: 5,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(item.itemName.isEmpty ? item.description : item.itemName, style: RunqText.body),
              const SizedBox(height: 2),
              Text(
                '${item.quantity.toStringAsFixed(item.quantity == item.quantity.toInt() ? 0 : 2)} × ${formatINR(item.unitPrice)}',
                style: RunqText.caption.copyWith(fontSize: 11),
              ),
            ],
          ),
        ),
        Text(formatINR(item.amount), style: RunqText.tabular(size: 14, w: FontWeight.w600)),
      ],
    );
  }
}

class _GstBreakdownCard extends StatelessWidget {
  final BillWithDetails bill;
  const _GstBreakdownCard({required this.bill});

  @override
  Widget build(BuildContext context) {
    return RunqCard(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('GST BREAKDOWN', style: RunqText.label),
          const SizedBox(height: 8),
          _LineRow(label: 'Subtotal', value: formatINR(bill.subtotal)),
          if (bill.igst > 0) _LineRow(label: 'IGST', value: formatINR(bill.igst)),
          if (bill.cgst > 0) _LineRow(label: 'CGST', value: formatINR(bill.cgst)),
          if (bill.sgst > 0) _LineRow(label: 'SGST', value: formatINR(bill.sgst)),
          if (bill.cess > 0) _LineRow(label: 'Cess', value: formatINR(bill.cess)),
          Divider(height: 14, thickness: 0.5, color: RT(context).hairlineSoft),
          _LineRow(label: 'Total', value: formatINR(bill.totalAmount), strong: true),
        ],
      ),
    );
  }
}

class _LineRow extends StatelessWidget {
  final String label, value;
  final bool strong;
  const _LineRow({required this.label, required this.value, this.strong = false});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final style = strong
        ? RunqText.bodyStrong.copyWith(fontSize: 14, color: t.ink)
        : RunqText.caption.copyWith(fontSize: 12, color: t.muted);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(child: Text(label, style: style)),
          Text(value, style: RunqText.tabular(size: strong ? 14 : 12, w: strong ? FontWeight.w700 : FontWeight.w500)),
        ],
      ),
    );
  }
}
