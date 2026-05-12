import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/analytics_models.dart';
import '../../providers/analytics_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../utils/format_inr.dart';
import 'widgets.dart';

class ArApSection extends ConsumerWidget {
  const ArApSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Column(
      children: [
        _AgingCard(
          title: 'Receivables aging',
          subtitle: 'By days overdue',
          value: ref.watch(arAgingProvider),
          onTap: () => context.push('/sales/invoices'),
          footerLabel: 'View invoices',
        ),
        const SizedBox(height: 12),
        _AgingCard(
          title: 'Payables aging',
          subtitle: 'By days overdue',
          value: ref.watch(apAgingProvider),
          onTap: () => context.push('/purchases/bills'),
          footerLabel: 'View bills',
        ),
        const SizedBox(height: 12),
        _OverdueCustomersCard(value: ref.watch(topOverdueCustomersProvider)),
      ],
    );
  }
}

class _AgingCard extends StatelessWidget {
  final String title, subtitle, footerLabel;
  final AsyncValue<AgingPayload?> value;
  final VoidCallback onTap;
  const _AgingCard({
    required this.title,
    required this.subtitle,
    required this.value,
    required this.onTap,
    required this.footerLabel,
  });

  Color _bucketColor(String key) {
    switch (key) {
      case '0-30':
        return RunqColors.blueInk;
      case '31-60':
        return RunqColors.indigo;
      case '61-90':
        return RunqColors.amberInk;
      default:
        return RunqColors.redInk;
    }
  }

  @override
  Widget build(BuildContext context) {
    return MetricCard<AgingPayload>(
      title: title,
      subtitle: subtitle,
      value: value,
      onTap: onTap,
      footerLabel: footerLabel,
      emptyHint: 'Nothing outstanding',
      builder: (p) {
        if (p.totalCount == 0) {
          return const StatusPill('All clear', tone: StatusTone.ok);
        }
        final max = p.buckets.map((b) => b.amount).fold<double>(0, (a, b) => a > b ? a : b);
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            BigNumber(formatINR(p.total), size: 22),
            const SizedBox(height: 2),
            Text('${p.totalCount} open',
                style: RunqText.caption.copyWith(color: RT(context).muted2)),
            const SizedBox(height: 14),
            for (final b in p.buckets) ...[
              _BucketBar(
                label: b.key,
                amount: b.amount,
                count: b.count,
                max: max,
                color: _bucketColor(b.key),
              ),
              const SizedBox(height: 8),
            ],
          ],
        );
      },
    );
  }
}

class _BucketBar extends StatelessWidget {
  final String label;
  final double amount;
  final int count;
  final double max;
  final Color color;
  const _BucketBar({
    required this.label,
    required this.amount,
    required this.count,
    required this.max,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final pct = max <= 0 ? 0.0 : (amount / max).clamp(0.0, 1.0);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        SizedBox(
          width: 44,
          child: Text(label,
              style: RunqText.caption.copyWith(color: t.muted, fontSize: 11.5)),
        ),
        Expanded(
          child: Container(
            height: 6,
            decoration: BoxDecoration(
              color: t.bgWarmer,
              borderRadius: BorderRadius.circular(999),
            ),
            child: Align(
              alignment: Alignment.centerLeft,
              child: FractionallySizedBox(
                widthFactor: pct,
                child: Container(
                  decoration: BoxDecoration(
                    color: color,
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
              ),
            ),
          ),
        ),
        const SizedBox(width: 10),
        SizedBox(
          width: 96,
          child: Text(
            formatINR(amount, compact: true),
            textAlign: TextAlign.right,
            style: RunqText.tabular(size: 12, w: FontWeight.w600, color: t.ink2),
          ),
        ),
      ],
    );
  }
}

class _OverdueCustomersCard extends StatelessWidget {
  final AsyncValue<TopOverdueCustomers?> value;
  const _OverdueCustomersCard({required this.value});

  @override
  Widget build(BuildContext context) {
    return MetricCard<TopOverdueCustomers>(
      title: 'Top overdue customers',
      subtitle: 'By amount outstanding',
      value: value,
      onTap: () => context.push('/sales/collections'),
      footerLabel: 'Open collections',
      emptyHint: 'No overdue customers',
      builder: (d) {
        if (d.items.isEmpty) {
          return const StatusPill('Nobody overdue', tone: StatusTone.ok);
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (final (i, c) in d.items.take(5).indexed) ...[
              if (i > 0) const SizedBox(height: 10),
              _OverdueRow(item: c),
            ],
            if (d.items.length > 5) ...[
              const SizedBox(height: 10),
              Text('+${d.items.length - 5} more · total ${formatINR(d.totalAmount, compact: true)}',
                  style: RunqText.caption.copyWith(color: RT(context).muted)),
            ],
          ],
        );
      },
    );
  }
}

class _OverdueRow extends StatelessWidget {
  final OverdueCustomer item;
  const _OverdueRow({required this.item});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Row(
      children: [
        Container(
          width: 8, height: 8,
          decoration: const BoxDecoration(
            color: RunqColors.redInk, shape: BoxShape.circle,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(item.customerName,
                  maxLines: 1, overflow: TextOverflow.ellipsis,
                  style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 13)),
              Text('${item.maxDaysOverdue}d overdue',
                  style: RunqText.caption.copyWith(color: t.muted2, fontSize: 11)),
            ],
          ),
        ),
        Text(formatINR(item.balanceDue, compact: true),
            style: RunqText.tabular(
                size: 13, w: FontWeight.w700, color: RunqColors.redInk)),
      ],
    );
  }
}
