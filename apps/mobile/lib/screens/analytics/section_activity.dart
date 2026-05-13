import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/analytics_models.dart';
import '../../providers/analytics_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../utils/format_inr.dart';
import 'widgets.dart';

class ActivitySection extends ConsumerWidget {
  const ActivitySection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Column(
      children: [
        _SalesMtdCard(value: ref.watch(salesMtdProvider)),
        const SizedBox(height: 12),
        _BillsDueCard(value: ref.watch(billsDueWeekProvider)),
        const SizedBox(height: 12),
        _TopVendorsCard(value: ref.watch(topVendorsBySpendProvider)),
      ],
    );
  }
}

class _SalesMtdCard extends StatelessWidget {
  final AsyncValue<SalesMtd?> value;
  const _SalesMtdCard({required this.value});

  @override
  Widget build(BuildContext context) {
    return MetricCard<SalesMtd>(
      title: 'Sales this month',
      subtitle: 'Invoices dated this month',
      value: value,
      onTap: () => context.push('/sales/invoices'),
      footerLabel: 'View invoices',
      builder: (d) {
        final delta = d.deltaPct;
        final down = (delta ?? 0) < 0;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            BigNumber(formatINR(d.amount), size: 24),
            const SizedBox(height: 4),
            Text('${d.count} invoice${d.count == 1 ? '' : 's'}',
                style: RunqText.caption.copyWith(color: RT(context).muted2)),
            if (delta != null) ...[
              const SizedBox(height: 12),
              Row(children: [
                Text('Last month ${formatINR(d.prevAmount, compact: true)}',
                    style: RunqText.caption
                        .copyWith(color: RT(context).muted, fontSize: 12)),
                const SizedBox(width: 10),
                _DeltaChip(deltaPct: delta, down: down),
              ]),
            ],
          ],
        );
      },
    );
  }
}

class _DeltaChip extends StatelessWidget {
  final double deltaPct;
  final bool down;
  const _DeltaChip({required this.deltaPct, required this.down});

  @override
  Widget build(BuildContext context) {
    final (bg, ink) = statusColors(context, down ? StatusTone.neg : StatusTone.ok);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(99),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(down ? Icons.arrow_downward_rounded : Icons.arrow_upward_rounded,
              size: 11, color: ink),
          const SizedBox(width: 4),
          Text('${deltaPct >= 0 ? '+' : ''}${deltaPct.toStringAsFixed(1)}%',
              style: RunqText.caption.copyWith(
                  color: ink, fontWeight: FontWeight.w700, fontSize: 11.5)),
        ],
      ),
    );
  }
}

class _BillsDueCard extends StatelessWidget {
  final AsyncValue<BillsDueWeek?> value;
  const _BillsDueCard({required this.value});

  @override
  Widget build(BuildContext context) {
    return MetricCard<BillsDueWeek>(
      title: 'Bills due this week',
      subtitle: 'Next 7 days',
      value: value,
      onTap: () => context.push('/purchases/bills'),
      footerLabel: 'View bills',
      emptyHint: 'No bills due in the next 7 days',
      builder: (d) {
        if (d.items.isEmpty) {
          return const StatusPill('Nothing due this week', tone: StatusTone.ok);
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            BigNumber(formatINR(d.totalAmount), size: 22),
            const SizedBox(height: 2),
            Text('${d.items.length} bill${d.items.length == 1 ? '' : 's'}',
                style: RunqText.caption.copyWith(color: RT(context).muted2)),
            const SizedBox(height: 12),
            for (final (i, b) in d.items.take(4).indexed) ...[
              if (i > 0) const SizedBox(height: 6),
              StatRow(
                label: b.vendorName,
                value: formatINR(b.balanceDue, compact: true),
              ),
            ],
            if (d.items.length > 4) ...[
              const SizedBox(height: 6),
              Text('+${d.items.length - 4} more',
                  style: RunqText.caption.copyWith(color: RT(context).muted)),
            ],
          ],
        );
      },
    );
  }
}

class _TopVendorsCard extends StatelessWidget {
  final AsyncValue<TopVendorsBySpend?> value;
  const _TopVendorsCard({required this.value});

  @override
  Widget build(BuildContext context) {
    return MetricCard<TopVendorsBySpend>(
      title: 'Top vendors by spend',
      subtitle: 'Last 90 days',
      value: value,
      onTap: () => context.push('/purchases/bills'),
      footerLabel: 'View bills',
      emptyHint: 'No vendor spend in window',
      builder: (d) {
        if (d.items.isEmpty) return const SizedBox.shrink();
        final max = d.items.map((v) => v.totalSpend).fold<double>(0, (a, b) => a > b ? a : b);
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (final (i, v) in d.items.take(5).indexed) ...[
              if (i > 0) const SizedBox(height: 10),
              _VendorRow(name: v.vendorName, amount: v.totalSpend, max: max),
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

class _VendorRow extends StatelessWidget {
  final String name;
  final double amount, max;
  const _VendorRow({required this.name, required this.amount, required this.max});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final pct = max <= 0 ? 0.0 : (amount / max).clamp(0.0, 1.0);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(children: [
          Expanded(
            child: Text(name,
                maxLines: 1, overflow: TextOverflow.ellipsis,
                style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 13)),
          ),
          Text(formatINR(amount, compact: true),
              style: RunqText.tabular(size: 13, w: FontWeight.w600, color: t.ink2)),
        ]),
        const SizedBox(height: 4),
        Container(
          height: 4,
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
                  color: t.brand.withValues(alpha: 0.55),
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
