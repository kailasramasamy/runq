import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';
import '../../api/reports_models.dart';
import '../../theme/runq_tokens.dart';
import '../../theme/runq_theme.dart';
import '../../utils/format_inr.dart';
import '../../widgets/runq_card.dart';
import '../analytics/widgets.dart';

String monthLabel(String ym) {
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  final parts = ym.split('-');
  if (parts.length < 2) return ym;
  final m = int.tryParse(parts[1]) ?? 0;
  return (m >= 1 && m <= 12) ? names[m - 1] : ym;
}

/// At-a-glance money-in / money-out / net for the selected period.
class ReportHero extends StatelessWidget {
  final double moneyIn, moneyOut, net;
  final int txnCount;
  const ReportHero({
    super.key,
    required this.moneyIn,
    required this.moneyOut,
    required this.net,
    required this.txnCount,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return RunqCard(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              _Stat(label: 'Money in', value: moneyIn, color: statusInk(context, StatusTone.ok)),
              _VDivider(color: t.hairline),
              _Stat(label: 'Money out', value: moneyOut, color: statusInk(context, StatusTone.neg)),
              _VDivider(color: t.hairline),
              _Stat(
                label: 'Net',
                value: net,
                color: net >= 0 ? statusInk(context, StatusTone.ok) : statusInk(context, StatusTone.neg),
                signed: true,
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text('$txnCount transactions in period',
              style: RunqText.micro.copyWith(color: t.muted2)),
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  final String label;
  final double value;
  final Color color;
  final bool signed;
  const _Stat({required this.label, required this.value, required this.color, this.signed = false});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: RunqText.micro.copyWith(color: t.muted2)),
          const SizedBox(height: 4),
          Text(
            formatINR(signed ? value : value.abs(), compact: true, signed: signed),
            style: RunqText.tabular(size: 17, w: FontWeight.w700, color: color),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}

class _VDivider extends StatelessWidget {
  final Color color;
  const _VDivider({required this.color});
  @override
  Widget build(BuildContext context) =>
      Container(width: 0.5, height: 34, color: color, margin: const EdgeInsets.symmetric(horizontal: 12));
}

/// Grouped monthly bars: money in (green) vs money out (amber).
class InVsOutBars extends StatelessWidget {
  final List<MonthInOut> months;
  const InVsOutBars({super.key, required this.months});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    if (months.isEmpty) {
      return RunqCard(
        padding: const EdgeInsets.all(20),
        child: Text('No data for this period', style: RunqText.caption.copyWith(color: t.muted)),
      );
    }
    final maxV = months.fold<double>(0, (a, m) {
      final mv = m.moneyIn > m.moneyOut ? m.moneyIn : m.moneyOut;
      return a > mv ? a : mv;
    });
    final maxY = (maxV * 1.15).clamp(1.0, double.infinity);
    return RunqCard(
      padding: const EdgeInsets.fromLTRB(12, 14, 12, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            _LegendDot(color: statusInk(context, StatusTone.ok), label: 'In'),
            const SizedBox(width: 14),
            _LegendDot(color: statusInk(context, StatusTone.warn), label: 'Out'),
          ]),
          const SizedBox(height: 12),
          SizedBox(height: 150, child: BarChart(_data(context, maxY))),
        ],
      ),
    );
  }

  BarChartData _data(BuildContext context, double maxY) {
    final t = RT(context);
    return BarChartData(
      maxY: maxY,
      minY: 0,
      groupsSpace: 8,
      barGroups: [
        for (var i = 0; i < months.length; i++)
          BarChartGroupData(x: i, barsSpace: 3, barRods: [
            BarChartRodData(
              toY: months[i].moneyIn.clamp(0, double.infinity),
              color: statusInk(context, StatusTone.ok),
              width: 6,
              borderRadius: const BorderRadius.vertical(top: Radius.circular(3)),
            ),
            BarChartRodData(
              toY: months[i].moneyOut.clamp(0, double.infinity),
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
              return Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(monthLabel(months[i].month), style: RunqText.micro.copyWith(color: t.muted2)),
              );
            },
          ),
        ),
      ),
      barTouchData: BarTouchData(
        touchTooltipData: BarTouchTooltipData(
          getTooltipColor: (_) => t.ink,
          getTooltipItem: (g, _, rod, idx) => BarTooltipItem(
            '${monthLabel(months[g.x].month)}\n${idx == 0 ? 'In' : 'Out'} ${formatINR(rod.toY)}',
            RunqText.caption.copyWith(color: Colors.white, fontWeight: FontWeight.w600),
          ),
        ),
      ),
    );
  }
}

class _LegendDot extends StatelessWidget {
  final Color color;
  final String label;
  const _LegendDot({required this.color, required this.label});
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Container(width: 9, height: 9, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(2))),
      const SizedBox(width: 6),
      Text(label, style: RunqText.caption.copyWith(color: t.muted)),
    ]);
  }
}

/// Ranked category breakdown with amount + a proportional bar. Mirrors the
/// reports screen's category rows.
class ReportCategoryList extends StatelessWidget {
  final List<CategoryAmount> items;
  const ReportCategoryList({super.key, required this.items});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    if (items.isEmpty) {
      return RunqCard(
        padding: const EdgeInsets.all(20),
        child: Text('No data for this period', style: RunqText.caption.copyWith(color: t.muted)),
      );
    }
    return RunqCard(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      child: Column(
        children: [
          for (var i = 0; i < items.length; i++) ...[
            if (i > 0) const SizedBox(height: 12),
            _CategoryRow(item: items[i]),
          ],
        ],
      ),
    );
  }
}

class _CategoryRow extends StatelessWidget {
  final CategoryAmount item;
  const _CategoryRow({required this.item});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final pct = (item.percentage / 100).clamp(0.0, 1.0);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(children: [
          Expanded(
            child: Text(item.label,
                style: RunqText.body.copyWith(color: t.ink), maxLines: 1, overflow: TextOverflow.ellipsis),
          ),
          const SizedBox(width: 8),
          Text(formatINR(item.amount, compact: true),
              style: RunqText.tabular(size: 13, w: FontWeight.w700, color: t.ink)),
        ]),
        const SizedBox(height: 6),
        Row(children: [
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(2),
              child: Container(
                height: 4,
                color: t.bgWarmer,
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: FractionallySizedBox(widthFactor: pct, child: Container(color: t.brand)),
                ),
              ),
            ),
          ),
          const SizedBox(width: 8),
          SizedBox(
            width: 44,
            child: Text('${item.percentage.toStringAsFixed(item.percentage < 10 ? 1 : 0)}%',
                style: RunqText.tabular(size: 11, w: FontWeight.w500, color: t.muted2),
                textAlign: TextAlign.right),
          ),
        ]),
      ],
    );
  }
}
