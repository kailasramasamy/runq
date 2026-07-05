import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/farmer_providers.dart';
import '../../providers/mp_context_provider.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_charts.dart';
import '../../widgets/dhenu_states.dart';
import '../../widgets/quality_badge.dart';

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
    final bands = ref.watch(qualityBandsProvider(null)).valueOrNull;
    final farmer = ref.watch(farmerSelfProvider).valueOrNull;

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
        data: (pours) => _Body(
          pours: pours,
          period: period,
          pastPeriods: past,
          onRefresh: () => _refresh(ref),
          bands: bands,
          milkType: farmer?.defaultMilkType,
        ),
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
    this.bands,
    this.milkType,
  });

  final List<MpPour> pours;
  final MpCyclePeriod? period;
  final List<MpCyclePeriod> pastPeriods;
  final VoidCallback onRefresh;
  final QualityBands? bands;
  final MilkType? milkType;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
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
            child: _ChartCard(pours: pours, period: period, t: t, l: l),
          ),
        ),
        const SliverToBoxAdapter(child: SizedBox(height: DhenuSpacing.lg)),
        if (!hasCurrent && pastPeriods.isEmpty)
          SliverFillRemaining(
            child: DhenuEmptyState(
              icon: DhenuIcons.drop,
              title: l.farmerCollectionsEmptyTitle,
              subtitle: l.farmerCollectionsEmptySubtitle,
              action: FilledButton(onPressed: onRefresh, child: Text(l.farmerHomeRefresh)),
            ),
          )
        else ...[
          if (hasCurrent) ...[
            SliverPadding(
              padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.screen),
              sliver: SliverToBoxAdapter(
                  child: _SectionLabel(t: t, label: l.farmerCollectionsThisCycle)),
            ),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(
                  DhenuSpacing.screen, DhenuSpacing.sm, DhenuSpacing.screen, DhenuSpacing.lg),
              sliver: SliverList.separated(
                itemCount: dates.length,
                separatorBuilder: (ctx, i) => const SizedBox(height: DhenuSpacing.sm),
                itemBuilder: (context, i) => _DayRow(date: dates[i], pours: grouped[dates[i]]!, bands: bands, milkType: milkType),
              ),
            ),
          ],
          if (pastPeriods.isNotEmpty) ...[
            SliverPadding(
              padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.screen),
              sliver: SliverToBoxAdapter(
                  child: _SectionLabel(t: t, label: l.farmerCollectionsPastCycles)),
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
    final l = AppLocalizations.of(context);
    final scope = period?.label ?? l.farmerCollectionsThisCycle;
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
            l.farmerCollectionsTitle,
            style: DhenuText.number(size: 24, w: FontWeight.w800).copyWith(color: t.ink),
          ),
          const SizedBox(height: DhenuSpacing.xs),
          Text(
            l.farmerCollectionsCyclePours(scope, pourCount),
            style: DhenuText.caption.copyWith(color: t.inkSoft),
          ),
        ],
      ),
    );
  }
}

// ── Cycle chart card ──────────────────────────────────────────────────────────

class _ChartCard extends StatelessWidget {
  const _ChartCard(
      {required this.pours, required this.period, required this.t, required this.l});

  final List<MpPour> pours;
  final MpCyclePeriod? period;
  final DhenuTokens t;
  final AppLocalizations l;

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
                child: Text(l.farmerCollectionsDailyVolume,
                    style: DhenuText.label.copyWith(color: t.inkSoft)),
              ),
              Text(
                l.farmerCollectionsAvgPerDay(litres(avgL)),
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

  List<BarDatum> _buildBars(BuildContext context) {
    final byDate = <String, _DaySummary>{};
    for (final p in pours) {
      final s = byDate.putIfAbsent(p.collectionDate, () => _DaySummary());
      s.qty += p.qtyLitres;
      if (p.qualityGrade.index < s.bestGrade.index) {
        s.bestGrade = p.qualityGrade;
      }
    }

    final days = _spanDays();
    return List.generate(days.length, (i) {
      final summary = byDate[_iso(days[i])];
      if (summary == null || summary.qty <= 0) {
        return BarDatum(0.1, t.hairline);
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

  List<String> _axisLabels() {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    final days = _spanDays();
    String fmt(DateTime d) => '${months[d.month - 1]} ${d.day}';
    return [fmt(days.first), fmt(days[days.length ~/ 2]), fmt(days.last)];
  }

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
    if (pours.isEmpty) return const SizedBox.shrink();

    final bands = ref.watch(qualityBandsProvider(null)).valueOrNull;
    final milkType = ref.watch(farmerSelfProvider).valueOrNull?.defaultMilkType;
    final grouped = _groupPoursByDate(pours);
    final dates = grouped.keys.toList()..sort((a, b) => b.compareTo(a));

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        _summaryCard(context, pours),
        if (_expanded)
          ...dates.map((d) => Padding(
                padding: const EdgeInsets.only(top: DhenuSpacing.sm),
                child: _DayRow(date: d, pours: grouped[d]!, bands: bands, milkType: milkType),
              )),
      ],
    );
  }

  /// Cycle header — a tinted, flat card so it reads as the group header for the
  /// (white, elevated) day cards it expands into.
  Widget _summaryCard(BuildContext context, List<MpPour> pours) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final totalL = pours.fold<double>(0, (s, p) => s + p.qtyLitres);
    final totalRs = pours.fold<double>(0, (s, p) => s + p.lineAmount);

    return Material(
      color: _expanded ? t.brandSubtle : t.card,
      borderRadius: BorderRadius.circular(DhenuRadii.card),
      child: InkWell(
        onTap: () => setState(() => _expanded = !_expanded),
        borderRadius: BorderRadius.circular(DhenuRadii.card),
        child: Container(
          padding: const EdgeInsets.symmetric(
              horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.md),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(DhenuRadii.card),
            border: Border.all(color: _expanded ? t.brand.withValues(alpha: 0.35) : t.hairline),
          ),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(widget.period.label,
                        style: DhenuText.label
                            .copyWith(color: _expanded ? t.brand : t.ink, fontWeight: FontWeight.w700)),
                    const SizedBox(height: DhenuSpacing.xs),
                    Text(l.farmerCollectionsPastCycleSummary(litres(totalL), pours.length),
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
                child: Icon(DhenuIcons.chevronRight, size: 18, color: _expanded ? t.brand : t.inkSoft),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Day row card (taps to expand inline to the day's AM/PM pours) ─────────────

class _DayRow extends StatefulWidget {
  const _DayRow({required this.date, required this.pours, this.bands, this.milkType});

  final String date;
  final List<MpPour> pours;
  final QualityBands? bands;
  final MilkType? milkType;

  @override
  State<_DayRow> createState() => _DayRowState();
}

class _DayRowState extends State<_DayRow> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    return DhenuCard(
      elevated: true,
      padding: EdgeInsets.zero,
      onTap: () => setState(() => _expanded = !_expanded),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        _header(t),
        if (_expanded) _details(t, l),
      ]),
    );
  }

  Widget _header(DhenuTokens t) {
    final pours = widget.pours;
    final totalL = pours.fold<double>(0, (s, p) => s + p.qtyLitres);
    final totalRs = pours.fold<double>(0, (s, p) => s + p.lineAmount);
    final bestGrade = pours.map((p) => p.qualityGrade).reduce((a, b) => a.index < b.index ? a : b);
    final d = DateTime.tryParse(widget.date);

    return Padding(
      padding: const EdgeInsets.symmetric(
          horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.md),
      child: Row(children: [
        SizedBox(
          width: 44,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(d?.day.toString() ?? '--',
                  style: DhenuText.number(size: 22, w: FontWeight.w800).copyWith(color: t.brand)),
              Text(d == null ? '' : _monthAbbr(d.month),
                  style: DhenuText.caption.copyWith(color: t.inkSoft)),
            ],
          ),
        ),
        Container(
            width: 1, height: 36, color: t.hairline,
            margin: const EdgeInsets.symmetric(horizontal: DhenuSpacing.md)),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(litres(totalL, unit: true), style: DhenuText.label.copyWith(color: t.ink)),
              const SizedBox(height: DhenuSpacing.xs),
              QualityBadge(
                fat: _avg((p) => p.fat), snf: _avg((p) => p.snf), water: _avg((p) => p.water),
                grade: bestGrade, format: QualityFormat.full, showGrade: false,
                bands: widget.bands, milkType: widget.milkType),
            ],
          ),
        ),
        Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(rupees(totalRs),
                style: DhenuText.number(size: 16, w: FontWeight.w800).copyWith(color: t.gradeA)),
            const SizedBox(height: DhenuSpacing.xs),
            AnimatedRotation(
              turns: _expanded ? 0.25 : 0,
              duration: const Duration(milliseconds: 150),
              child: Icon(DhenuIcons.chevronRight, size: 18, color: t.inkSoft),
            ),
          ],
        ),
      ]),
    );
  }

  Widget _details(DhenuTokens t, AppLocalizations l) {
    final am = widget.pours.where((p) => p.shift == Shift.am).toList();
    final pm = widget.pours.where((p) => p.shift == Shift.pm).toList();
    return Column(mainAxisSize: MainAxisSize.min, children: [
      Divider(height: 1, color: t.hairline),
      Padding(
        padding: const EdgeInsets.fromLTRB(
            DhenuSpacing.lg, DhenuSpacing.md, DhenuSpacing.lg, DhenuSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            if (am.isNotEmpty) _shiftBlock(t, l, isAm: true, pours: am),
            if (am.isNotEmpty && pm.isNotEmpty) const SizedBox(height: DhenuSpacing.md),
            if (pm.isNotEmpty) _shiftBlock(t, l, isAm: false, pours: pm),
          ],
        ),
      ),
    ]);
  }

  Widget _shiftBlock(DhenuTokens t, AppLocalizations l,
      {required bool isAm, required List<MpPour> pours}) {
    final color = isAm ? t.amText : t.pm;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(children: [
          Icon(isAm ? DhenuIcons.sun : DhenuIcons.moon, size: 14, color: color),
          const SizedBox(width: DhenuSpacing.xs),
          Text(isAm ? l.shiftAm : l.shiftPm,
              style: DhenuText.label.copyWith(color: color, fontWeight: FontWeight.w700)),
        ]),
        const SizedBox(height: DhenuSpacing.sm),
        for (final p in pours) _pourLine(t, l, p),
      ],
    );
  }

  Widget _pourLine(DhenuTokens t, AppLocalizations l, MpPour p) {
    return Padding(
      padding: const EdgeInsets.only(bottom: DhenuSpacing.xs),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(litres(p.qtyLitres, unit: true),
                  style: DhenuText.number(size: 15, w: FontWeight.w700, color: t.ink)),
              const SizedBox(height: 2),
              QualityBadge(
                  fat: p.fat, snf: p.snf, water: p.water,
                  grade: p.qualityGrade, showGrade: false,
                  bands: widget.bands, milkType: p.milkType),
            ],
          ),
        ),
        const SizedBox(width: DhenuSpacing.sm),
        Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(rupees(p.lineAmount),
                style: DhenuText.number(size: 15, w: FontWeight.w800, color: t.gradeA)),
            const SizedBox(height: 2),
            Text(l.farmerCollectionDetailRatePerLitre(rupees(p.ratePerLitre, paise: true)),
                style: DhenuText.caption.copyWith(color: t.inkSoft)),
          ],
        ),
      ]),
    );
  }

  double? _avg(double? Function(MpPour) field) {
    final values = widget.pours.map(field).whereType<double>().toList();
    if (values.isEmpty) return null;
    return values.reduce((a, b) => a + b) / values.length;
  }

  String _monthAbbr(int m) => const [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
      ][m - 1];
}
