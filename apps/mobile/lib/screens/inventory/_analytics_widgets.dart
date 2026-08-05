// Cards + charts for inventory_analytics_screen.dart. Split to stay under
// the 500-line-per-file rule. Included via `part of`.

part of 'inventory_analytics_screen.dart';

// ── Formatting ───────────────────────────────────────────────────────────

String _inr(double v) {
  final a = v.abs();
  if (a >= 10000000) return '₹${(v / 10000000).toStringAsFixed(2)}Cr';
  if (a >= 100000) return '₹${(v / 100000).toStringAsFixed(2)}L';
  if (a >= 1000) return '₹${(v / 1000).toStringAsFixed(1)}k';
  return '₹${v.round()}';
}

String _qty(double v) {
  if (v == v.truncateToDouble()) return v.toStringAsFixed(0);
  return v.toStringAsFixed(2).replaceFirst(RegExp(r'0+$'), '').replaceFirst(RegExp(r'\.$'), '');
}

/// Velocity ramp — one hue, light→dark, matching the web page exactly.
/// Orange, to sit with the inventory module accent. Ordered
/// [dead, slow, medium, fast]: a ranked scale, not four independent
/// identities, so it never borrows the status colours.
///
/// Single hue at OKLCH H52, validated as an ordinal ramp in both modes
/// (hue spread 2°). The Tailwind amber scale fails that check — it swings
/// 45° from yellow to brown and its light end is 1.44:1 on white.
const _velocityRamp = <Color>[
  Color(0xFFF99E65),
  Color(0xFFE37725),
  Color(0xFFBD5B00),
  Color(0xFF873D00),
];

/// Dark-mode steps: the same ramp flipped so "fast" stays the most
/// prominent against the dark surface.
const _velocityRampDark = <Color>[
  Color(0xFF873D00),
  Color(0xFFBD5B00),
  Color(0xFFE37725),
  Color(0xFFFFA56C),
];

/// The ramp for the active theme.
List<Color> _ramp(BuildContext context) =>
    Theme.of(context).brightness == Brightness.dark
        ? _velocityRampDark
        : _velocityRamp;
const _velocityOrder = ['dead', 'slow', 'medium', 'fast'];
const _velocityLabel = {
  'dead': 'Dead', 'slow': 'Slow', 'medium': 'Medium', 'fast': 'Fast',
};

// ── Scorecard ────────────────────────────────────────────────────────────

class _Scorecard extends StatelessWidget {
  final InvHealth health;
  const _Scorecard({required this.health});

  @override
  Widget build(BuildContext context) {
    final h = health;
    final deadTone = h.deadValuePct > 20
        ? InvColors.error
        : h.deadValuePct > 10
            ? InvColors.orangeAlert
            : null;
    return Column(
      children: [
        Row(
          children: [
            Expanded(
              child: _Stat(
                icon: Icons.inventory_2_outlined,
                label: 'STOCK VALUE',
                value: _inr(h.totalValue),
                sub: '${h.skuInStock} SKUs',
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _Stat(
                icon: Icons.autorenew_rounded,
                label: 'TURNOVER',
                value: h.turnover == null ? '—' : '${h.turnover!.toStringAsFixed(1)}×',
                sub: h.dataSpanDays < h.windowDays
                    ? 'from ${h.dataSpanDays}d history'
                    : h.daysOnHand == null
                        ? 'per year'
                        : '${h.daysOnHand!.round()}d on hand',
                tone: (h.turnover ?? 99) < 2 ? InvColors.orangeAlert : null,
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: _Stat(
                icon: Icons.ac_unit_rounded,
                label: 'DEAD STOCK',
                value: _inr(h.deadValue),
                sub: h.excessValue > 0
                    ? '+ ${_inr(h.excessValue)} excess'
                    : '${h.deadValuePct.round()}% · ${h.deadSkuCount} SKUs',
                tone: deadTone,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _Stat(
                icon: Icons.remove_shopping_cart_outlined,
                label: 'OUT OF STOCK',
                value: '${h.outOfStock}',
                sub: h.belowReorder > 0
                    ? '${h.belowReorder} below reorder'
                    : 'none below reorder',
                tone: h.outOfStock > 0 ? InvColors.error : InvColors.success,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _Stat extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final String sub;
  final Color? tone;
  const _Stat({
    required this.icon,
    required this.label,
    required this.value,
    required this.sub,
    this.tone,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final c = tone ?? t.ink;
    return InvCard(
      padding: const EdgeInsets.fromLTRB(12, 11, 12, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Icon(icon, size: 14, color: tone ?? InvColors.amber),
              const SizedBox(width: 5),
              Expanded(
                child: Text(label,
                    style: RunqText.micro.copyWith(color: t.muted, letterSpacing: 0.5),
                    maxLines: 1, overflow: TextOverflow.ellipsis),
              ),
            ],
          ),
          const SizedBox(height: 7),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(value,
                style: RunqText.h3.copyWith(color: c, fontWeight: FontWeight.w800)),
          ),
          const SizedBox(height: 3),
          Text(sub,
              style: RunqText.micro.copyWith(color: t.muted2),
              maxLines: 1, overflow: TextOverflow.ellipsis),
        ],
      ),
    );
  }
}

// ── Value trend ──────────────────────────────────────────────────────────

class _ValueTrendCard extends StatelessWidget {
  final List<InvTrendPoint> points;
  const _ValueTrendCard({required this.points});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    if (points.length < 2) {
      return const _EmptyCard(
        title: 'Stock value over time',
        message: 'Not enough movement yet to draw a trend.',
      );
    }
    final spots = <FlSpot>[
      for (var i = 0; i < points.length; i++)
        FlSpot(i.toDouble(), points[i].closingValue),
    ];
    final maxY = spots.map((s) => s.y).reduce((a, b) => a > b ? a : b);

    return InvCard(
      padding: const EdgeInsets.fromLTRB(14, 13, 14, 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Stock value over time',
              style: RunqText.bodyStrong.copyWith(color: t.ink)),
          const SizedBox(height: 2),
          Text('Closing value each week',
              style: RunqText.caption.copyWith(color: t.muted)),
          const SizedBox(height: 14),
          SizedBox(
            height: 150,
            child: LineChart(
              LineChartData(
                minY: 0,
                maxY: maxY <= 0 ? 1 : maxY * 1.15,
                gridData: FlGridData(
                  show: true,
                  drawVerticalLine: false,
                  getDrawingHorizontalLine: (_) =>
                      FlLine(color: t.hairline, strokeWidth: 1),
                ),
                borderData: FlBorderData(show: false),
                titlesData: FlTitlesData(
                  topTitles: const AxisTitles(),
                  rightTitles: const AxisTitles(),
                  leftTitles: AxisTitles(
                    sideTitles: SideTitles(
                      showTitles: true,
                      reservedSize: 46,
                      getTitlesWidget: (v, _) => Text(_inr(v),
                          style: RunqText.micro.copyWith(color: t.muted2)),
                    ),
                  ),
                  bottomTitles: const AxisTitles(),
                ),
                lineTouchData: LineTouchData(
                  touchTooltipData: LineTouchTooltipData(
                    getTooltipItems: (spots) => spots
                        .map((s) => LineTooltipItem(
                              _inr(s.y),
                              RunqText.caption.copyWith(
                                  color: Colors.white, fontWeight: FontWeight.w700),
                            ))
                        .toList(),
                  ),
                ),
                lineBarsData: [
                  LineChartBarData(
                    spots: spots,
                    isCurved: true,
                    curveSmoothness: 0.22,
                    color: _ramp(context)[2],
                    barWidth: 2,
                    dotData: const FlDotData(show: false),
                    belowBarData: BarAreaData(
                      show: true,
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          _ramp(context)[2].withValues(alpha: 0.28),
                          _ramp(context)[2].withValues(alpha: 0.02),
                        ],
                      ),
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
}

// ── Velocity mix ─────────────────────────────────────────────────────────

class _VelocityCard extends StatelessWidget {
  final List<InvSkuPerformance> rows;
  const _VelocityCard({required this.rows});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    if (rows.isEmpty) {
      return const _EmptyCard(
        title: 'Where your value sits',
        message: 'No stock movement recorded in this period.',
      );
    }
    final byBand = <String, double>{for (final b in _velocityOrder) b: 0};
    final counts = <String, int>{for (final b in _velocityOrder) b: 0};
    for (final r in rows) {
      byBand[r.velocity] = (byBand[r.velocity] ?? 0) + r.onHandValue;
      counts[r.velocity] = (counts[r.velocity] ?? 0) + 1;
    }
    final total = byBand.values.fold<double>(0, (s, v) => s + v);

    return InvCard(
      padding: const EdgeInsets.fromLTRB(14, 13, 14, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Where your value sits',
              style: RunqText.bodyStrong.copyWith(color: t.ink)),
          const SizedBox(height: 2),
          Text('Anything Slow or Dead is capital standing still',
              style: RunqText.caption.copyWith(color: t.muted)),
          const SizedBox(height: 14),
          // 100% composition bar — every segment is labelled below, so the
          // ramp reinforces the order rather than carrying it alone.
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: SizedBox(
              height: 14,
              child: Row(
                children: [
                  for (var i = 0; i < _velocityOrder.length; i++)
                    if ((byBand[_velocityOrder[i]] ?? 0) > 0)
                      Expanded(
                        flex: ((byBand[_velocityOrder[i]]! / (total == 0 ? 1 : total)) * 1000)
                            .round()
                            .clamp(1, 1000),
                        child: Container(color: _ramp(context)[i]),
                      ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          for (var i = _velocityOrder.length - 1; i >= 0; i--)
            Padding(
              padding: const EdgeInsets.only(bottom: 7),
              child: Row(
                children: [
                  Container(
                    width: 9, height: 9,
                    decoration: BoxDecoration(
                      color: _ramp(context)[i],
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(_velocityLabel[_velocityOrder[i]]!,
                        style: RunqText.caption.copyWith(color: t.ink)),
                  ),
                  Text('${counts[_velocityOrder[i]]} SKU',
                      style: RunqText.micro.copyWith(color: t.muted2)),
                  const SizedBox(width: 10),
                  SizedBox(
                    width: 66,
                    child: Text(
                      _inr(byBand[_velocityOrder[i]] ?? 0),
                      textAlign: TextAlign.right,
                      style: RunqText.caption.copyWith(
                          color: t.ink, fontWeight: FontWeight.w600),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

// ── Shared small pieces ──────────────────────────────────────────────────

class _FootNote extends StatelessWidget {
  final InvHealth health;
  const _FootNote({required this.health});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final short = health.dataSpanDays < health.windowDays;
    return Text(
      '${short ? 'Your ledger covers ${health.dataSpanDays} of the last ${health.windowDays} days, so rates are annualised from that shorter run. ' : ''}'
      'Consumption counts deliveries, production issues, adjustments and reclaims.',
      style: RunqText.micro.copyWith(color: t.muted2),
    );
  }
}

class _EmptyCard extends StatelessWidget {
  final String title;
  final String message;
  const _EmptyCard({required this.title, required this.message});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return InvCard(
      padding: const EdgeInsets.fromLTRB(14, 13, 14, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: RunqText.bodyStrong.copyWith(color: t.ink)),
          const SizedBox(height: 8),
          Text(message, style: RunqText.caption.copyWith(color: t.muted)),
        ],
      ),
    );
  }
}

class _ErrorCard extends StatelessWidget {
  final String message;
  const _ErrorCard({required this.message});

  @override
  Widget build(BuildContext context) {
    return InvCard(
      padding: const EdgeInsets.fromLTRB(14, 13, 14, 14),
      child: Row(
        children: [
          Icon(Icons.error_outline_rounded, size: 16, color: InvColors.error),
          const SizedBox(width: 8),
          Expanded(
            child: Text('Could not load analytics.\n$message',
                style: RunqText.caption.copyWith(color: InvColors.error)),
          ),
        ],
      ),
    );
  }
}

class _ScoreSkeleton extends StatelessWidget {
  const _ScoreSkeleton();

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    Widget box() => Expanded(
          child: Container(
            height: 84,
            decoration: BoxDecoration(
              color: t.surface,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: t.hairline),
            ),
          ),
        );
    return Column(
      children: [
        Row(children: [box(), const SizedBox(width: 10), box()]),
        const SizedBox(height: 10),
        Row(children: [box(), const SizedBox(width: 10), box()]),
      ],
    );
  }
}

class _ChartSkeleton extends StatelessWidget {
  final String label;
  const _ChartSkeleton({required this.label});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Container(
      height: 150,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: t.hairline),
      ),
      child: Text(label, style: RunqText.caption.copyWith(color: t.muted2)),
    );
  }
}
