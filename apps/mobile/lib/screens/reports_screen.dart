import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/reports_models.dart';
import '../providers/reports_providers.dart';
import '../theme/runq_theme.dart';
import '../theme/runq_tokens.dart';
import '../utils/format_inr.dart';
import '../widgets/async_slot.dart';
import '../widgets/runq_card.dart';
import '../widgets/section_head.dart';

enum _Period { thisMonth, lastMonth, quarter, fy }
enum _Tab { pnl, revenue, expenses }

final _periodProvider = StateProvider<_Period>((_) => _Period.thisMonth);
final _tabProvider = StateProvider<_Tab>((_) => _Tab.pnl);

DateRange _resolveRange(_Period p) {
  switch (p) {
    case _Period.thisMonth:
      return currentMonthRange();
    case _Period.lastMonth:
      return lastMonthRange();
    case _Period.quarter:
      return currentQuarterRange();
    case _Period.fy:
      return currentFyRange();
  }
}

String _periodLabel(_Period p) {
  switch (p) {
    case _Period.thisMonth:
      return 'This month';
    case _Period.lastMonth:
      return 'Last month';
    case _Period.quarter:
      return 'This quarter';
    case _Period.fy:
      return 'This FY';
  }
}

class ReportsScreen extends ConsumerWidget {
  const ReportsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final period = ref.watch(_periodProvider);
    final tab = ref.watch(_tabProvider);
    final range = _resolveRange(period);

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          color: RT(context).brand,
          onRefresh: () async {
            ref.invalidate(profitAndLossProvider(range));
            ref.invalidate(revenueAnalyticsProvider(range));
            ref.invalidate(expenseAnalyticsProvider(range));
            await ref.read(profitAndLossProvider(range).future).catchError((_) => throw 0);
          },
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
            slivers: [
              const SliverToBoxAdapter(child: _Header()),
              const SliverPadding(
                padding: EdgeInsets.fromLTRB(16, 0, 16, 12),
                sliver: SliverToBoxAdapter(child: _PeriodSwitcher()),
              ),
              const SliverPadding(
                padding: EdgeInsets.fromLTRB(16, 0, 16, 16),
                sliver: SliverToBoxAdapter(child: _TabSwitcher()),
              ),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 120),
                sliver: SliverToBoxAdapter(
                  child: switch (tab) {
                    _Tab.pnl => _ProfitAndLossPanel(range: range, period: period),
                    _Tab.revenue => _RevenuePanel(range: range),
                    _Tab.expenses => _ExpensePanel(range: range),
                  },
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
                Text('Performance', style: RunqText.body.copyWith(color: t.muted)),
                Text('Reports', style: RunqText.h2.copyWith(color: t.ink)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PeriodSwitcher extends ConsumerWidget {
  const _PeriodSwitcher();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final period = ref.watch(_periodProvider);
    return SizedBox(
      height: 36,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: _Period.values.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          final p = _Period.values[i];
          return _Pill(
            label: _periodLabel(p),
            active: period == p,
            onTap: () => ref.read(_periodProvider.notifier).state = p,
          );
        },
      ),
    );
  }
}

class _TabSwitcher extends ConsumerWidget {
  const _TabSwitcher();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tab = ref.watch(_tabProvider);
    final t = RT(context);
    return Container(
      height: 42,
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: t.bgWarmer,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: t.hairline, width: 0.5),
      ),
      child: Row(
        children: [
          for (final tt in _Tab.values)
            Expanded(
              child: _SegmentItem(
                label: switch (tt) {
                  _Tab.pnl => 'P&L',
                  _Tab.revenue => 'Revenue',
                  _Tab.expenses => 'Expenses',
                },
                active: tab == tt,
                onTap: () => ref.read(_tabProvider.notifier).state = tt,
              ),
            ),
        ],
      ),
    );
  }
}

class _SegmentItem extends StatelessWidget {
  final String label;
  final bool active;
  final VoidCallback onTap;
  const _SegmentItem({
    required this.label,
    required this.active,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: active ? t.surface : Colors.transparent,
            borderRadius: BorderRadius.circular(8),
            boxShadow: active ? RunqShadows.card : null,
          ),
          child: Text(
            label,
            style: RunqText.bodyStrong.copyWith(
              color: active ? t.ink : t.muted,
              fontSize: 13,
            ),
          ),
        ),
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  final String label;
  final bool active;
  final VoidCallback onTap;
  const _Pill({required this.label, required this.active, required this.onTap});

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
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            color: active ? t.brand : t.surface,
            border: Border.all(
              color: active ? t.brand : t.hairline,
              width: 0.5,
            ),
            borderRadius: BorderRadius.circular(999),
          ),
          alignment: Alignment.center,
          child: Text(
            label,
            style: RunqText.bodyStrong.copyWith(
              color: active ? Colors.white : t.ink,
              fontSize: 13,
            ),
          ),
        ),
      ),
    );
  }
}

// ───────────────────────────────────────────────────────── P&L panel

class _ProfitAndLossPanel extends ConsumerWidget {
  final DateRange range;
  final _Period period;
  const _ProfitAndLossPanel({required this.range, required this.period});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pnl = ref.watch(profitAndLossProvider(range));
    final prevRange = _previousPeriodRange(period);
    final prev = ref.watch(profitAndLossProvider(prevRange));

    return AsyncSlot<ProfitAndLoss>(
      value: pnl,
      onRetry: () => ref.invalidate(profitAndLossProvider(range)),
      data: (cur) {
        final prevNet = prev.maybeWhen(data: (p) => p.netProfit, orElse: () => 0.0);
        return Column(
          children: [
            _PnlHero(
              netProfit: cur.netProfit,
              previous: prev.hasValue ? prevNet : null,
              periodLabel: _periodLabel(period),
            ),
            const SizedBox(height: 16),
            const SectionHead(title: 'Breakdown'),
            RunqCard(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  _PnlRow(label: 'Revenue', amount: cur.totalRevenue, positive: true),
                  const SizedBox(height: 12),
                  _PnlRow(label: 'COGS', amount: -cur.totalCogs),
                  const SizedBox(height: 12),
                  _Divider(),
                  const SizedBox(height: 12),
                  _PnlRow(label: 'Gross profit', amount: cur.grossProfit, emphasize: true),
                  const SizedBox(height: 12),
                  _PnlRow(label: 'Operating expenses', amount: -cur.totalOperatingExpenses),
                  const SizedBox(height: 12),
                  _Divider(),
                  const SizedBox(height: 12),
                  _PnlRow(label: 'Operating profit', amount: cur.operatingProfit, emphasize: true),
                  const SizedBox(height: 12),
                  _Divider(),
                  const SizedBox(height: 12),
                  _PnlRow(label: 'Net profit', amount: cur.netProfit, emphasize: true, large: true),
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}

DateRange _previousPeriodRange(_Period p) {
  switch (p) {
    case _Period.thisMonth:
      return lastMonthRange();
    case _Period.lastMonth:
      final lm = lastMonthRange();
      final firstOfPrev = DateTime(lm.from.year, lm.from.month - 1, 1);
      final lastOfPrev = DateTime(lm.from.year, lm.from.month, 0);
      return DateRange(firstOfPrev, lastOfPrev);
    case _Period.quarter:
      final q = currentQuarterRange();
      final start = DateTime(q.from.year, q.from.month - 3, 1);
      final end = DateTime(q.from.year, q.from.month, 0);
      return DateRange(start, end);
    case _Period.fy:
      final fy = currentFyRange();
      return DateRange(
        DateTime(fy.from.year - 1, 4, 1),
        DateTime(fy.from.year, 3, 31),
      );
  }
}

class _PnlHero extends StatelessWidget {
  final double netProfit;
  final double? previous;
  final String periodLabel;
  const _PnlHero({
    required this.netProfit,
    required this.previous,
    required this.periodLabel,
  });

  @override
  Widget build(BuildContext context) {
    final positive = netProfit >= 0;
    final delta = previous == null ? null : (netProfit - previous!);
    final deltaPositive = (delta ?? 0) >= 0;
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
            'NET PROFIT · ${periodLabel.toUpperCase()}',
            style: RunqText.label.copyWith(
              color: Colors.white.withValues(alpha: 0.65),
              fontSize: 11,
            ),
          ),
          const SizedBox(height: 8),
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              if (!positive)
                Text('−',
                    style: RunqText.display.copyWith(
                        color: Colors.white, fontSize: 32, height: 1.05)),
              Text(
                formatINR(netProfit.abs()),
                style: RunqText.display.copyWith(
                    color: Colors.white, fontSize: 32, height: 1.05),
              ),
            ],
          ),
          if (delta != null) ...[
            const SizedBox(height: 10),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  deltaPositive
                      ? Icons.arrow_upward_rounded
                      : Icons.arrow_downward_rounded,
                  size: 14,
                  color: deltaPositive
                      ? const Color(0xFFA7F3D0)
                      : const Color(0xFFFCA5A5),
                ),
                const SizedBox(width: 4),
                Text(
                  '${deltaPositive ? '+' : '−'}${formatINR(delta.abs(), compact: true)} vs prev period',
                  style: RunqText.caption.copyWith(
                    color: Colors.white.withValues(alpha: 0.85),
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _PnlRow extends StatelessWidget {
  final String label;
  final double amount;
  final bool positive;
  final bool emphasize;
  final bool large;
  const _PnlRow({
    required this.label,
    required this.amount,
    this.positive = false,
    this.emphasize = false,
    this.large = false,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final color = amount >= 0 ? const Color(0xFF047857) : RunqColors.redInk;
    return Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: emphasize
                ? RunqText.bodyStrong
                    .copyWith(color: t.ink, fontSize: large ? 16 : 14)
                : RunqText.body.copyWith(color: t.muted, fontSize: 14),
          ),
        ),
        Text(
          amount >= 0
              ? formatINR(amount, compact: true)
              : '−${formatINR(amount.abs(), compact: true)}',
          style: RunqText.tabular(
            size: large ? 20 : (emphasize ? 16 : 14),
            w: emphasize ? FontWeight.w700 : FontWeight.w600,
            color: emphasize ? color : (positive ? color : t.ink),
          ),
        ),
      ],
    );
  }
}

// ───────────────────────────────────────────────────────── Revenue panel

class _RevenuePanel extends ConsumerWidget {
  final DateRange range;
  const _RevenuePanel({required this.range});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rev = ref.watch(revenueAnalyticsProvider(range));
    return AsyncSlot<RevenueAnalytics>(
      value: rev,
      onRetry: () => ref.invalidate(revenueAnalyticsProvider(range)),
      data: (r) => Column(
        children: [
          _AnalyticsHero(
            label: 'TOTAL REVENUE',
            total: r.total,
            accent: RunqColors.gstGradient,
            invertText: false,
          ),
          const SizedBox(height: 16),
          if (r.byMonth.length >= 2) ...[
            const SectionHead(title: 'Trend'),
            _MonthBars(months: r.byMonth, color: const Color(0xFF059669)),
            const SizedBox(height: 16),
          ],
          const SectionHead(title: 'Top customers'),
          _CategoryList(items: r.byCustomer.take(5).toList()),
        ],
      ),
    );
  }
}

// ───────────────────────────────────────────────────────── Expense panel

class _ExpensePanel extends ConsumerWidget {
  final DateRange range;
  const _ExpensePanel({required this.range});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final exp = ref.watch(expenseAnalyticsProvider(range));
    return AsyncSlot<ExpenseAnalytics>(
      value: exp,
      onRetry: () => ref.invalidate(expenseAnalyticsProvider(range)),
      data: (e) => Column(
        children: [
          _AnalyticsHero(
            label: 'TOTAL EXPENSES',
            total: e.total,
            accent: RunqColors.overdueGradient,
            invertText: true,
          ),
          const SizedBox(height: 16),
          if (e.byMonth.length >= 2) ...[
            const SectionHead(title: 'Trend'),
            _MonthBars(months: e.byMonth, color: const Color(0xFFB45309)),
            const SizedBox(height: 16),
          ],
          const SectionHead(title: 'Top categories'),
          _CategoryList(items: e.byCategory.take(5).toList()),
          const SizedBox(height: 16),
          if (e.byVendor.isNotEmpty) ...[
            const SectionHead(title: 'Top vendors'),
            _CategoryList(items: e.byVendor.take(5).toList()),
          ],
        ],
      ),
    );
  }
}

class _AnalyticsHero extends StatelessWidget {
  final String label;
  final double total;
  final LinearGradient accent;
  final bool invertText;
  const _AnalyticsHero({
    required this.label,
    required this.total,
    required this.accent,
    required this.invertText,
  });

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final ink = invertText ? const Color(0xFF92400E) : const Color(0xFF065F46);
    final muted = invertText
        ? const Color(0xFFB45309)
        : const Color(0xFF047857);
    return Container(
      decoration: BoxDecoration(
        gradient: accent,
        borderRadius: BorderRadius.circular(RunqRadii.hero),
        border: Border.all(color: t.hairline, width: 0.5),
        boxShadow: RunqShadows.card,
      ),
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              style: RunqText.label.copyWith(color: muted, fontSize: 11)),
          const SizedBox(height: 8),
          Text(
            formatINR(total),
            style: RunqText.display.copyWith(color: ink, fontSize: 32, height: 1.05),
          ),
        ],
      ),
    );
  }
}

class _MonthBars extends StatelessWidget {
  final List<MonthAmount> months;
  final Color color;
  const _MonthBars({required this.months, required this.color});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    final maxV = months.map((m) => m.amount).fold<double>(0, (a, b) => a > b ? a : b);
    final maxY = (maxV * 1.15).clamp(1.0, double.infinity);
    final spots = <BarChartGroupData>[];
    for (var i = 0; i < months.length; i++) {
      spots.add(BarChartGroupData(
        x: i,
        barRods: [
          BarChartRodData(
            toY: months[i].amount.clamp(0, double.infinity),
            color: color,
            width: 16,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(4)),
          ),
        ],
      ));
    }
    return RunqCard(
      padding: const EdgeInsets.fromLTRB(12, 18, 12, 12),
      child: SizedBox(
        height: 160,
        child: BarChart(
          BarChartData(
            maxY: maxY,
            minY: 0,
            barGroups: spots,
            gridData: FlGridData(
              show: true,
              drawVerticalLine: false,
              horizontalInterval: maxY / 3,
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
                  reservedSize: 44,
                  interval: maxY / 3,
                  getTitlesWidget: (v, _) => Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: Text(formatINR(v, compact: true),
                        style: RunqText.caption.copyWith(
                            color: t.muted2, fontSize: 10)),
                  ),
                ),
              ),
              bottomTitles: AxisTitles(
                sideTitles: SideTitles(
                  showTitles: true,
                  reservedSize: 22,
                  getTitlesWidget: (v, _) {
                    final idx = v.toInt();
                    if (idx < 0 || idx >= months.length) {
                      return const SizedBox.shrink();
                    }
                    final m = months[idx].month;
                    final short = m.length >= 3 ? m.substring(m.length - 3) : m;
                    return Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Text(short,
                          style: RunqText.caption
                              .copyWith(color: t.muted2, fontSize: 10)),
                    );
                  },
                ),
              ),
            ),
            barTouchData: BarTouchData(
              touchTooltipData: BarTouchTooltipData(
                getTooltipColor: (_) => t.ink,
                getTooltipItem: (group, _, rod, __) => BarTooltipItem(
                  '${months[group.x].month}\n${formatINR(rod.toY)}',
                  RunqText.caption.copyWith(
                    color: Colors.white,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _CategoryList extends StatelessWidget {
  final List<CategoryAmount> items;
  const _CategoryList({required this.items});

  @override
  Widget build(BuildContext context) {
    final t = RT(context);
    if (items.isEmpty) {
      return RunqCard(
        padding: const EdgeInsets.all(20),
        child: Text('No data for this period',
            style: RunqText.caption.copyWith(color: t.muted)),
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
        Row(
          children: [
            Expanded(
              child: Text(
                item.label,
                style: RunqText.bodyStrong.copyWith(color: t.ink, fontSize: 13),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const SizedBox(width: 8),
            Text(
              formatINR(item.amount, compact: true),
              style: RunqText.tabular(size: 13, w: FontWeight.w700, color: t.ink),
            ),
          ],
        ),
        const SizedBox(height: 6),
        Row(
          children: [
            Expanded(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(2),
                child: Container(
                  height: 4,
                  color: t.bgWarmer,
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: FractionallySizedBox(
                      widthFactor: pct,
                      child: Container(color: t.brand),
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            SizedBox(
              width: 44,
              child: Text(
                '${item.percentage.toStringAsFixed(item.percentage < 10 ? 1 : 0)}%',
                style: RunqText.caption.copyWith(color: t.muted2, fontSize: 11),
                textAlign: TextAlign.right,
              ),
            ),
          ],
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
