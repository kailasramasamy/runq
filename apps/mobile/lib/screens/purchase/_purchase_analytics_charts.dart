// Charts for purchase_analytics_screen.dart: spend over time, top vendors,
// and the paid/unpaid split. Split out to stay under the 500-line rule.

part of 'purchase_analytics_screen.dart';

/// Spend over the window. Scrolls horizontally at five buckets per screen so
/// the value labels and dates stay legible; opens parked on the latest
/// buckets, since recent spend is what the user came for.
class _SpendTrendCard extends StatefulWidget {
  final List<PurchaseTrendPoint> points;
  final String grain;
  const _SpendTrendCard({required this.points, required this.grain});

  static const _visibleSlots = 5;
  static const _plotHeight = 168.0;
  static const _axisWidth = 46.0;

  @override
  State<_SpendTrendCard> createState() => _SpendTrendCardState();
}

class _SpendTrendCardState extends State<_SpendTrendCard> {
  final _scroll = ScrollController();

  @override
  void initState() {
    super.initState();
    _pinToLatest();
  }

  @override
  void didUpdateWidget(_SpendTrendCard old) {
    super.didUpdateWidget(old);
    if (old.points.length != widget.points.length ||
        old.points.lastOrNull?.bucket != widget.points.lastOrNull?.bucket) {
      _pinToLatest();
    }
  }

  void _pinToLatest() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_scroll.hasClients) return;
      _scroll.jumpTo(_scroll.position.maxScrollExtent);
    });
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  String get _grainWord => switch (widget.grain) {
        'month' => 'month',
        'week' => 'week',
        _ => 'day',
      };

  String _xLabel(DateTime d) =>
      widget.grain == 'month' ? listDayMon(d).split(' ').last : listDayMon(d);

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final points = widget.points;
    if (points.isEmpty) {
      return const _PurchaseSection(
          title: 'Spend', child: _PurchaseEmptyLine('Nothing billed in this period'));
    }
    final maxSpend = points.map((p) => p.spend).reduce((a, b) => a > b ? a : b);
    final maxY = maxSpend <= 0 ? 1.0 : maxSpend * 1.32;
    final scrolls = points.length > _SpendTrendCard._visibleSlots;

    return _PurchaseSection(
      title: 'Spend',
      caption: scrolls
          ? 'Billed per $_grainWord · latest ${_SpendTrendCard._visibleSlots} shown, scroll back for more'
          : 'Billed per $_grainWord',
      child: SizedBox(
        height: _SpendTrendCard._plotHeight,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: _SpendTrendCard._axisWidth,
              height: _SpendTrendCard._plotHeight,
              child: _PurchaseYAxis(maxY: maxY),
            ),
            Expanded(
              child: LayoutBuilder(
                builder: (context, constraints) {
                  final slot = constraints.maxWidth / _SpendTrendCard._visibleSlots;
                  return SingleChildScrollView(
                    controller: _scroll,
                    scrollDirection: Axis.horizontal,
                    physics: const BouncingScrollPhysics(),
                    child: SizedBox(
                      width: (points.length * slot).clamp(constraints.maxWidth, double.infinity),
                      height: _SpendTrendCard._plotHeight,
                      child: _SpendPlot(
                        points: points,
                        maxY: maxY,
                        brand: t.brand,
                        gridColor: t.hairline,
                        labelColor: t.muted2,
                        valueColor: t.ink,
                        xLabel: _xLabel,
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The value axis, drawn as its own chart so it stays outside the scroll view
/// and still lines up tick-for-tick with the plot beside it.
class _PurchaseYAxis extends StatelessWidget {
  const _PurchaseYAxis({required this.maxY});
  final double maxY;

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return LineChart(
      LineChartData(
        minY: 0,
        maxY: maxY,
        minX: 0,
        maxX: 1,
        gridData: const FlGridData(show: false),
        borderData: FlBorderData(show: false),
        lineTouchData: const LineTouchData(enabled: false),
        titlesData: FlTitlesData(
          topTitles: const AxisTitles(),
          rightTitles: const AxisTitles(),
          // Reserve the plot's label band so both share a baseline, but draw
          // nothing in it — the default builder prints a stray "0".
          bottomTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 26,
              getTitlesWidget: (_, _) => const SizedBox.shrink(),
            ),
          ),
          leftTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 44,
              getTitlesWidget: (v, meta) => v >= meta.max
                  ? const SizedBox.shrink()
                  : Padding(
                      padding: const EdgeInsets.only(right: 4),
                      child: Text(
                        formatChartINR(v),
                        textAlign: TextAlign.right,
                        style: RunqText.micro.copyWith(color: t.muted2),
                      ),
                    ),
            ),
          ),
        ),
        lineBarsData: const [],
      ),
    );
  }
}

/// The scrolling series: line, area fill, pinned value labels, dashed drop
/// lines and the date axis.
class _SpendPlot extends StatelessWidget {
  final List<PurchaseTrendPoint> points;
  final double maxY;
  final Color brand, gridColor, labelColor, valueColor;
  final String Function(DateTime) xLabel;
  const _SpendPlot({
    required this.points,
    required this.maxY,
    required this.brand,
    required this.gridColor,
    required this.labelColor,
    required this.valueColor,
    required this.xLabel,
  });

  @override
  Widget build(BuildContext context) {
    final spots = [
      for (var i = 0; i < points.length; i++)
        FlSpot(i.toDouble(), points[i].spend),
    ];
    final bar = LineChartBarData(
      spots: spots,
      isCurved: true,
      curveSmoothness: 0.22,
      color: brand,
      barWidth: 2,
      dotData: const FlDotData(show: true),
      showingIndicators: [for (var i = 0; i < spots.length; i++) i],
      belowBarData: BarAreaData(
        show: true,
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [brand.withValues(alpha: 0.22), brand.withValues(alpha: 0.02)],
        ),
      ),
    );

    return LineChart(
      LineChartData(
        minY: 0,
        maxY: maxY,
        minX: -0.5,
        maxX: points.length - 0.5,
        gridData: FlGridData(
          show: true,
          drawVerticalLine: false,
          getDrawingHorizontalLine: (_) => FlLine(color: gridColor, strokeWidth: 1),
        ),
        borderData: FlBorderData(show: false),
        titlesData: FlTitlesData(
          topTitles: const AxisTitles(),
          rightTitles: const AxisTitles(),
          leftTitles: const AxisTitles(),
          bottomTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 26,
              interval: 1,
              getTitlesWidget: (v, _) {
                final i = v.round();
                if (i < 0 || i >= points.length || (v - i).abs() > 0.01) {
                  return const SizedBox.shrink();
                }
                return Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(
                    xLabel(points[i].bucket),
                    style: RunqText.micro.copyWith(color: labelColor),
                    maxLines: 1,
                  ),
                );
              },
            ),
          ),
        ),
        showingTooltipIndicators: [
          for (var i = 0; i < spots.length; i++)
            ShowingTooltipIndicators([LineBarSpot(bar, 0, spots[i])]),
        ],
        lineTouchData: LineTouchData(
          enabled: true,
          handleBuiltInTouches: false,
          getTouchedSpotIndicator: (_, indexes) => indexes
              .map((_) => TouchedSpotIndicatorData(
                    FlLine(color: gridColor, strokeWidth: 1, dashArray: const [3, 3]),
                    FlDotData(
                      show: true,
                      getDotPainter: (spot, _, _, _) => FlDotCirclePainter(
                        radius: 2.5,
                        color: brand,
                        strokeWidth: 0,
                      ),
                    ),
                  ))
              .toList(),
          touchTooltipData: LineTouchTooltipData(
            getTooltipColor: (_) => Colors.transparent,
            tooltipPadding: EdgeInsets.zero,
            tooltipMargin: 6,
            fitInsideHorizontally: true,
            fitInsideVertically: true,
            getTooltipItems: (touched) => touched.map((s) {
              final p = points[s.x.round().clamp(0, points.length - 1)];
              return LineTooltipItem(
                formatChartINR(p.spend),
                RunqText.micro.copyWith(color: valueColor, fontWeight: FontWeight.w700),
              );
            }).toList(),
          ),
        ),
        lineBarsData: [bar],
      ),
    );
  }
}

/// Top vendors as horizontal bars — vendor names are long, so vertical bars
/// would need rotated labels nobody can read on a phone.
class _TopVendorsCard extends StatelessWidget {
  final List<PurchaseTopVendor> rows;
  const _TopVendorsCard({required this.rows});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    if (rows.isEmpty) {
      return const _PurchaseSection(
          title: 'Top vendors', child: _PurchaseEmptyLine('No vendors billed yet'));
    }
    final max = rows.first.spend;
    return _PurchaseSection(
      title: 'Top vendors',
      caption: 'Share of spend across the vendors listed',
      child: Column(
        children: [
          for (var i = 0; i < rows.length; i++) ...[
            if (i > 0) const SizedBox(height: 10),
            _VendorBar(row: rows[i], fraction: max > 0 ? rows[i].spend / max : 0),
          ],
          if (rows.length > 1 && rows.first.share >= 50) ...[
            const SizedBox(height: 10),
            _PurchaseInlineNote(
              '${rows.first.name} is ${rows.first.share.toStringAsFixed(0)}% of '
              'listed spend — single-supplier risk',
            ),
          ],
          if (rows.length == 8)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text('Top 8 shown',
                  style: RunqText.micro.copyWith(color: t.muted2)),
            ),
        ],
      ),
    );
  }
}

class _VendorBar extends StatelessWidget {
  final PurchaseTopVendor row;
  final double fraction;
  const _VendorBar({required this.row, required this.fraction});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(row.name,
                  style: RunqText.caption.copyWith(color: t.ink, fontWeight: FontWeight.w600),
                  maxLines: 1, overflow: TextOverflow.ellipsis),
            ),
            const SizedBox(width: 8),
            Text(formatINR(row.spend, compact: true),
                style: RunqText.tabular(size: 12, w: FontWeight.w700, color: t.ink)),
          ],
        ),
        const SizedBox(height: 4),
        Row(
          children: [
            Expanded(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(999),
                child: LinearProgressIndicator(
                  value: fraction.clamp(0.0, 1.0),
                  minHeight: 6,
                  backgroundColor: t.hairlineSoft,
                  valueColor: AlwaysStoppedAnimation(t.brand),
                ),
              ),
            ),
            const SizedBox(width: 8),
            SizedBox(
              width: 34,
              child: Text('${row.share.toStringAsFixed(0)}%',
                  textAlign: TextAlign.right,
                  style: RunqText.micro.copyWith(color: t.muted2)),
            ),
          ],
        ),
      ],
    );
  }
}

/// Where the window's bills stand today. Awaiting-match gets its own slice —
/// on the AP side that is a real work queue, not just an unpaid state.
class _PurchaseStatusCard extends StatelessWidget {
  final List<PurchaseStatusSlice> slices;
  const _PurchaseStatusCard({required this.slices});

  static const _order = ['paid', 'partially_paid', 'approved', 'matched', 'pending_match'];
  static const _labels = {
    'paid': 'Paid',
    'partially_paid': 'Part paid',
    'approved': 'Approved, unpaid',
    'matched': 'Matched',
    'pending_match': 'Awaiting match',
  };

  static Color _colorFor(String status, RunqTokens t) => switch (status) {
        'paid' => RunqColors.greenInk,
        'partially_paid' => RunqColors.amberInk,
        'pending_match' => RunqColors.redInk,
        'matched' => t.muted,
        _ => t.brand,
      };

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final ordered = [
      for (final key in _order) ...slices.where((s) => s.status == key),
      ...slices.where((s) => !_order.contains(s.status)),
    ];
    final total = ordered.fold<int>(0, (s, x) => s + x.count);
    if (total == 0) {
      return const _PurchaseSection(
          title: 'Bill status', child: _PurchaseEmptyLine('No bills in this period'));
    }
    return _PurchaseSection(
      title: 'Bill status',
      caption: 'Where this period\'s bills stand today',
      child: Row(
        children: [
          SizedBox(
            width: 110,
            height: 110,
            child: PieChart(
              PieChartData(
                sectionsSpace: 2,
                centerSpaceRadius: 32,
                startDegreeOffset: -90,
                sections: [
                  for (final s in ordered)
                    PieChartSectionData(
                      value: s.count.toDouble(),
                      color: _colorFor(s.status, t),
                      radius: 18,
                      showTitle: false,
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (final s in ordered) ...[
                  _PurchaseLegendRow(
                    color: _colorFor(s.status, t),
                    label: _labels[s.status] ?? s.status,
                    count: s.count,
                    amount: s.amount,
                  ),
                  if (s != ordered.last) const SizedBox(height: 8),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PurchaseLegendRow extends StatelessWidget {
  final Color color;
  final String label;
  final int count;
  final double amount;
  const _PurchaseLegendRow({
    required this.color,
    required this.label,
    required this.count,
    required this.amount,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Row(
      children: [
        Container(
          width: 8, height: 8,
          decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(2)),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text('$label · $count',
              style: RunqText.caption.copyWith(color: t.ink),
              maxLines: 1, overflow: TextOverflow.ellipsis),
        ),
        const SizedBox(width: 6),
        Text(formatINR(amount, compact: true),
            style: RunqText.tabular(size: 12, w: FontWeight.w600, color: t.muted)),
      ],
    );
  }
}
