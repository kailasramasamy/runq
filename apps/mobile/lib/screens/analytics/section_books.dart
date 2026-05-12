import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/analytics_models.dart';
import '../../providers/analytics_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../utils/format_inr.dart';
import 'widgets.dart';

class BooksSection extends ConsumerStatefulWidget {
  const BooksSection({super.key});
  @override
  ConsumerState<BooksSection> createState() => _BooksSectionState();
}

class _BooksSectionState extends ConsumerState<BooksSection> {
  String _period = 'fy';

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        _PnlCard(
          period: _period,
          value: ref.watch(pnlSummaryProvider(_period)),
          onPeriodChanged: (p) => setState(() => _period = p),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(child: _BsCard(value: ref.watch(bsSummaryProvider))),
            const SizedBox(width: 12),
            Expanded(child: _TbCard(value: ref.watch(tbSummaryProvider))),
          ],
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(child: _UnreconciledCard(value: ref.watch(unreconciledProvider))),
            const SizedBox(width: 12),
            Expanded(child: _ApprovalsCard(value: ref.watch(pendingApprovalsAnalyticsProvider))),
          ],
        ),
        const SizedBox(height: 12),
        _SuspenseCard(value: ref.watch(suspenseProvider)),
        const SizedBox(height: 12),
        _GrossMarginCard(value: ref.watch(grossMarginProvider)),
      ],
    );
  }
}

class _PnlCard extends StatelessWidget {
  final String period;
  final AsyncValue<PnlSummary?> value;
  final ValueChanged<String> onPeriodChanged;
  const _PnlCard({
    required this.period,
    required this.value,
    required this.onPeriodChanged,
  });

  @override
  Widget build(BuildContext context) {
    final subtitle = switch (period) {
      'fy' => 'FY to date',
      'qtr' => 'Quarter to date',
      _ => 'Month to date',
    };
    return MetricCard<PnlSummary>(
      title: 'Profit & Loss',
      subtitle: subtitle,
      trailing: _PeriodToggle(period: period, onChanged: onPeriodChanged),
      value: value,
      onTap: () => context.push('/money/reports'),
      footerLabel: 'View reports',
      builder: (d) {
        final positive = d.netProfit >= 0;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            BigNumber(
              '${positive ? '' : '−'}${formatINR(d.netProfit.abs(), compact: true)}',
              size: 26,
              color: positive ? RunqColors.greenInk : RunqColors.redInk,
            ),
            const SizedBox(height: 2),
            Text('${d.period.from} → ${d.period.to}',
                style: RunqText.caption.copyWith(color: RT(context).muted2)),
            const SizedBox(height: 14),
            StatRow(label: 'Revenue', value: formatINR(d.totalRevenue, compact: true)),
            StatRow(label: 'Expense', value: formatINR(d.totalExpense, compact: true)),
            if (d.netProfitDeltaPct != null) ...[
              const SizedBox(height: 6),
              Text(
                'vs prev period: ${d.netProfitDeltaPct! >= 0 ? '+' : ''}'
                '${d.netProfitDeltaPct!.toStringAsFixed(1)}%',
                style: RunqText.caption.copyWith(
                    color: d.netProfitDeltaPct! >= 0 ? RunqColors.greenInk : RunqColors.redInk,
                    fontWeight: FontWeight.w600, fontSize: 11.5),
              ),
            ],
          ],
        );
      },
    );
  }
}

class _PeriodToggle extends StatelessWidget {
  final String period;
  final ValueChanged<String> onChanged;
  const _PeriodToggle({required this.period, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    Widget seg(String key, String label) {
      final active = period == key;
      return GestureDetector(
        onTap: () => onChanged(key),
        behavior: HitTestBehavior.opaque,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 140),
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
          decoration: BoxDecoration(
            color: active ? t.surface : Colors.transparent,
            borderRadius: BorderRadius.circular(8),
            boxShadow: active ? RunqShadows.card : null,
          ),
          child: Text(label,
              style: RunqText.caption.copyWith(
                  color: active ? t.ink : t.muted,
                  fontWeight: FontWeight.w600,
                  fontSize: 11.5)),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: t.bgWarmer,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        seg('fy', 'FY'),
        seg('qtr', 'QTD'),
        seg('month', 'MTD'),
      ]),
    );
  }
}

class _BsCard extends StatelessWidget {
  final AsyncValue<BsSummary?> value;
  const _BsCard({required this.value});

  @override
  Widget build(BuildContext context) {
    return MetricCard<BsSummary>(
      title: 'Balance sheet',
      value: value,
      onTap: () => context.push('/money/reports'),
      builder: (d) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('As on ${d.asOfDate}',
              style: RunqText.caption.copyWith(color: RT(context).muted2)),
          const SizedBox(height: 10),
          StatRow(label: 'Assets', value: formatINR(d.totalAssets, compact: true)),
          StatRow(label: 'Liabilities', value: formatINR(d.totalLiabilities, compact: true)),
          StatRow(label: 'Equity', value: formatINR(d.totalEquity, compact: true)),
          const SizedBox(height: 10),
          StatusPill(
            d.balanced ? 'Balanced' : 'Imbalanced',
            tone: d.balanced ? StatusTone.ok : StatusTone.neg,
          ),
        ],
      ),
    );
  }
}

class _TbCard extends StatelessWidget {
  final AsyncValue<TbSummary?> value;
  const _TbCard({required this.value});

  @override
  Widget build(BuildContext context) {
    return MetricCard<TbSummary>(
      title: 'Trial balance',
      value: value,
      onTap: () => context.push('/money/reports'),
      builder: (d) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('${d.accountCount} accounts',
              style: RunqText.caption.copyWith(color: RT(context).muted2)),
          const SizedBox(height: 10),
          StatRow(label: 'Debits', value: formatINR(d.totalDebit, compact: true)),
          StatRow(label: 'Credits', value: formatINR(d.totalCredit, compact: true)),
          const SizedBox(height: 10),
          StatusPill(
            d.balanced ? 'Balanced' : 'Imbalanced',
            tone: d.balanced ? StatusTone.ok : StatusTone.warn,
          ),
        ],
      ),
    );
  }
}

class _UnreconciledCard extends StatelessWidget {
  final AsyncValue<UnreconciledBankTxns?> value;
  const _UnreconciledCard({required this.value});

  @override
  Widget build(BuildContext context) {
    return MetricCard<UnreconciledBankTxns>(
      title: 'Unreconciled',
      subtitle: 'Across banks',
      value: value,
      onTap: () => context.push('/money/banking'),
      builder: (d) {
        final clean = d.count == 0;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            BigNumber('${d.count}', size: 28,
                color: clean ? RunqColors.greenInk : null),
            const SizedBox(height: 6),
            Text(
              clean ? 'All reconciled' : formatINR(d.total, compact: true),
              style: RunqText.caption.copyWith(color: RT(context).muted),
            ),
          ],
        );
      },
    );
  }
}

class _ApprovalsCard extends StatelessWidget {
  final AsyncValue<PendingApprovalsSummary?> value;
  const _ApprovalsCard({required this.value});

  @override
  Widget build(BuildContext context) {
    return MetricCard<PendingApprovalsSummary>(
      title: 'Approvals',
      subtitle: 'Awaiting review',
      value: value,
      onTap: () => context.push('/approvals'),
      builder: (d) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          BigNumber('${d.total}', size: 28,
              color: d.total == 0 ? RunqColors.greenInk : null),
          const SizedBox(height: 6),
          Text(
            d.total == 0
                ? 'Nothing waiting'
                : '${d.categoryCount} ${d.categoryCount == 1 ? 'category' : 'categories'}',
            style: RunqText.caption.copyWith(color: RT(context).muted),
          ),
        ],
      ),
    );
  }
}

class _SuspenseCard extends StatelessWidget {
  final AsyncValue<SuspenseSummary?> value;
  const _SuspenseCard({required this.value});

  @override
  Widget build(BuildContext context) {
    return MetricCard<SuspenseSummary>(
      title: 'Suspense / clearing',
      subtitle: 'Stuck balances',
      value: value,
      onTap: () => context.push('/money/reports'),
      footerLabel: 'View reports',
      emptyHint: 'No suspense accounts',
      builder: (d) => Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                BigNumber(
                  d.clean ? '₹0' : formatINR(d.totalAbsBalance, compact: true),
                  color: d.clean ? RunqColors.greenInk : RunqColors.amberInk,
                ),
                const SizedBox(height: 4),
                Text(d.clean ? 'All clear' : '${d.totalStuck} accounts stuck',
                    style: RunqText.caption.copyWith(color: RT(context).muted)),
              ],
            ),
          ),
          StatusPill(
            d.clean ? 'Clean' : 'Investigate',
            tone: d.clean ? StatusTone.ok : StatusTone.warn,
          ),
        ],
      ),
    );
  }
}

class _GrossMarginCard extends StatelessWidget {
  final AsyncValue<GrossMargin?> value;
  const _GrossMarginCard({required this.value});

  @override
  Widget build(BuildContext context) {
    return MetricCard<GrossMargin>(
      title: 'Gross margin',
      subtitle: 'FY to date',
      value: value,
      onTap: () => context.push('/money/reports'),
      footerLabel: 'View P&L',
      emptyHint: 'No revenue posted yet this FY',
      builder: (d) {
        if (d.revenue == 0) {
          return const StatusPill('No revenue this FY', tone: StatusTone.neutral);
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            BigNumber(
              d.marginPct == null ? '—' : '${d.marginPct!.toStringAsFixed(1)}%',
              size: 28,
            ),
            const SizedBox(height: 12),
            StatRow(label: 'Revenue', value: formatINR(d.revenue, compact: true)),
            StatRow(label: 'COGS', value: formatINR(d.cogs, compact: true)),
            StatRow(
              label: 'Gross profit',
              value: formatINR(d.grossProfit, compact: true),
              emphasize: true,
            ),
          ],
        );
      },
    );
  }
}
