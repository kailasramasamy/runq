import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../providers/auth_provider.dart';
import '../../providers/farmer_providers.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../widgets/audio_play.dart';
import '../../widgets/dhenu_charts.dart';
import '../../widgets/dhenu_states.dart';
import '../../widgets/dhenu_toast.dart';
import '../../widgets/gradient_hero_card.dart';
import '../../widgets/quality_badge.dart';
import '../../widgets/shift_accent_card.dart';
import 'farmer_rate_chart.dart';
import 'farmer_rewards.dart';

/// Farmer home (redesign §1): greeting + bell, emerald cycle hero with a
/// volume sparkline, today's AM/PM accent cards, a streak ring nudge, and
/// quick links — over the current-cycle/today pour providers.
class FarmerHome extends ConsumerWidget {
  const FarmerHome({super.key});

  Future<void> _refresh(WidgetRef ref) async {
    ref.invalidate(cycleConfigProvider);
    ref.invalidate(farmerCyclePeriodsProvider);
    ref.invalidate(farmerCyclePoursProvider);
    ref.invalidate(farmerTodayPoursProvider);
    await Future.wait([
      ref.read(farmerCurrentCyclePoursProvider.future),
      ref.read(farmerTodayPoursProvider.future),
    ]);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    final user = ref.watch(authProvider).user;
    final cyclePours = ref.watch(farmerCurrentCyclePoursProvider);
    final cycleLabel = ref.watch(farmerCurrentCyclePeriodProvider).asData?.value?.label ?? '';
    final firstName = (user?.name ?? 'Farmer').split(' ').first;

    return RefreshIndicator(
      onRefresh: () => _refresh(ref),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.fromLTRB(
            DhenuSpacing.screen, DhenuSpacing.lg, DhenuSpacing.screen, DhenuSpacing.x4),
        children: [
          _greeting(context, t, firstName),
          const SizedBox(height: DhenuSpacing.lg),
          ...cyclePours.when(
            loading: () => const [_HomeSkeleton()],
            error: (e, _) => [
              SizedBox(height: 320, child: DhenuErrorState(onRetry: () => _refresh(ref))),
            ],
            data: (pours) => pours.isEmpty
                ? [
                    SizedBox(
                      height: 360,
                      child: DhenuEmptyState(
                        icon: DhenuIcons.drop,
                        title: 'No pours yet this cycle',
                        subtitle: 'Your collections will appear here once recorded at the centre.',
                        action: FilledButton(onPressed: () => _refresh(ref), child: const Text('Refresh')),
                      ),
                    ),
                  ]
                : _content(context, ref, t, pours, cycleLabel),
          ),
        ],
      ),
    );
  }

  List<Widget> _content(
      BuildContext context, WidgetRef ref, DhenuTokens t, List<MpPour> pours, String cycleLabel) {
    final todayPours = ref.watch(farmerTodayPoursProvider);
    return [
      _hero(context, t, pours, cycleLabel),
      const SizedBox(height: DhenuSpacing.lg),
      _today(context, t, todayPours),
      const SizedBox(height: DhenuSpacing.lg),
      _streakNudge(context, t, pours),
      _quickLinks(context, t),
    ];
  }

  // ── Greeting ──────────────────────────────────────────────────────────────
  Widget _greeting(BuildContext context, DhenuTokens t, String name) {
    final hour = DateTime.now().hour;
    final part = hour < 12 ? 'Good morning' : (hour < 17 ? 'Good afternoon' : 'Good evening');
    final initial = name.isNotEmpty ? name[0].toUpperCase() : 'F';
    return Row(
      children: [
        Container(
          width: 42,
          height: 42,
          alignment: Alignment.center,
          decoration: BoxDecoration(color: t.brandSubtle, shape: BoxShape.circle),
          child: Text(initial, style: DhenuText.title.copyWith(color: t.brand)),
        ),
        const SizedBox(width: DhenuSpacing.md),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(part, style: DhenuText.caption.copyWith(color: t.inkSoft)),
              Text(name, style: DhenuText.title.copyWith(color: t.ink, fontWeight: FontWeight.w700)),
            ],
          ),
        ),
        _bell(context, t),
      ],
    );
  }

  Widget _bell(BuildContext context, DhenuTokens t) => GestureDetector(
        onTap: () => showDhenuToast(context, 'No new notifications',
            type: DhenuToastType.info, duration: const Duration(seconds: 1)),
        child: SizedBox(
          width: 42,
          height: 42,
          child: Stack(
            children: [
              Container(
                width: 42,
                height: 42,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: t.card,
                  borderRadius: BorderRadius.circular(13),
                  border: Border.all(color: t.hairline),
                ),
                child: Icon(DhenuIcons.bell, size: 20, color: t.ink),
              ),
              Positioned(
                top: 9,
                right: 9,
                child: Container(
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(color: t.gradeC, shape: BoxShape.circle),
                ),
              ),
            ],
          ),
        ),
      );

  // ── Hero ──────────────────────────────────────────────────────────────────
  Widget _hero(BuildContext context, DhenuTokens t, List<MpPour> pours, String cycleLabel) {
    final totalL = pours.fold<double>(0, (s, p) => s + p.qtyLitres);
    final totalRs = pours.fold<double>(0, (s, p) => s + p.lineAmount);
    final series = _dailySeries(pours, 14);
    final trend = _trendPct(series);
    final headline = cycleLabel.isEmpty ? 'THIS CYCLE' : 'THIS CYCLE · ${cycleLabel.toUpperCase()}';
    const white = Colors.white;
    final white80 = Colors.white.withValues(alpha: 0.8);

    return GradientHeroCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Text(headline,
                  style: DhenuText.caption.copyWith(color: white80, fontWeight: FontWeight.w700, letterSpacing: 1.1)),
              const Spacer(),
              if (trend != null) _trendPill(trend),
            ],
          ),
          const SizedBox(height: DhenuSpacing.sm),
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(litres(totalL), style: DhenuText.number(size: 46, w: FontWeight.w800).copyWith(color: white)),
              const SizedBox(width: DhenuSpacing.xs),
              Text('L', style: DhenuText.number(size: 20, w: FontWeight.w700).copyWith(color: white80)),
            ],
          ),
          const SizedBox(height: DhenuSpacing.md),
          Sparkline(values: series, color: white),
          const SizedBox(height: DhenuSpacing.md),
          Container(height: 1, color: Colors.white.withValues(alpha: 0.16)),
          const SizedBox(height: DhenuSpacing.md),
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(rupees(totalRs),
                        style: DhenuText.number(size: 24, w: FontWeight.w800).copyWith(color: white)),
                    Text('${pours.length} pours', style: DhenuText.caption.copyWith(color: white80)),
                  ],
                ),
              ),
              AudioPlay(
                speak: 'This cycle, ${litres(totalL)} litres, ${totalRs.toStringAsFixed(0)} rupees',
                label: 'Listen',
                size: 16,
                iconColor: white,
                fillColor: Colors.white.withValues(alpha: 0.18),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _trendPill(double pct) {
    final up = pct >= 0;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.sm, vertical: 3),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.16),
        borderRadius: BorderRadius.circular(DhenuRadii.pill),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(up ? DhenuIcons.trendingUp : DhenuIcons.trendingDown, size: 14, color: Colors.white),
          const SizedBox(width: 2),
          Text('${pct.abs().round()}%', style: DhenuText.label.copyWith(color: Colors.white)),
        ],
      ),
    );
  }

  // ── Today ───────────────────────────────────────────────────────────────
  Widget _today(BuildContext context, DhenuTokens t, AsyncValue<List<MpPour>> todayPours) {
    return todayPours.when(
      loading: () => const DhenuLoadingList(rows: 1),
      error: (e, s) => const SizedBox.shrink(),
      data: (pours) {
        final am = pours.where((p) => p.shift == Shift.am).toList();
        final pm = pours.where((p) => p.shift == Shift.pm).toList();
        final todayL = pours.fold<double>(0, (s, p) => s + p.qtyLitres);
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Text('Today', style: DhenuText.title.copyWith(color: t.ink, fontWeight: FontWeight.w700)),
                const Spacer(),
                Text('${litres(todayL)} L collected', style: DhenuText.caption.copyWith(color: t.inkSoft)),
              ],
            ),
            const SizedBox(height: DhenuSpacing.sm),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(child: _shiftCard(t, isAm: true, pours: am)),
                const SizedBox(width: DhenuSpacing.md),
                Expanded(child: _shiftCard(t, isAm: false, pours: pm)),
              ],
            ),
          ],
        );
      },
    );
  }

  Widget _shiftCard(DhenuTokens t, {required bool isAm, required List<MpPour> pours}) {
    final has = pours.isNotEmpty;
    final totalL = pours.fold<double>(0, (s, p) => s + p.qtyLitres);
    final grade = has
        ? pours.map((p) => p.qualityGrade).reduce((a, b) => a.index < b.index ? a : b)
        : Grade.unknown;
    final fats = pours.where((p) => p.fat != null).map((p) => p.fat!).toList();
    final snfs = pours.where((p) => p.snf != null).map((p) => p.snf!).toList();
    final avgFat = fats.isEmpty ? null : fats.reduce((a, b) => a + b) / fats.length;
    final avgSnf = snfs.isEmpty ? null : snfs.reduce((a, b) => a + b) / snfs.length;
    return ShiftAccentCard(
      isAm: isAm,
      empty: !has,
      litresLabel: litres(totalL, unit: true),
      quality: has ? QualityBadge(fat: avgFat, snf: avgSnf, grade: grade, format: QualityFormat.valueLabel) : null,
    );
  }

  // ── Streak ────────────────────────────────────────────────────────────────
  Widget _streakNudge(BuildContext context, DhenuTokens t, List<MpPour> pours) {
    final streak = _computeStreak(pours);
    if (streak == 0) return const SizedBox.shrink();
    final remaining = (10 - streak).clamp(0, 10);
    return Padding(
      padding: const EdgeInsets.only(bottom: DhenuSpacing.lg),
      child: GestureDetector(
        onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const FarmerRewards())),
        child: Container(
          padding: const EdgeInsets.all(DhenuSpacing.lg),
          decoration: BoxDecoration(
            color: t.gradeA.withValues(alpha: 0.08),
            borderRadius: BorderRadius.circular(DhenuRadii.card),
            border: Border.all(color: t.gradeA.withValues(alpha: 0.28)),
          ),
          child: Row(
            children: [
              ProgressRing(
                progress: streak / 10,
                color: t.gradeA,
                size: 48,
                strokeWidth: 4,
                child: Icon(DhenuIcons.flame, size: 20, color: t.gradeA),
              ),
              const SizedBox(width: DhenuSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('$streak-day quality streak',
                        style: DhenuText.label.copyWith(color: t.gradeA)),
                    const SizedBox(height: 2),
                    Text(
                      remaining == 0
                          ? 'Bonus unlocked — keep it going!'
                          : '$remaining more Grade-A ${remaining == 1 ? 'day' : 'days'} to unlock a bonus',
                      style: DhenuText.caption.copyWith(color: t.inkSoft),
                    ),
                  ],
                ),
              ),
              Icon(DhenuIcons.chevronRight, color: t.inkSoft, size: 20),
            ],
          ),
        ),
      ),
    );
  }

  // ── Quick links ─────────────────────────────────────────────────────────
  Widget _quickLinks(BuildContext context, DhenuTokens t) => Row(
        children: [
          Expanded(
            child: _link(context, t, DhenuIcons.grid, t.brand, 'Rate Chart',
                () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const FarmerRateChart()))),
          ),
          const SizedBox(width: DhenuSpacing.md),
          Expanded(
            child: _link(context, t, DhenuIcons.trophy, t.gradeB, 'Rewards',
                () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const FarmerRewards()))),
          ),
        ],
      );

  Widget _link(BuildContext context, DhenuTokens t, IconData icon, Color tint, String label, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(DhenuSpacing.lg),
        decoration: BoxDecoration(
          color: t.card,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: t.hairline),
        ),
        child: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: tint.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(DhenuRadii.input),
              ),
              child: Icon(icon, size: 19, color: tint),
            ),
            const SizedBox(width: DhenuSpacing.md),
            Flexible(
              child: Text(label,
                  style: DhenuText.label.copyWith(color: t.ink),
                  overflow: TextOverflow.ellipsis),
            ),
          ],
        ),
      ),
    );
  }

  // ── Derived data ──────────────────────────────────────────────────────────
  List<double> _dailySeries(List<MpPour> pours, int days) {
    final byDate = <String, double>{};
    for (final p in pours) {
      byDate[p.collectionDate] = (byDate[p.collectionDate] ?? 0) + p.qtyLitres;
    }
    final now = DateTime.now();
    final base = DateTime(now.year, now.month, now.day);
    return List.generate(days, (i) {
      final d = base.subtract(Duration(days: days - 1 - i));
      final key = '${d.year}-${_two(d.month)}-${_two(d.day)}';
      return byDate[key] ?? 0.0;
    });
  }

  double? _trendPct(List<double> s) {
    if (s.length < 14) return null;
    final prev = s.sublist(0, 7).fold<double>(0, (a, b) => a + b);
    final last = s.sublist(7).fold<double>(0, (a, b) => a + b);
    if (prev <= 0) return null;
    return (last - prev) / prev * 100;
  }

  String _two(int n) => n.toString().padLeft(2, '0');

  /// Consecutive days ending today (or yesterday) where all pours were Grade A.
  int _computeStreak(List<MpPour> pours) {
    if (pours.isEmpty) return 0;
    final byDate = <String, List<MpPour>>{};
    for (final p in pours) {
      byDate.putIfAbsent(p.collectionDate, () => []).add(p);
    }
    final sortedDates = byDate.keys.toList()..sort((a, b) => b.compareTo(a));
    var streak = 0;
    for (final date in sortedDates) {
      if (!byDate[date]!.every((p) => p.qualityGrade == Grade.a)) break;
      streak++;
    }
    return streak;
  }
}

/// Loading placeholder shaped like the real home: hero card, the "Today"
/// AM/PM shift cards, the streak nudge, and the two quick-link tiles.
class _HomeSkeleton extends StatelessWidget {
  const _HomeSkeleton();

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    Widget block(double h, double r) => Container(
          height: h,
          decoration: BoxDecoration(color: t.hairline, borderRadius: BorderRadius.circular(r)),
        );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        block(196, DhenuRadii.cardLg), // hero
        const SizedBox(height: DhenuSpacing.lg),
        SizedBox(width: 90, child: block(14, DhenuRadii.pill)), // "Today" label
        const SizedBox(height: DhenuSpacing.sm),
        Row(children: [
          Expanded(child: block(96, DhenuRadii.card)),
          const SizedBox(width: DhenuSpacing.md),
          Expanded(child: block(96, DhenuRadii.card)),
        ]),
        const SizedBox(height: DhenuSpacing.lg),
        block(72, DhenuRadii.card), // streak nudge
        const SizedBox(height: DhenuSpacing.lg),
        Row(children: [
          Expanded(child: block(60, 18)),
          const SizedBox(width: DhenuSpacing.md),
          Expanded(child: block(60, 18)),
        ]), // quick links
      ],
    );
  }
}
