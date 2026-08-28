import 'dart:math' as math;

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../api/reports_models.dart';
import '../providers/reports_providers.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import '../utils/format_inr.dart';
import '../widgets/async_slot.dart';
import '../widgets/runq_card.dart';
import '../widgets/section_head.dart';

final _horizonProvider = StateProvider<int>((_) => 90);

class CashFlowScreen extends ConsumerWidget {
  const CashFlowScreen({super.key});

  Future<void> _refresh(WidgetRef ref) async {
    final h = ref.read(_horizonProvider);
    ref.invalidate(cashFlowForecastProvider(h));
    await ref.read(cashFlowForecastProvider(h).future).catchError((_) => throw 0);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final horizon = ref.watch(_horizonProvider);
    final forecast = ref.watch(cashFlowForecastProvider(horizon));
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final past90 = DateRange(today.subtract(const Duration(days: 90)), today);
    final statement = ref.watch(cashFlowStatementProvider(past90));

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          color: RT(context).brand,
          onRefresh: () => _refresh(ref),
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
            slivers: [
              const SliverToBoxAdapter(child: _Header()),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                sliver: SliverToBoxAdapter(
                  child: AsyncSlot<CashFlowForecast>(
                    value: forecast,
                    onRetry: () =>
                        ref.invalidate(cashFlowForecastProvider(horizon)),
                    data: (f) => _ForecastHero(forecast: f, horizon: horizon),
                  ),
                ),
              ),
              const SliverToBoxAdapter(child: _HorizonSelector()),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                sliver: SliverToBoxAdapter(
                  child: AsyncSlot<CashFlowForecast>(
                    value: forecast,
                    onRetry: () =>
                        ref.invalidate(cashFlowForecastProvider(horizon)),
                    data: (f) => _ForecastChart(
                      projections: f.projections,
                      currentBalance: f.currentBalance,
                    ),
                  ),
                ),
              ),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 24, 16, 0),
                sliver: SliverToBoxAdapter(
                  child: SectionHead(
                    title: 'Last 90 days',
                    action: 'Banking →',
                    onAction: () => context.push('/money/banking'),
                  ),
                ),
              ),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 120),
                sliver: SliverToBoxAdapter(
                  child: AsyncSlot<CashFlowStatement>(
                    value: statement,
                    onRetry: () =>
                        ref.invalidate(cashFlowStatementProvider(past90)),
                    data: (s) => _CashFlowBreakdown(statement: s),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header();

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 12, 16, 16),
      child: Row(
        children: [
          IconButton(
            onPressed: () => Navigator.of(context).pop(),
            icon: Icon(Icons.arrow_back_rounded, color: t.ink),
          ),
          const SizedBox(width: 4),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('Forecast', style: RunqText.body.copyWith(color: t.muted)),
                Text('Cash flow', style: RunqText.h2.copyWith(color: t.ink)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ForecastHero extends StatelessWidget {
  final CashFlowForecast forecast;
  final int horizon;
  const _ForecastHero({required this.forecast, required this.horizon});

  double _projectedAt(int h) {
    switch (h) {
      case 30:
        return forecast.projectedBalance30d;
      case 60:
        return forecast.projectedBalance60d;
      default:
        return forecast.projectedBalance90d;
    }
  }

  @override
  Widget build(BuildContext context) {
    final projected = _projectedAt(horizon);
    final delta = projected - forecast.currentBalance;
    final positive = delta >= 0;

    return Container(
      decoration: BoxDecoration(
        gradient: RunqColors.heroGradient,
        borderRadius: BorderRadius.circular(RunqRadii.hero),
        boxShadow: const [
          BoxShadow(color: Color(0x331E1B4B), blurRadius: 24, offset: Offset(0, 8)),
        ],
      ),
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'TODAY',
            style: RunqText.label.copyWith(
              color: Colors.white.withValues(alpha: 0.65),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            formatINR(forecast.currentBalance),
            style: RunqText.display
                .copyWith(color: Colors.white, height: 1.05),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: _HeroStat(
                  label: 'In $horizon days',
                  value: formatINR(projected, compact: true),
                  caption: '${positive ? '+' : '−'}${formatINR(delta.abs(), compact: true)}',
                  accent: positive ? const Color(0xFFA7F3D0) : const Color(0xFFFCA5A5),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _HeroStat(
                  label: 'Daily run-rate',
                  value: formatINR((delta / horizon).abs(), compact: true),
                  caption: positive ? 'building cash' : 'burning cash',
                  accent: positive
                      ? const Color(0xFFA7F3D0)
                      : const Color(0xFFFCD34D),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _HeroStat extends StatelessWidget {
  final String label, value, caption;
  final Color accent;
  const _HeroStat({
    required this.label,
    required this.value,
    required this.caption,
    required this.accent,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label,
              style: RunqText.caption.copyWith(
                color: Colors.white.withValues(alpha: 0.7),
              )),
          const SizedBox(height: 4),
          Text(value,
              style: RunqText.tabular(
                  size: 18, w: FontWeight.w700, color: Colors.white)),
          const SizedBox(height: 2),
          Text(caption,
              style: RunqText.caption.copyWith(color: accent),
              maxLines: 1,
              overflow: TextOverflow.ellipsis),
        ],
      ),
    );
  }
}

class _HorizonSelector extends ConsumerWidget {
  const _HorizonSelector();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final horizon = ref.watch(_horizonProvider);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
      child: Row(
        children: [
          for (final h in const [30, 60, 90])
            Expanded(
              child: Padding(
                padding: EdgeInsets.only(right: h == 90 ? 0 : 8),
                child: _HorizonPill(
                  label: '$h days',
                  active: horizon == h,
                  onTap: () =>
                      ref.read(_horizonProvider.notifier).state = h,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _HorizonPill extends StatelessWidget {
  final String label;
  final bool active;
  final VoidCallback onTap;
  const _HorizonPill({
    required this.label,
    required this.active,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Container(
          height: 38,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: active ? RunqColors.indigo : t.surface,
            border: Border.all(
              color: active ? RunqColors.indigo : t.hairline,
              width: 0.5,
            ),
            borderRadius: BorderRadius.circular(999),
          ),
          child: Text(
            label,
            style: RunqText.body.copyWith(
              color: active ? Colors.white : t.ink,
            ),
          ),
        ),
      ),
    );
  }
}

class _ForecastChart extends StatelessWidget {
  final List<CashFlowProjection> projections;
  final double currentBalance;
  const _ForecastChart({required this.projections, required this.currentBalance});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    if (projections.isEmpty) {
      return RunqCard(
        child: SizedBox(
          height: 180,
          child: Center(
            child: Text('No projection data',
                style: RunqText.caption.copyWith(color: t.muted)),
          ),
        ),
      );
    }
    final rawMaxDay = projections.last.day.toDouble();
    final maxDay = rawMaxDay > 0 ? rawMaxDay : 1.0;
    final values = projections.map((p) => p.projectedBalance).toList();
    // The axis is snapped to round values so every label is a number worth
    // reading and each one sits exactly on its grid line. Deriving the bounds
    // from the data and dividing by three put the labels on arbitrary values
    // like ₹4.87L, whose varying width read as a ragged, misaligned column.
    final axis = _Axis.forValues(values);
    final spots = projections
        .map((p) => FlSpot(p.day.toDouble(), p.projectedBalance))
        .toList();
    final endsPositive =
        projections.last.projectedBalance >= currentBalance;
    final strokeColor =
        endsPositive ? const Color(0xFF059669) : const Color(0xFFB91C1C);
    final fillColor = strokeColor.withValues(alpha: 0.12);

    return RunqCard(
      padding: const EdgeInsets.fromLTRB(16, 18, 16, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Projected balance',
              style: RunqText.label.copyWith(
                color: t.muted2,
              )),
          const SizedBox(height: 12),
          SizedBox(
            height: 160,
            child: LineChart(
              LineChartData(
                minX: 0,
                maxX: maxDay,
                minY: axis.min,
                maxY: axis.max,
                gridData: FlGridData(
                  show: true,
                  drawVerticalLine: false,
                  horizontalInterval: axis.interval,
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
                      reservedSize: _Axis.labelWidth,
                      interval: axis.interval,
                      // Right-aligned in a fixed box so the labels form a
                      // straight column against the plot edge instead of each
                      // one centring on its own width.
                      getTitlesWidget: (v, _) => Container(
                        width: _Axis.labelWidth,
                        padding: const EdgeInsets.only(right: 8),
                        alignment: Alignment.centerRight,
                        child: Text(
                          formatChartINR(v),
                          maxLines: 1,
                          style: RunqText.tabular(size: 10, w: FontWeight.w500, color: t.muted2),
                        ),
                      ),
                    ),
                  ),
                  bottomTitles: AxisTitles(
                    sideTitles: SideTitles(
                      showTitles: true,
                      reservedSize: 22,
                      interval: maxDay / 3,
                      getTitlesWidget: (v, _) {
                        if (v == 0) {
                          return Padding(
                            padding: const EdgeInsets.only(top: 6),
                            child: Text('today',
                                style: RunqText.micro.copyWith(color: t.muted2)),
                          );
                        }
                        return Padding(
                          padding: const EdgeInsets.only(top: 6),
                          child: Text('+${v.toInt()}d',
                              style: RunqText.micro.copyWith(color: t.muted2)),
                        );
                      },
                    ),
                  ),
                ),
                lineTouchData: LineTouchData(
                  touchTooltipData: LineTouchTooltipData(
                    getTooltipColor: (_) => t.ink,
                    getTooltipItems: (spots) => spots
                        .map((s) => LineTooltipItem(
                              '${s.x.toInt() == 0 ? 'today' : '+${s.x.toInt()}d'}\n${formatINR(s.y)}',
                              RunqText.caption.copyWith(
                                color: Colors.white,
                                fontWeight: FontWeight.w600,
                              ),
                            ))
                        .toList(),
                  ),
                ),
                lineBarsData: [
                  LineChartBarData(
                    spots: spots,
                    isCurved: true,
                    curveSmoothness: 0.18,
                    color: strokeColor,
                    barWidth: 2.5,
                    dotData: const FlDotData(show: false),
                    belowBarData: BarAreaData(
                      show: true,
                      color: fillColor,
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

class _CashFlowBreakdown extends StatelessWidget {
  final CashFlowStatement statement;
  const _CashFlowBreakdown({required this.statement});

  @override
  Widget build(BuildContext context) {
    return RunqCard(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          _BreakdownRow(
            label: 'Operating',
            amount: statement.totalOperating,
            description: 'core business activity',
          ),
          const SizedBox(height: 14),
          _BreakdownRow(
            label: 'Investing',
            amount: statement.totalInvesting,
            description: 'asset purchases & sales',
          ),
          const SizedBox(height: 14),
          _BreakdownRow(
            label: 'Financing',
            amount: statement.totalFinancing,
            description: 'loans & equity',
          ),
          const SizedBox(height: 16),
          _Divider(),
          const SizedBox(height: 14),
          _BreakdownRow(
            label: 'Net change',
            amount: statement.netChange,
            description: 'period total',
            emphasize: true,
          ),
        ],
      ),
    );
  }
}

class _BreakdownRow extends StatelessWidget {
  final String label, description;
  final double amount;
  final bool emphasize;
  const _BreakdownRow({
    required this.label,
    required this.description,
    required this.amount,
    this.emphasize = false,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final positive = amount >= 0;
    final color = positive ? const Color(0xFF047857) : RunqColors.redInk;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(label,
                  style: emphasize
                      ? RunqText.h4.copyWith(color: t.ink)
                      : RunqText.bodyStrong.copyWith(color: t.ink)),
              const SizedBox(height: 2),
              Text(description,
                  style: RunqText.caption.copyWith(color: t.muted)),
            ],
          ),
        ),
        Text(
          '${positive ? '+' : '−'}${formatINR(amount.abs(), compact: true)}',
          style: RunqText.tabular(
            size: emphasize ? 17 : 15,
            w: FontWeight.w700,
            color: color,
          ),
        ),
      ],
    );
  }
}

class _Divider extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(height: 0.5, color: RT(context).hairline);
  }
}

/// A y-axis snapped to round numbers.
///
/// [interval] is a 1/2/2.5/5 × 10ⁿ step, and [min]/[max] are the data range
/// widened to whole multiples of it — so ticks land on values like ₹5L rather
/// than ₹4.87L, and every label sits on a grid line.
class _Axis {
  final double min, max, interval;
  const _Axis(this.min, this.max, this.interval);

  /// Wide enough for "−₹12.3Cr" at 10pt, and fixed so the column is straight.
  static const labelWidth = 56.0;

  static const _targetTicks = 4;

  factory _Axis.forValues(List<double> values) {
    var lo = values.reduce((a, b) => a < b ? a : b);
    var hi = values.reduce((a, b) => a > b ? a : b);
    if (hi - lo < 1) {
      // A flat forecast still needs a band to draw in, or the line sits on the
      // frame and the axis repeats one number.
      final pad = (hi.abs() * 0.1).clamp(1.0, double.infinity);
      lo -= pad;
      hi += pad;
    }
    final interval = _niceStep((hi - lo) / _targetTicks);
    return _Axis(
      (lo / interval).floorToDouble() * interval,
      (hi / interval).ceilToDouble() * interval,
      interval,
    );
  }

  /// Rounds up to the next 1, 2, 2.5 or 5 times a power of ten.
  static double _niceStep(double raw) {
    if (raw <= 0) return 1;
    final mag = math.pow(10, (math.log(raw) / math.ln10).floor()).toDouble();
    final norm = raw / mag;
    final step = norm <= 1 ? 1.0 : (norm <= 2 ? 2.0 : (norm <= 2.5 ? 2.5 : (norm <= 5 ? 5.0 : 10.0)));
    return step * mag;
  }
}
