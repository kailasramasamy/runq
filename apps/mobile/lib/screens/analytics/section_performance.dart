import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/analytics_models.dart';
import '../../providers/analytics_providers.dart';
import '../../theme/runq_theme.dart';
import '../../theme/runq_tokens.dart';
import '../../utils/format_inr.dart';
import 'widgets.dart';

class PerformanceSection extends ConsumerWidget {
  const PerformanceSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Column(
      children: [
        _RevExpCard(value: ref.watch(revenueVsExpense12moProvider)),
        const SizedBox(height: 12),
        _DsoCard(value: ref.watch(dsoTrend6moProvider)),
        const SizedBox(height: 12),
        _TopExpenseCard(value: ref.watch(topExpenseCategoriesProvider)),
      ],
    );
  }
}

class _RevExpCard extends StatelessWidget {
  final AsyncValue<RevenueVsExpense12mo?> value;
  const _RevExpCard({required this.value});

  @override
  Widget build(BuildContext context) {
    return MetricCard<RevenueVsExpense12mo>(
      title: 'Revenue vs expense',
      subtitle: 'Last 12 months',
      value: value,
      onTap: () => context.push('/money/reports'),
      footerLabel: 'View reports',
      emptyHint: 'No posted journal entries',
      builder: (d) {
        if (d.totalRevenue == 0 && d.totalExpense == 0) {
          return const _EmptyText('Nothing posted in this window');
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                _LegendDot(label: 'Revenue', color: statusInk(context, StatusTone.ok)),
                const SizedBox(width: 14),
                _LegendDot(label: 'Expense', color: statusInk(context, StatusTone.warn)),
                const Spacer(),
                Text(
                  'Net ${formatINR(d.totalRevenue - d.totalExpense, compact: true)}',
                  style: RunqText.tabular(
                      size: 13, w: FontWeight.w700, color: RT(context).ink),
                ),
              ],
            ),
            const SizedBox(height: 12),
            SizedBox(height: 160, child: _RevExpBars(months: d.months)),
          ],
        );
      },
    );
  }
}

class _RevExpBars extends StatelessWidget {
  final List<RevExpMonth> months;
  const _RevExpBars({required this.months});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final maxV = months.fold<double>(0, (a, m) {
      final mv = m.revenue > m.expense ? m.revenue : m.expense;
      return a > mv ? a : mv;
    });
    final maxY = (maxV * 1.15).clamp(1.0, double.infinity);
    return BarChart(BarChartData(
      maxY: maxY,
      minY: 0,
      groupsSpace: 8,
      barGroups: [
        for (var i = 0; i < months.length; i++)
          BarChartGroupData(x: i, barsSpace: 3, barRods: [
            BarChartRodData(
              toY: months[i].revenue.clamp(0, double.infinity),
              color: statusInk(context, StatusTone.ok),
              width: 6,
              borderRadius: const BorderRadius.vertical(top: Radius.circular(3)),
            ),
            BarChartRodData(
              toY: months[i].expense.clamp(0, double.infinity),
              color: statusInk(context, StatusTone.warn),
              width: 6,
              borderRadius: const BorderRadius.vertical(top: Radius.circular(3)),
            ),
          ]),
      ],
      gridData: FlGridData(
        show: true,
        drawVerticalLine: false,
        horizontalInterval: maxY / 3,
        getDrawingHorizontalLine: (_) => FlLine(color: t.hairlineSoft, strokeWidth: 0.5),
      ),
      borderData: FlBorderData(show: false),
      titlesData: FlTitlesData(
        topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
        rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
        leftTitles: AxisTitles(
          sideTitles: SideTitles(
            showTitles: true,
            reservedSize: 40,
            interval: maxY / 3,
            getTitlesWidget: (v, _) => Text(formatINR(v, compact: true, currency: false),
                style: RunqText.micro.copyWith(color: t.muted2)),
          ),
        ),
        bottomTitles: AxisTitles(
          sideTitles: SideTitles(
            showTitles: true,
            reservedSize: 20,
            getTitlesWidget: (v, _) {
              final i = v.toInt();
              if (i < 0 || i >= months.length) return const SizedBox.shrink();
              if (months.length > 6 && i % 2 != 0) return const SizedBox.shrink();
              final m = months[i].month;
              final short = m.length >= 3 ? m.substring(m.length - 3) : m;
              return Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(short,
                    style: RunqText.micro.copyWith(color: t.muted2)),
              );
            },
          ),
        ),
      ),
      barTouchData: BarTouchData(
        touchTooltipData: BarTouchTooltipData(
          getTooltipColor: (_) => t.ink,
          getTooltipItem: (g, _, rod, idx) {
            final m = months[g.x];
            final lab = idx == 0 ? 'Revenue' : 'Expense';
            return BarTooltipItem(
              '${m.month}\n$lab ${formatINR(rod.toY)}',
              RunqText.caption.copyWith(
                  color: Colors.white, fontWeight: FontWeight.w600),
            );
          },
        ),
      ),
    ));
  }
}

class _DsoCard extends StatelessWidget {
  final AsyncValue<DsoTrend6mo?> value;
  const _DsoCard({required this.value});

  @override
  Widget build(BuildContext context) {
    return MetricCard<DsoTrend6mo>(
      title: 'Days sales outstanding',
      subtitle: 'Trend over 6 months',
      value: value,
      onTap: () => context.push('/sales/invoices'),
      footerLabel: 'View invoices',
      emptyHint: 'Not enough sales history yet',
      builder: (d) {
        if (d.months.every((m) => m.dso == null)) {
          return const _EmptyText('Not enough sales history yet');
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              _StatBlock(
                label: 'Latest',
                value: d.latestDso == null ? '—' : '${d.latestDso!.toStringAsFixed(0)}d',
                tone: StatusTone.warn,
              ),
              const SizedBox(width: 12),
              _StatBlock(
                label: 'Average',
                value: d.averageDso == null ? '—' : '${d.averageDso!.toStringAsFixed(0)}d',
                tone: StatusTone.neutral,
              ),
            ]),
            const SizedBox(height: 14),
            SizedBox(height: 120, child: _DsoLine(points: d.months)),
          ],
        );
      },
    );
  }
}

class _DsoLine extends StatelessWidget {
  final List<DsoPoint> points;
  const _DsoLine({required this.points});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final filled = <FlSpot>[];
    double maxY = 0;
    for (var i = 0; i < points.length; i++) {
      final v = points[i].dso;
      if (v != null) {
        filled.add(FlSpot(i.toDouble(), v));
        if (v > maxY) maxY = v;
      }
    }
    final yMax = (maxY * 1.2).clamp(10, double.infinity).toDouble();
    return LineChart(LineChartData(
      minY: 0,
      maxY: yMax,
      minX: 0,
      maxX: (points.length - 1).toDouble(),
      gridData: FlGridData(
        show: true,
        drawVerticalLine: false,
        horizontalInterval: yMax / 3,
        getDrawingHorizontalLine: (_) =>
            FlLine(color: t.hairlineSoft, strokeWidth: 0.5),
      ),
      borderData: FlBorderData(show: false),
      titlesData: FlTitlesData(
        topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
        rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
        leftTitles: AxisTitles(
          sideTitles: SideTitles(
            showTitles: true,
            reservedSize: 28,
            interval: yMax / 3,
            getTitlesWidget: (v, _) => Text('${v.toStringAsFixed(0)}d',
                style: RunqText.micro.copyWith(color: t.muted2)),
          ),
        ),
        bottomTitles: AxisTitles(
          sideTitles: SideTitles(
            showTitles: true,
            reservedSize: 18,
            getTitlesWidget: (v, _) {
              final i = v.toInt();
              if (i < 0 || i >= points.length) return const SizedBox.shrink();
              final m = points[i].month;
              final short = m.length >= 3 ? m.substring(m.length - 3) : m;
              return Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(short,
                    style: RunqText.micro.copyWith(color: t.muted2)),
              );
            },
          ),
        ),
      ),
      lineBarsData: [
        LineChartBarData(
          spots: filled,
          isCurved: true,
          curveSmoothness: 0.25,
          color: t.brand,
          barWidth: 2.5,
          dotData: FlDotData(
            show: true,
            getDotPainter: (_, __, ___, ____) => FlDotCirclePainter(
              radius: 3, color: t.brand, strokeWidth: 0,
            ),
          ),
          belowBarData: BarAreaData(
            show: true,
            color: t.brand.withValues(alpha: 0.08),
          ),
        ),
      ],
      lineTouchData: LineTouchData(
        touchTooltipData: LineTouchTooltipData(
          getTooltipColor: (_) => t.ink,
          getTooltipItems: (spots) => spots.map((s) {
            final p = points[s.x.toInt()];
            return LineTooltipItem(
              '${p.month}\n${s.y.toStringAsFixed(0)} days',
              RunqText.caption.copyWith(
                  color: Colors.white, fontWeight: FontWeight.w600),
            );
          }).toList(),
        ),
      ),
    ));
  }
}

class _TopExpenseCard extends StatelessWidget {
  final AsyncValue<TopExpenseCategories?> value;
  const _TopExpenseCard({required this.value});

  @override
  Widget build(BuildContext context) {
    return MetricCard<TopExpenseCategories>(
      title: 'Top expense categories',
      subtitle: 'This month',
      value: value,
      onTap: () => context.push('/money/reports'),
      footerLabel: 'View reports',
      emptyHint: 'No expenses posted this month',
      builder: (d) {
        if (d.items.isEmpty) return const _EmptyText('No expenses posted this month');
        final max = d.items.map((c) => c.amount).fold<double>(0, (a, b) => a > b ? a : b);
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (final (i, c) in d.items.take(5).indexed) ...[
              if (i > 0) const SizedBox(height: 10),
              _CategoryRow(
                  name: '${c.accountName} · ${c.accountCode}',
                  amount: c.amount,
                  max: max),
            ],
          ],
        );
      },
    );
  }
}

class _CategoryRow extends StatelessWidget {
  final String name;
  final double amount, max;
  const _CategoryRow({required this.name, required this.amount, required this.max});

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
                style: RunqText.bodyStrong.copyWith(color: t.ink)),
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
                  color: statusInk(context, StatusTone.warn).withValues(alpha: 0.7),
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

class _LegendDot extends StatelessWidget {
  final String label;
  final Color color;
  const _LegendDot({required this.label, required this.color});
  @override
  Widget build(BuildContext context) {
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Container(width: 8, height: 8, decoration: BoxDecoration(
        color: color, borderRadius: BorderRadius.circular(2),
      )),
      const SizedBox(width: 6),
      Text(label,
          style: RunqText.caption.copyWith(color: RT(context).muted)),
    ]);
  }
}

class _StatBlock extends StatelessWidget {
  final String label, value;
  final StatusTone tone;
  const _StatBlock({required this.label, required this.value, required this.tone});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Expanded(
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
        decoration: BoxDecoration(
          color: t.bgWarmer,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(label.toUpperCase(),
                style: RunqText.micro.copyWith(color: t.muted)),
            const SizedBox(height: 4),
            Text(value,
                style: RunqText.tabular(
                    size: 18, w: FontWeight.w700, color: t.ink)),
          ],
        ),
      ),
    );
  }
}

class _EmptyText extends StatelessWidget {
  final String text;
  const _EmptyText(this.text);
  @override
  Widget build(BuildContext context) => Text(
        text, style: RunqText.caption.copyWith(color: RT(context).muted2),
      );
}
