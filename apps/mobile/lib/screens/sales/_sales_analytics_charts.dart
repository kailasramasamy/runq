// Charts for sales_analytics_screen.dart: revenue over time, top customers,
// and the paid/unpaid split. Split out to stay under the 500-line rule.

part of 'sales_analytics_screen.dart';

/// Revenue over the window. A filled line, one point per server-chosen
/// bucket, so the same widget reads correctly whether the grain is days,
/// weeks or months.
///
/// The plot scrolls horizontally at a fixed width per bucket rather than
/// squeezing a quarter of daily points into 300pt — at that density the value
/// labels collide and the dates are unreadable. The Y axis is drawn once,
/// outside the scroll view, so it stays put while the series moves.
class _RevenueTrendCard extends StatefulWidget {
  final List<SalesTrendPoint> points;
  final String grain;
  const _RevenueTrendCard({required this.points, required this.grain});

  /// Buckets visible without scrolling. The slot width is derived from this
  /// and the card width. Five rather than seven: at seven the value labels
  /// sit shoulder to shoulder and the dates start to collide.
  static const _visibleSlots = 5;
  static const _plotHeight = 168.0;
  static const _axisWidth = 46.0;

  @override
  State<_RevenueTrendCard> createState() => _RevenueTrendCardState();
}

class _RevenueTrendCardState extends State<_RevenueTrendCard> {
  final _scroll = ScrollController();

  @override
  void initState() {
    super.initState();
    _pinToLatest();
  }

  @override
  void didUpdateWidget(_RevenueTrendCard old) {
    super.didUpdateWidget(old);
    // A new range means a new series — go back to its latest buckets rather
    // than holding a scroll offset that meant something else.
    if (old.points.length != widget.points.length ||
        old.points.lastOrNull?.bucket != widget.points.lastOrNull?.bucket) {
      _pinToLatest();
    }
  }

  /// Park the viewport at the newest end once the plot has been laid out —
  /// recent trade is what the user came for; history is a scroll back.
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

  /// Kept short — a slot is only ~55pt wide once five fit on a phone, so
  /// month buckets show just the month and everything else "3 Aug".
  String _xLabel(DateTime d) =>
      widget.grain == 'month' ? listDayMon(d).split(' ').last : listDayMon(d);

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final points = widget.points;
    if (points.isEmpty) {
      return const _Section(title: 'Revenue', child: _EmptyLine('Nothing invoiced in this period'));
    }
    final maxRevenue = points.map((p) => p.revenue).reduce((a, b) => a > b ? a : b);
    // Headroom for the value labels sitting above the highest point.
    final maxY = maxRevenue <= 0 ? 1.0 : maxRevenue * 1.32;
    final scrolls = points.length > _RevenueTrendCard._visibleSlots;

    return _Section(
      title: 'Revenue',
      caption: scrolls
          ? 'Invoiced per $_grainWord · latest ${_RevenueTrendCard._visibleSlots} shown, scroll back for more'
          : 'Invoiced per $_grainWord',
      child: SizedBox(
        height: _RevenueTrendCard._plotHeight,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: _RevenueTrendCard._axisWidth,
              height: _RevenueTrendCard._plotHeight,
              child: _YAxis(maxY: maxY),
            ),
            Expanded(
              child: LayoutBuilder(
                builder: (context, constraints) {
                  final slot = constraints.maxWidth / _RevenueTrendCard._visibleSlots;
                  return SingleChildScrollView(
                    controller: _scroll,
                    scrollDirection: Axis.horizontal,
                    physics: const BouncingScrollPhysics(),
                    child: SizedBox(
                      // Never narrower than the viewport, or a short series
                      // would bunch up against the axis.
                      width: (points.length * slot).clamp(constraints.maxWidth, double.infinity),
                      height: _RevenueTrendCard._plotHeight,
                      child: _TrendPlot(
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

/// The value axis, drawn as its own chart so it can stay outside the scroll
/// view and still line up tick-for-tick with the plot beside it.
class _YAxis extends StatelessWidget {
  final double maxY;
  const _YAxis({required this.maxY});

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
        // Same reserved bottom band as the plot, so the two share a baseline.
        titlesData: FlTitlesData(
          topTitles: const AxisTitles(),
          rightTitles: const AxisTitles(),
          // Reserve the plot's label band so both share a baseline, but draw
          // nothing in it — the default builder printed a stray "0" under the
          // value axis.
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

/// The scrolling series: line, area fill, pinned value labels and the date
/// axis. Colours come in as plain values so the widget stays a pure painter.
class _TrendPlot extends StatelessWidget {
  final List<SalesTrendPoint> points;
  final double maxY;
  final Color brand, gridColor, labelColor, valueColor;
  final String Function(DateTime) xLabel;
  const _TrendPlot({
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
        FlSpot(i.toDouble(), points[i].revenue),
    ];
    final bar = LineChartBarData(
      spots: spots,
      isCurved: true,
      curveSmoothness: 0.22,
      color: brand,
      barWidth: 2,
      dotData: const FlDotData(show: true),
      // Every point gets its drop line to the date below it — see
      // getTouchedSpotIndicator for the stroke.
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
        // Half a slot of padding each side so the first and last labels are
        // not clipped by the plot edge.
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
        // Tooltips are pinned rather than touch-driven: they are the data
        // labels. Touch stays enabled so a tap still highlights a point.
        showingTooltipIndicators: [
          for (var i = 0; i < spots.length; i++)
            ShowingTooltipIndicators([LineBarSpot(bar, 0, spots[i])]),
        ],
        lineTouchData: LineTouchData(
          enabled: true,
          handleBuiltInTouches: false,
          // Dashed drop line from each point down to its date, so a value can
          // be traced to the day it belongs to without counting across.
          getTouchedSpotIndicator: (_, indexes) => indexes
              .map((_) => TouchedSpotIndicatorData(
                    FlLine(
                      color: gridColor,
                      strokeWidth: 1,
                      dashArray: const [3, 3],
                    ),
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
                formatChartINR(p.revenue),
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

/// Top customers as horizontal bars. Horizontal because customer names are
/// long — vertical bars would need rotated labels nobody can read on a phone.
class _TopCustomersCard extends StatelessWidget {
  final List<SalesTopCustomer> rows;
  const _TopCustomersCard({required this.rows});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    if (rows.isEmpty) {
      return const _Section(title: 'Top customers', child: _EmptyLine('No customers invoiced yet'));
    }
    final max = rows.first.revenue;
    return _Section(
      title: 'Top customers',
      caption: 'Share of revenue across the customers listed',
      child: Column(
        children: [
          for (var i = 0; i < rows.length; i++) ...[
            if (i > 0) const SizedBox(height: 10),
            _CustomerBar(row: rows[i], fraction: max > 0 ? rows[i].revenue / max : 0),
          ],
          const SizedBox(height: 4),
          if (rows.length > 1 && rows.first.share >= 50) ...[
            const SizedBox(height: 6),
            _InlineNote(
              '${rows.first.name} is ${rows.first.share.toStringAsFixed(0)}% of '
              'listed revenue — concentration risk',
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

class _CustomerBar extends StatelessWidget {
  final SalesTopCustomer row;
  final double fraction;
  const _CustomerBar({required this.row, required this.fraction});

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
            Text(formatINR(row.revenue, compact: true),
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

/// Where the window's invoices stand today — a donut of counts with the
/// amounts in the legend, since "how many are still unpaid" and "how much" are
/// different questions and both get asked.
class _StatusSplitCard extends StatelessWidget {
  final List<SalesStatusSlice> slices;
  const _StatusSplitCard({required this.slices});

  static const _order = ['paid', 'partially_paid', 'sent', 'overdue'];
  static const _labels = {
    'paid': 'Paid',
    'partially_paid': 'Part paid',
    'sent': 'Awaiting payment',
    'overdue': 'Overdue',
  };

  static Color _colorFor(String status, RunqTokens t) => switch (status) {
        'paid' => RunqColors.greenInk,
        'partially_paid' => RunqColors.amberInk,
        'overdue' => RunqColors.redInk,
        _ => t.brand,
      };

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final ordered = [
      for (final key in _order)
        ...slices.where((s) => s.status == key),
      ...slices.where((s) => !_order.contains(s.status)),
    ];
    final total = ordered.fold<int>(0, (s, x) => s + x.count);
    if (total == 0) {
      return const _Section(title: 'Payment status', child: _EmptyLine('No invoices in this period'));
    }
    return _Section(
      title: 'Payment status',
      caption: 'Where this period\'s invoices stand today',
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
                  _LegendRow(
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

class _LegendRow extends StatelessWidget {
  final Color color;
  final String label;
  final int count;
  final double amount;
  const _LegendRow({
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
