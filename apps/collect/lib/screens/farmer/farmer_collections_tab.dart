import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../providers/farmer_providers.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_charts.dart';
import '../../widgets/dhenu_states.dart';
import '../../widgets/quality_badge.dart';
import 'farmer_collection_detail.dart';

/// Collections tab — current-cycle pours, chart overview + day rows (spec §6.2 redesign).
class FarmerCollectionsTab extends ConsumerWidget {
  const FarmerCollectionsTab({super.key});

  Future<void> _refresh(WidgetRef ref) async {
    ref.invalidate(cycleConfigProvider);
    ref.invalidate(farmerCyclePeriodsProvider);
    ref.invalidate(farmerCyclePoursProvider);
    await ref.read(farmerCurrentCyclePoursProvider.future);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final poursAsync = ref.watch(farmerCurrentCyclePoursProvider);
    final periods = ref.watch(farmerCyclePeriodsProvider).asData?.value ?? const <MpCyclePeriod>[];
    final period = periods.isEmpty ? null : periods.first;
    final past = periods.length > 1 ? periods.sublist(1) : const <MpCyclePeriod>[];

    return RefreshIndicator(
      onRefresh: () => _refresh(ref),
      child: poursAsync.when(
        loading: () => ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(DhenuSpacing.screen),
          children: const [DhenuLoadingList(rows: 6)],
        ),
        error: (e, _) => ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            SizedBox(
              height: 400,
              child: DhenuErrorState(onRetry: () => _refresh(ref)),
            ),
          ],
        ),
        data: (pours) =>
            _Body(pours: pours, period: period, pastPeriods: past, onRefresh: () => _refresh(ref)),
      ),
    );
  }
}

/// Recorded pours grouped by collection date.
Map<String, List<MpPour>> _groupPoursByDate(List<MpPour> pours) {
  final map = <String, List<MpPour>>{};
  for (final p in pours) {
    map.putIfAbsent(p.collectionDate, () => []).add(p);
  }
  return map;
}

// ── Body (extracted so the data branch has its own widget tree) ───────────────

class _Body extends StatelessWidget {
  const _Body({
    required this.pours,
    required this.period,
    required this.pastPeriods,
    required this.onRefresh,
  });

  final List<MpPour> pours;
  final MpCyclePeriod? period;
  final List<MpCyclePeriod> pastPeriods;
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final grouped = _groupPoursByDate(pours);
    final dates = grouped.keys.toList()..sort((a, b) => b.compareTo(a));
    final hasCurrent = dates.isNotEmpty;

    return CustomScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      slivers: [
        SliverToBoxAdapter(child: _StickyHeader(pours: pours, period: period)),
        SliverPadding(
          padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.screen),
          sliver: SliverToBoxAdapter(
            child: _ChartCard(pours: pours, period: period, t: t),
          ),
        ),
        const SliverToBoxAdapter(child: SizedBox(height: DhenuSpacing.lg)),
        if (!hasCurrent && pastPeriods.isEmpty)
          SliverFillRemaining(
            child: DhenuEmptyState(
              icon: DhenuIcons.drop,
              title: 'No collections this cycle',
              subtitle: 'Your daily pours will appear here once recorded.',
              action: FilledButton(onPressed: onRefresh, child: const Text('Refresh')),
            ),
          )
        else ...[
          if (hasCurrent) ...[
            SliverPadding(
              padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.screen),
              sliver: SliverToBoxAdapter(child: _SectionLabel(t: t, label: 'THIS CYCLE')),
            ),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(
                  DhenuSpacing.screen, DhenuSpacing.sm, DhenuSpacing.screen, DhenuSpacing.lg),
              sliver: SliverList.separated(
                itemCount: dates.length,
                separatorBuilder: (ctx, i) => const SizedBox(height: DhenuSpacing.sm),
                itemBuilder: (context, i) => _DayRow(date: dates[i], pours: grouped[dates[i]]!),
              ),
            ),
          ],
          if (pastPeriods.isNotEmpty) ...[
            SliverPadding(
              padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.screen),
              sliver: SliverToBoxAdapter(child: _SectionLabel(t: t, label: 'PAST CYCLES')),
            ),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(
                  DhenuSpacing.screen, DhenuSpacing.sm, DhenuSpacing.screen, DhenuSpacing.bottomGap),
              sliver: SliverList.separated(
                itemCount: pastPeriods.length,
                separatorBuilder: (ctx, i) => const SizedBox(height: DhenuSpacing.sm),
                itemBuilder: (context, i) => _PastCycleCard(period: pastPeriods[i]),
              ),
            ),
          ],
        ],
      ],
    );
  }
}

// ── Sticky header ─────────────────────────────────────────────────────────────

class _StickyHeader extends StatelessWidget {
  const _StickyHeader({required this.pours, required this.period});

  final List<MpPour> pours;
  final MpCyclePeriod? period;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final scope = period?.label ?? 'This cycle';
    final pourCount = pours.length;

    return Container(
      color: t.surface,
      padding: const EdgeInsets.fromLTRB(
          DhenuSpacing.screen, DhenuSpacing.lg, DhenuSpacing.screen, DhenuSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            'Collections',
            style: DhenuText.number(size: 24, w: FontWeight.w800).copyWith(color: t.ink),
          ),
          const SizedBox(height: DhenuSpacing.xs),
          Text(
            '$scope · $pourCount pours',
            style: DhenuText.caption.copyWith(color: t.inkSoft),
          ),
        ],
      ),
    );
  }
}

// ── Cycle chart card ──────────────────────────────────────────────────────────

class _ChartCard extends StatelessWidget {
  const _ChartCard({required this.pours, required this.period, required this.t});

  final List<MpPour> pours;
  final MpCyclePeriod? period;
  final DhenuTokens t;

  @override
  Widget build(BuildContext context) {
    final bars = _buildBars(context);
    final avgL = _avgPerDay();
    final axisLabels = _axisLabels();

    return DhenuCard(
      elevated: true,
      padding: const EdgeInsets.all(DhenuSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Expanded(
                child: Text('Daily volume', style: DhenuText.label.copyWith(color: t.inkSoft)),
              ),
              Text(
                '${litres(avgL)} L/day avg',
                style: DhenuText.number(size: 22, w: FontWeight.w800).copyWith(color: t.ink),
              ),
            ],
          ),
          const SizedBox(height: DhenuSpacing.sm),
          _Legend(t: t),
          const SizedBox(height: DhenuSpacing.md),
          MiniBarChart(bars: bars, height: 64, gap: 2),
          const SizedBox(height: DhenuSpacing.sm),
          _AxisRow(labels: axisLabels, t: t),
        ],
      ),
    );
  }

  /// One bar per day across the cycle window (start→end), so days still to come
  /// in an in-progress cycle render as faint sentinels. Falls back to a 30-day
  /// rolling window when no cadence has resolved.
  List<BarDatum> _buildBars(BuildContext context) {
    final byDate = <String, _DaySummary>{};
    for (final p in pours) {
      final s = byDate.putIfAbsent(p.collectionDate, () => _DaySummary());
      s.qty += p.qtyLitres;
      // track best grade (lowest index = best)
      if (p.qualityGrade.index < s.bestGrade.index) {
        s.bestGrade = p.qualityGrade;
      }
    }

    final days = _spanDays();
    return List.generate(days.length, (i) {
      final summary = byDate[_iso(days[i])];
      if (summary == null || summary.qty <= 0) {
        return BarDatum(0.1, t.hairline); // faint sentinel bar for zero days
      }
      final color = summary.bestGrade == Grade.a ? t.gradeA : t.gradeB;
      return BarDatum(summary.qty, color);
    });
  }

  double _avgPerDay() {
    if (pours.isEmpty) return 0;
    final byDate = <String, double>{};
    for (final p in pours) {
      byDate[p.collectionDate] = (byDate[p.collectionDate] ?? 0) + p.qtyLitres;
    }
    if (byDate.isEmpty) return 0;
    final total = byDate.values.fold<double>(0, (a, b) => a + b);
    return total / byDate.length;
  }

  /// 3 labels spaced across the span: first, middle, last day.
  List<String> _axisLabels() {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    final days = _spanDays();
    String fmt(DateTime d) => '${months[d.month - 1]} ${d.day}';
    return [fmt(days.first), fmt(days[days.length ~/ 2]), fmt(days.last)];
  }

  /// Ordered list of dates covered by the chart — the cycle window, or the
  /// trailing 30 days when no cadence is configured.
  List<DateTime> _spanDays() {
    if (period != null) {
      final start = DateTime.parse(period!.start);
      final end = DateTime.parse(period!.end);
      final n = end.difference(start).inDays + 1;
      return List.generate(n, (i) => start.add(Duration(days: i)));
    }
    final now = DateTime.now();
    final base = DateTime(now.year, now.month, now.day);
    return List.generate(30, (i) => base.subtract(Duration(days: 29 - i)));
  }

  String _iso(DateTime d) => '${d.year}-${_two(d.month)}-${_two(d.day)}';

  String _two(int n) => n.toString().padLeft(2, '0');
}

class _DaySummary {
  double qty = 0;
  Grade bestGrade = Grade.unknown;
}

class _Legend extends StatelessWidget {
  const _Legend({required this.t});
  final DhenuTokens t;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        _dot(t.gradeA),
        const SizedBox(width: DhenuSpacing.xs),
        Text('A', style: DhenuText.caption.copyWith(color: t.inkSoft)),
        const SizedBox(width: DhenuSpacing.md),
        _dot(t.gradeB),
        const SizedBox(width: DhenuSpacing.xs),
        Text('B', style: DhenuText.caption.copyWith(color: t.inkSoft)),
      ],
    );
  }

  Widget _dot(Color color) => Container(
        width: 10,
        height: 10,
        decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(2)),
      );
}

class _AxisRow extends StatelessWidget {
  const _AxisRow({required this.labels, required this.t});
  final List<String> labels;
  final DhenuTokens t;

  @override
  Widget build(BuildContext context) {
    final style = DhenuText.caption.copyWith(color: t.inkSoft);
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: labels.map((l) => Text(l, style: style)).toList(),
    );
  }
}

// ── Section label ─────────────────────────────────────────────────────────────

class _SectionLabel extends StatelessWidget {
  const _SectionLabel({required this.t, required this.label});
  final DhenuTokens t;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: DhenuSpacing.sm),
      child: Text(
        label,
        style: DhenuText.caption.copyWith(
          color: t.inkSoft,
          fontWeight: FontWeight.w700,
          letterSpacing: 1.1,
        ),
      ),
    );
  }
}

// ── Past cycle (collapsible) ────────────────────────────────────────────────

class _PastCycleCard extends ConsumerStatefulWidget {
  const _PastCycleCard({required this.period});
  final MpCyclePeriod period;

  @override
  ConsumerState<_PastCycleCard> createState() => _PastCycleCardState();
}

class _PastCycleCardState extends ConsumerState<_PastCycleCard> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final poursAsync = ref.watch(farmerCyclePoursProvider(widget.period));
    final pours = poursAsync.asData?.value ?? const <MpPour>[];
    // Hide cycles with no recorded collections (and while still loading).
    if (pours.isEmpty) return const SizedBox.shrink();

    final grouped = _groupPoursByDate(pours);
    final dates = grouped.keys.toList()..sort((a, b) => b.compareTo(a));

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        _summaryCard(context, pours),
        if (_expanded)
          ...dates.map((d) => Padding(
                padding: const EdgeInsets.only(top: DhenuSpacing.sm),
                child: _DayRow(date: d, pours: grouped[d]!),
              )),
      ],
    );
  }

  Widget _summaryCard(BuildContext context, List<MpPour> pours) {
    final t = DT(context);
    final totalL = pours.fold<double>(0, (s, p) => s + p.qtyLitres);
    final totalRs = pours.fold<double>(0, (s, p) => s + p.lineAmount);

    return DhenuCard(
      elevated: true,
      padding: const EdgeInsets.symmetric(
          horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.md),
      onTap: () => setState(() => _expanded = !_expanded),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(widget.period.label,
                    style: DhenuText.label.copyWith(color: t.ink, fontWeight: FontWeight.w700)),
                const SizedBox(height: DhenuSpacing.xs),
                Text('${litres(totalL)} L · ${pours.length} pours',
                    style: DhenuText.caption.copyWith(color: t.inkSoft)),
              ],
            ),
          ),
          Text(rupees(totalRs),
              style: DhenuText.number(size: 16, w: FontWeight.w800).copyWith(color: t.gradeA)),
          const SizedBox(width: DhenuSpacing.sm),
          AnimatedRotation(
            turns: _expanded ? 0.25 : 0,
            duration: const Duration(milliseconds: 150),
            child: Icon(DhenuIcons.chevronRight, size: 18, color: t.inkSoft),
          ),
        ],
      ),
    );
  }
}

// ── Day row card ──────────────────────────────────────────────────────────────

class _DayRow extends StatelessWidget {
  const _DayRow({required this.date, required this.pours});

  final String date;
  final List<MpPour> pours;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final totalL = pours.fold<double>(0, (s, p) => s + p.qtyLitres);
    final totalRs = pours.fold<double>(0, (s, p) => s + p.lineAmount);
    final bestGrade = pours.map((p) => p.qualityGrade).reduce((a, b) => a.index < b.index ? a : b);
    final avgFat = _avgField((p) => p.fat);
    final avgSnf = _avgField((p) => p.snf);
    final d = DateTime.tryParse(date);
    final dayNum = d?.day.toString() ?? '--';
    final monthAbbr = d == null ? '' : _monthAbbr(d.month);

    return DhenuCard(
      elevated: true,
      padding: const EdgeInsets.symmetric(
          horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.md),
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => FarmerCollectionDetail(date: date, pours: pours)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          // Date block
          SizedBox(
            width: 44,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  dayNum,
                  style: DhenuText.number(size: 22, w: FontWeight.w800).copyWith(color: t.brand),
                ),
                Text(monthAbbr, style: DhenuText.caption.copyWith(color: t.inkSoft)),
              ],
            ),
          ),
          // Hairline divider
          Container(
            width: 1,
            height: 36,
            color: t.hairline,
            margin: const EdgeInsets.symmetric(horizontal: DhenuSpacing.md),
          ),
          // Volume + quality
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(litres(totalL, unit: true), style: DhenuText.label.copyWith(color: t.ink)),
                const SizedBox(height: DhenuSpacing.xs),
                QualityBadge(fat: avgFat, snf: avgSnf, grade: bestGrade, compact: true),
              ],
            ),
          ),
          // Amount + chevron
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                rupees(totalRs),
                style: DhenuText.number(size: 16, w: FontWeight.w800).copyWith(color: t.gradeA),
              ),
              const SizedBox(height: DhenuSpacing.xs),
              Icon(DhenuIcons.chevronRight, size: 18, color: t.inkSoft),
            ],
          ),
        ],
      ),
    );
  }

  double? _avgField(double? Function(MpPour) field) {
    final values = pours.map(field).whereType<double>().toList();
    if (values.isEmpty) return null;
    return values.reduce((a, b) => a + b) / values.length;
  }

  String _monthAbbr(int m) => const [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
      ][m - 1];
}
