import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';
import '../../api/reports_models.dart';
import '../../theme/runq_tokens.dart';
import '../../theme/runq_theme.dart';
import '../../utils/format_inr.dart';

const _palette = <Color>[
  RunqColors.indigo,
  RunqColors.greenInk,
  RunqColors.amberInk,
  RunqColors.blueInk,
  RunqColors.purpleInk,
  RunqColors.accent,
];

class _Slice {
  final String label;
  final double amount, percentage;
  final Color color;
  _Slice(this.label, this.amount, this.percentage, this.color);
}

/// Donut of category share (top 6 + "Other") with a legend and a centred total.
class ReportDonut extends StatelessWidget {
  final List<CategoryAmount> items;
  final String caption;
  const ReportDonut({super.key, required this.items, required this.caption});

  List<_Slice> _slices() {
    final sorted = [...items]..sort((a, b) => b.amount.compareTo(a.amount));
    final top = sorted.take(6).toList();
    final rest = sorted.skip(6);
    final slices = <_Slice>[
      for (var i = 0; i < top.length; i++)
        _Slice(top[i].label, top[i].amount, top[i].percentage, _palette[i % _palette.length]),
    ];
    if (rest.isNotEmpty) {
      slices.add(_Slice(
        'Other',
        rest.fold<double>(0, (s, c) => s + c.amount),
        rest.fold<double>(0, (s, c) => s + c.percentage),
        RunqColors.grayInk,
      ));
    }
    return slices;
  }

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final slices = _slices();
    if (slices.isEmpty) {
      return Text('No data for this period', style: RunqText.caption.copyWith(color: t.muted));
    }
    final total = slices.fold<double>(0, (s, x) => s + x.amount);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        SizedBox(
          width: 120,
          height: 120,
          child: Stack(
            alignment: Alignment.center,
            children: [
              PieChart(PieChartData(
                sectionsSpace: 2,
                centerSpaceRadius: 34,
                startDegreeOffset: -90,
                sections: [
                  for (final s in slices)
                    PieChartSectionData(value: s.amount, color: s.color, radius: 18, showTitle: false),
                ],
              )),
              Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(caption, style: RunqText.micro.copyWith(color: t.muted2)),
                  Text(formatINR(total, compact: true),
                      style: RunqText.tabular(size: 14, w: FontWeight.w700, color: t.ink)),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (var i = 0; i < slices.length; i++) ...[
                if (i > 0) const SizedBox(height: 8),
                _LegendRow(slice: slices[i]),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _LegendRow extends StatelessWidget {
  final _Slice slice;
  const _LegendRow({required this.slice});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Row(
      children: [
        Container(
          width: 9,
          height: 9,
          decoration: BoxDecoration(color: slice.color, borderRadius: BorderRadius.circular(2)),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(slice.label,
              style: RunqText.caption.copyWith(color: t.ink),
              maxLines: 1, overflow: TextOverflow.ellipsis),
        ),
        const SizedBox(width: 6),
        Text('${slice.percentage.toStringAsFixed(slice.percentage < 10 ? 1 : 0)}%',
            style: RunqText.tabular(size: 11, w: FontWeight.w600, color: t.muted2)),
      ],
    );
  }
}
