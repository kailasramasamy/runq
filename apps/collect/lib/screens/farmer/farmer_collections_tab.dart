import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../l10n/app_localizations.dart';
import '../../l10n/l10n_helpers.dart';
import '../../providers/farmer_providers.dart';
import '../../providers/mp_context_provider.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_charts.dart';
import '../../widgets/dhenu_states.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../widgets/dhenu_toast.dart';
import '../../widgets/quality_badge.dart';
import '../shared/rejection_report.dart';

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
    // Judged across the whole cycle, not per day: a farmer who supplies two
    // types should see every row labelled, not only on the days that mix.
    final mixedTypes = hasMixedMilkTypes(pours.map((p) => p.milkType));
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
                itemBuilder: (context, i) => _DayRow(
                    date: dates[i], pours: grouped[dates[i]]!, bands: bands,
                    milkType: milkType, showMilkType: mixedTypes),
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
    final axisLabels = _axisLabels(context);

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

  List<String> _axisLabels(BuildContext context) {
    final days = _spanDays();
    String fmt(DateTime d) => '${shortMonth(context, d.month)} ${d.day}';
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
    if (poursAsync.isLoading) return const DhenuLoadingList(rows: 1);
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
                child: _DayRow(date: d, pours: grouped[d]!, bands: bands,
                    milkType: milkType, showMilkType: hasMixedMilkTypes(pours.map((p) => p.milkType))),
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
    final payableRs = pours.fold<double>(0, (s, p) => s + p.payableAmount);

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
              Text(rupees(payableRs),
                  style: DhenuText.number(size: 16, w: FontWeight.w800)
                      .copyWith(color: payableRs > 0 ? t.gradeA : t.inkSoft)),
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

class _DayRow extends ConsumerStatefulWidget {
  const _DayRow({
    required this.date, required this.pours, this.bands, this.milkType,
    this.showMilkType = false,
  });

  final String date;
  final List<MpPour> pours;
  /// The farmer supplies more than one milk type, so every pour is labelled.
  final bool showMilkType;
  final QualityBands? bands;
  final MilkType? milkType;

  @override
  ConsumerState<_DayRow> createState() => _DayRowState();
}

class _DayRowState extends ConsumerState<_DayRow> {
  bool _expanded = false;

  @override
  void initState() {
    super.initState();
    // Home may have focused this day before the tab was ever built.
    if (ref.read(farmerFocusDateProvider) == widget.date) _focus();
  }

  /// Open this day and bring it under the fold, then release the focus so the
  /// same day can be focused again on a later tap.
  void _focus() {
    _expanded = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      ref.read(farmerFocusDateProvider.notifier).state = null;
      Scrollable.ensureVisible(context,
          duration: const Duration(milliseconds: 250), alignment: 0.1);
    });
  }

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    // The tab lives in an IndexedStack, so it is already built when Home sets
    // the focus — listen rather than relying on initState alone.
    ref.listen(farmerFocusDateProvider, (_, next) {
      if (next == widget.date && mounted) setState(_focus);
    });
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
    final payableRs = pours.fold<double>(0, (s, p) => s + p.payableAmount);
    final bestGrade = pours.map((p) => p.qualityGrade).reduce((a, b) => a.index < b.index ? a : b);
    final dayTypes = milkTypesIn(pours.map((p) => p.milkType));
    final rejectedToday = pours.fold<double>(0, (s, p) => s + p.rejectedQty);
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
              Text(d == null ? '' : shortMonth(context, d.month),
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
              // A day that mixes types has no single quality standard to colour
              // against — averaging cow FAT with buffalo FAT and grading it on
              // one band would show a confidently wrong signal. Name the types
              // instead and let the per-pour rows below carry the quality.
              if (dayTypes.length > 1)
                Text(milkTypesL10n(AppLocalizations.of(context), dayTypes),
                    style: DhenuText.caption.copyWith(color: t.inkSoft))
              else
                QualityBadge(
                  fat: _avg((p) => p.fat), snf: _avg((p) => p.snf), water: _avg((p) => p.water),
                  grade: bestGrade, format: QualityFormat.full, showGrade: false,
                  bands: widget.bands, milkType: dayTypes.firstOrNull ?? widget.milkType),
              // On the collapsed day too, because the amount beside it is what
              // the milk earned, not what will be paid — and a farmer who never
              // expands the day would otherwise meet the deduction for the first
              // time in their cycle statement.
              if (rejectedToday > 0)
                _DayRejectedChip(qty: rejectedToday),
            ],
          ),
        ),
        Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(mainAxisSize: MainAxisSize.min, children: [
              if (payableRs < totalRs) ...[
                Text(rupees(totalRs),
                    style: DhenuText.caption.copyWith(
                        color: t.inkSoft, decoration: TextDecoration.lineThrough)),
                const SizedBox(width: DhenuSpacing.xs),
              ],
              Text(rupees(payableRs),
                  style: DhenuText.number(size: 16, w: FontWeight.w800)
                      .copyWith(color: payableRs > 0 ? t.gradeA : t.inkSoft)),
            ]),
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
        for (final (i, p) in pours.indexed) ...[
          if (i > 0) const SizedBox(height: DhenuSpacing.md),
          _pourLine(t, l, p),
        ],
      ],
    );
  }

  Widget _pourLine(DhenuTokens t, AppLocalizations l, MpPour p) {
    return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(mainAxisSize: MainAxisSize.min, children: [
              Text(litres(p.qtyLitres, unit: true),
                  style: DhenuText.number(size: 15, w: FontWeight.w700, color: t.ink)),
              if (widget.showMilkType) ...[
                const SizedBox(width: DhenuSpacing.sm),
                // Flexible so a long type label ("Cow A1 (regular)") ellipsises
                // instead of running past the row — the pill only knows to
                // ellipsise when something bounds its width.
                Flexible(child: MilkTypePill(milkType: p.milkType)),
              ],
            ]),
            const SizedBox(height: 2),
            QualityBadge(
                fat: p.fat, snf: p.snf, water: p.water,
                grade: p.qualityGrade, showGrade: false,
                bands: widget.bands, milkType: p.milkType),
            // The single most important line on a farmer's screen: milk they
            // delivered, and were shown an amount for, that they are not being
            // paid. Without it the row reads ₹6,351 earned and the deduction
            // turns up unexplained in the next cycle.
            PourRejectedChip(pour: p),
          ],
        ),
      ),
      const SizedBox(width: DhenuSpacing.sm),
      Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(mainAxisSize: MainAxisSize.min, children: [
            // The original, struck through — quiet, but it shows the loss
            // rather than simply deleting the number the farmer saw before.
            if (p.hasRejection) ...[
              Text(rupees(p.lineAmount),
                  style: DhenuText.caption.copyWith(
                      color: t.inkSoft, decoration: TextDecoration.lineThrough)),
              const SizedBox(width: DhenuSpacing.xs),
            ],
            Text(rupees(p.payableAmount),
                style: DhenuText.number(
                    size: 15, w: FontWeight.w800,
                    // Not green when nothing is being earned: green is the
                    // colour of money coming in.
                    color: p.payableAmount > 0 ? t.gradeA : t.inkSoft)),
          ]),
          const SizedBox(height: 2),
          Text(l.farmerCollectionDetailRatePerLitre(rupees(p.ratePerLitre, paise: true)),
              style: DhenuText.caption.copyWith(color: t.inkSoft)),
        ],
      ),
      _ReportPourButton(pour: p),
    ]);
  }

  double? _avg(double? Function(MpPour) field) {
    final values = widget.pours.map(field).whereType<double>().toList();
    if (values.isEmpty) return null;
    return values.reduce((a, b) => a + b) / values.length;
  }


}

/// Day-level echo of [PourRejectedChip] — the per-pour chips live inside the
/// expanded detail, and this is what a farmer sees before they open it.
class _DayRejectedChip extends StatelessWidget {
  const _DayRejectedChip({required this.qty});

  final double qty;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    return Padding(
      padding: const EdgeInsets.only(top: 3),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(DhenuIcons.warning, size: 12, color: t.gradeC),
        const SizedBox(width: 4),
        Flexible(
          // Just the litres here: the struck-through amount beside it already
          // says it is not being paid, and "· not paid" only ever fitted by
          // losing its own last word.
          child: Text(l.rejectedChip(litres(qty, unit: true)),
              style: DhenuText.label.copyWith(color: t.gradeC), maxLines: 2),
        ),
      ]),
    );
  }
}

/// A farmer's first in-app recourse (audit E3): flag an entry that looks wrong.
/// Opens the tenant's WhatsApp support line with the pour's details prefilled;
/// falls back to a phone call when only a phone number is configured.
class _ReportPourButton extends ConsumerWidget {
  const _ReportPourButton({required this.pour});
  final MpPour pour;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final cfg = ref.watch(supportConfigProvider).asData?.value;
    final hasContact = cfg?.whatsapp != null || cfg?.phone != null;
    if (!hasContact) return const SizedBox.shrink();
    return IconButton(
      onPressed: () => _report(context, l, cfg!),
      tooltip: l.farmerReportProblem,
      icon: Icon(DhenuIcons.flag, size: 16, color: t.inkSoft),
      visualDensity: VisualDensity.compact,
    );
  }

  Future<void> _report(BuildContext context, AppLocalizations l, MpSupportConfig cfg) async {
    final shiftLabel = pour.shift == Shift.am ? l.shiftAm : l.shiftPm;
    final msg = l.farmerReportPrefill(
        prettyDate(pour.collectionDate), shiftLabel, litres(pour.qtyLitres, unit: true));
    final uri = cfg.whatsapp != null
        ? Uri.parse('https://wa.me/${cfg.whatsapp}?text=${Uri.encodeComponent(msg)}')
        : Uri.parse('tel:${cfg.phone}');
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok && context.mounted) {
      showDhenuToast(context, l.helpCouldNotOpen, type: DhenuToastType.error);
    }
  }
}
