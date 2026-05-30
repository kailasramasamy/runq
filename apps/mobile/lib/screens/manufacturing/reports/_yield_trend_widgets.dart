// Chart + table widgets for yield_trend_screen.dart. Split to stay under
// the 500-line-per-file rule. Included via `part of`.

part of 'yield_trend_screen.dart';

// ── Line chart ────────────────────────────────────────────────────────────

class _YieldChart extends StatelessWidget {
  final List<YieldTrendPoint> points;
  const _YieldChart({required this.points});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final brand = MfgColors.brand(context);

    final spots = <FlSpot>[];
    for (var i = 0; i < points.length; i++) {
      final pct = points[i].yieldPct;
      if (pct != null) spots.add(FlSpot(i.toDouble(), pct));
    }
    if (spots.isEmpty) return const SizedBox.shrink();

    final maxY = (spots.map((s) => s.y).reduce((a, b) => a > b ? a : b) + 10)
        .clamp(0.0, 150.0);
    final minY = (spots.map((s) => s.y).reduce((a, b) => a < b ? a : b) - 10)
        .clamp(0.0, 100.0);

    return MfgCard(
      padding: const EdgeInsets.fromLTRB(12, 14, 16, 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Yield %', style: RunqText.bodyStrong.copyWith(color: t.ink)),
          const SizedBox(height: 12),
          SizedBox(
            height: 180,
            child: LineChart(
              LineChartData(
                minY: minY,
                maxY: maxY,
                gridData: FlGridData(
                  show: true,
                  drawVerticalLine: false,
                  getDrawingHorizontalLine: (_) => FlLine(
                    color: t.hairline,
                    strokeWidth: 1,
                  ),
                ),
                borderData: FlBorderData(show: false),
                titlesData: FlTitlesData(
                  leftTitles: AxisTitles(
                    sideTitles: SideTitles(
                      showTitles: true,
                      reservedSize: 36,
                      getTitlesWidget: (v, _) => Text(
                        '${v.toInt()}%',
                        style: RunqText.micro.copyWith(color: t.muted2),
                      ),
                    ),
                  ),
                  rightTitles: const AxisTitles(
                    sideTitles: SideTitles(showTitles: false),
                  ),
                  topTitles: const AxisTitles(
                    sideTitles: SideTitles(showTitles: false),
                  ),
                  bottomTitles: AxisTitles(
                    sideTitles: SideTitles(
                      showTitles: true,
                      reservedSize: 22,
                      interval: _labelInterval(points.length),
                      getTitlesWidget: (v, _) {
                        final idx = v.round();
                        if (idx < 0 || idx >= points.length) {
                          return const SizedBox.shrink();
                        }
                        return Text(
                          _shortDate(points[idx].bucketDate),
                          style: RunqText.micro.copyWith(color: t.muted2),
                        );
                      },
                    ),
                  ),
                ),
                lineBarsData: [
                  LineChartBarData(
                    spots: spots,
                    isCurved: true,
                    color: brand,
                    barWidth: 2.5,
                    dotData: FlDotData(
                      show: spots.length <= 12,
                      getDotPainter: (spot, pct, bar, idx) =>
                          FlDotCirclePainter(
                        radius: 3,
                        color: brand,
                        strokeWidth: 1.5,
                        strokeColor: t.surface,
                      ),
                    ),
                    belowBarData: BarAreaData(
                      show: true,
                      color: brand.withValues(alpha: 0.08),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  static double _labelInterval(int count) {
    if (count <= 7) return 1;
    if (count <= 14) return 2;
    if (count <= 30) return 5;
    return (count / 6).ceilToDouble();
  }

  static String _shortDate(String iso) {
    if (iso.length < 10) return iso;
    final parts = iso.split('-');
    if (parts.length < 3) return iso;
    const months = ['Jan','Feb','Mar','Apr','May','Jun',
                    'Jul','Aug','Sep','Oct','Nov','Dec'];
    final m = int.tryParse(parts[1]) ?? 0;
    final label = m > 0 && m <= 12 ? months[m - 1] : parts[1];
    return '${parts[2].replaceFirst(RegExp('^0'), '')} $label';
  }
}

// ── Data table ────────────────────────────────────────────────────────────

class _TrendTable extends StatelessWidget {
  final List<YieldTrendPoint> points;
  const _TrendTable({required this.points});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return MfgCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          _TableHeader(),
          Divider(height: 1, color: t.hairline),
          for (var i = 0; i < points.length; i++) ...[
            _TableRow(point: points[i], shade: i.isOdd),
            if (i < points.length - 1) Divider(height: 1, color: t.hairline),
          ],
        ],
      ),
    );
  }
}

class _TableHeader extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
      child: Row(
        children: [
          Expanded(
            flex: 3,
            child: Text('Date', style: RunqText.label.copyWith(color: t.muted2)),
          ),
          Expanded(
            child: Text('Runs',
                style: RunqText.label.copyWith(color: t.muted2),
                textAlign: TextAlign.right),
          ),
          Expanded(
            child: Text('Planned',
                style: RunqText.label.copyWith(color: t.muted2),
                textAlign: TextAlign.right),
          ),
          Expanded(
            child: Text('Actual',
                style: RunqText.label.copyWith(color: t.muted2),
                textAlign: TextAlign.right),
          ),
          Expanded(
            child: Text('Yield%',
                style: RunqText.label.copyWith(color: t.muted2),
                textAlign: TextAlign.right),
          ),
        ],
      ),
    );
  }
}

class _TableRow extends StatelessWidget {
  final YieldTrendPoint point;
  final bool shade;
  const _TableRow({required this.point, required this.shade});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final yieldPct = point.yieldPct;
    final isLow = yieldPct != null && yieldPct < 90;

    return Container(
      color: shade ? t.bgWarm.withValues(alpha: 0.5) : null,
      padding: const EdgeInsets.fromLTRB(12, 7, 12, 7),
      child: Row(
        children: [
          Expanded(
            flex: 3,
            child: Text(
              _prettyDate(point.bucketDate),
              style: RunqText.caption.copyWith(color: t.ink),
            ),
          ),
          Expanded(
            child: Text(
              '${point.runs}',
              style: RunqText.caption.copyWith(color: t.muted),
              textAlign: TextAlign.right,
            ),
          ),
          Expanded(
            child: Text(
              point.plannedQty.toStringAsFixed(1),
              style: RunqText.caption.copyWith(color: t.muted),
              textAlign: TextAlign.right,
            ),
          ),
          Expanded(
            child: Text(
              point.actualOutputQty.toStringAsFixed(1),
              style: RunqText.caption.copyWith(color: t.muted),
              textAlign: TextAlign.right,
            ),
          ),
          Expanded(
            child: Text(
              yieldPct == null ? '—' : '${yieldPct.toStringAsFixed(1)}%',
              style: RunqText.caption.copyWith(
                color: isLow ? MfgColors.error : t.ink,
                fontWeight: FontWeight.w600,
              ),
              textAlign: TextAlign.right,
            ),
          ),
        ],
      ),
    );
  }

  static String _prettyDate(String iso) {
    if (iso.length < 10) return iso;
    final parts = iso.split('-');
    if (parts.length < 3) return iso;
    const months = ['Jan','Feb','Mar','Apr','May','Jun',
                    'Jul','Aug','Sep','Oct','Nov','Dec'];
    final m = int.tryParse(parts[1]) ?? 0;
    final label = m > 0 && m <= 12 ? months[m - 1] : parts[1];
    return '${parts[2].replaceFirst(RegExp('^0'), '')} $label';
  }
}

// ── Loading skeleton ──────────────────────────────────────────────────────

class _TrendSkeleton extends StatelessWidget {
  const _TrendSkeleton();

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 100),
      children: [
        Container(
          height: 210,
          decoration: BoxDecoration(
            color: t.surface,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: t.hairline),
          ),
        ),
        const SizedBox(height: 12),
        Container(
          height: 200,
          decoration: BoxDecoration(
            color: t.surface,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: t.hairline),
          ),
        ),
      ],
    );
  }
}
