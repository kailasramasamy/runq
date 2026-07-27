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
import '../../widgets/audio_play.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_states.dart';
import '../../widgets/quality_badge.dart';
import 'farmer_insights.dart';
import 'farmer_rate_chart_share.dart';
import 'rate_chart_tables.dart';

/// Rate chart screen — FAT×SNF matrix or flat rate, with the farmer's last
/// pour cell highlighted (spec §6.1).
class FarmerRateChart extends ConsumerWidget {
  const FarmerRateChart({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final detailAsync = ref.watch(activeRateChartDetailProvider);
    final monthPours = ref.watch(farmerMonthPoursProvider).asData?.value ?? [];
    final lastRate = ref.watch(farmerLastRateResolutionProvider).asData?.value;

    final lastPour = monthPours.isNotEmpty
        ? monthPours.reduce((a, b) =>
            a.collectionDate.compareTo(b.collectionDate) >= 0 ? a : b)
        : null;
    final bands = ref.watch(qualityBandsProvider(null)).valueOrNull;

    return Scaffold(
      backgroundColor: t.surface,
      appBar: AppBar(
        backgroundColor: t.surface,
        foregroundColor: t.ink,
        leading: IconButton(
          icon: Icon(DhenuIcons.chevronLeft, size: 24, color: t.ink),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: detailAsync.maybeWhen(
          data: (detail) => Text(
            detail?.chart.name ?? l.farmerRateChartTitle,
            style: DhenuText.h2.copyWith(color: t.ink),
          ),
          orElse: () => Text(l.farmerRateChartTitle, style: DhenuText.h2.copyWith(color: t.ink)),
        ),
        actions: [
          if (detailAsync.asData?.value != null)
            RateChartShareAction(chartId: detailAsync.asData!.value!.chart.id),
          Padding(
            padding: const EdgeInsets.only(right: DhenuSpacing.md),
            child: AudioPlay(
              speak: _speakText(l, detailAsync.asData?.value, lastPour, lastRate,
                  averageDailyQty(monthPours)),
              size: 22,
            ),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(activeRateChartDetailProvider);
          ref.invalidate(farmerLastRateResolutionProvider);
          await ref.read(activeRateChartDetailProvider.future);
        },
        child: detailAsync.when(
          loading: () => const DhenuLoadingList(),
          error: (e, _) => DhenuErrorState(
            onRetry: () => ref.invalidate(activeRateChartDetailProvider),
          ),
          data: (detail) {
            if (detail == null) {
              return DhenuEmptyState(
                icon: DhenuIcons.grid,
                title: l.farmerRateEmptyTitle,
                subtitle: l.farmerRateEmptySubtitle,
              );
            }
            return _RateChartBody(
              detail: detail,
              lastPour: lastPour,
              lastRate: lastRate,
              dailyQty: averageDailyQty(monthPours),
              bands: bands,
            );
          },
        ),
      ),
    );
  }
}

/// What the Listen button says: the last rate, plus the single most valuable
/// coaching step ("if SNF reaches 8.5, +₹0.60/L") when one exists — turning
/// the densest screen into spoken guidance for farmers who can't read the
/// matrix (audit D5). Reuses the same computeRateCoaching as the visual strip.
String _speakText(AppLocalizations l, MpRateChartDetail? detail, MpPour? lastPour,
    MpRateResolution? lastRate, double dailyQty) {
  var text = lastRate == null
      ? l.farmerRateListenSpeak
      : l.farmerRateListenSpeakWithRate(lastRate.ratePerLitre.toStringAsFixed(1));
  final fat = lastPour?.fat, snf = lastPour?.snf;
  if (detail == null || fat == null || snf == null) return text;
  final c = computeRateCoaching(
      cells: detail.cells, curFat: fat, curSnf: snf, dailyQty: dailyQty);
  if (c == null || !c.hasAny) return text;
  // Speak only the bigger of the two opportunities — short enough to listen to.
  final snfDelta = c.snfDeltaPerLitre ?? 0, fatDelta = c.fatDeltaPerLitre ?? 0;
  if (snfDelta >= fatDelta && snfDelta > 0) {
    text += ' ${l.farmerRateSpeakCoach('SNF', oneDp(c.nextSnf!), snfDelta.toStringAsFixed(2))}';
  } else if (fatDelta > 0) {
    text += ' ${l.farmerRateSpeakCoach('FAT', oneDp(c.nextFat!), fatDelta.toStringAsFixed(2))}';
  }
  return text;
}

class _RateChartBody extends StatelessWidget {
  const _RateChartBody({
    required this.detail,
    required this.lastPour,
    required this.lastRate,
    required this.dailyQty,
    this.bands,
  });

  final MpRateChartDetail detail;
  final MpPour? lastPour;
  final MpRateResolution? lastRate;
  final double dailyQty;
  final QualityBands? bands;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final chart = detail.chart;
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(
        DhenuSpacing.screen,
        DhenuSpacing.lg,
        DhenuSpacing.screen,
        DhenuSpacing.x4,
      ),
      children: [
        _header(context, t, chart),
        ..._newRateNotice(context, t, l, chart),
        const SizedBox(height: DhenuSpacing.lg),
        if (lastPour != null && lastRate != null) ...[
          _lastPourCard(context, t, l),
          const SizedBox(height: DhenuSpacing.lg),
        ],
        if (chart.pricingMode == 'flat')
          _flatRate(t, l, chart)
        else if (chart.pricingMode == 'clr')
          ClrRateTable(cells: detail.cells, lastClr: lastPour?.clr)
        else ...[
          Text(l.farmerRateMatrixTitle, style: DhenuText.title.copyWith(color: t.ink)),
          const SizedBox(height: DhenuSpacing.sm),
          RateMatrix(
            cells: detail.cells,
            lastFat: lastPour?.fat,
            lastSnf: lastPour?.snf,
          ),
          _coachingStrip(context, t, l),
        ],
        if (detail.rules.isNotEmpty) ...[
          const SizedBox(height: DhenuSpacing.xxl),
          Text(l.farmerRateBonusSlabsTitle, style: DhenuText.title.copyWith(color: t.ink)),
          const SizedBox(height: DhenuSpacing.sm),
          ...detail.rules.map((r) => _ruleTile(context, t, l, r)),
        ],
      ],
    );
  }

  Widget _header(BuildContext context, DhenuTokens t, MpRateChart chart) {
    final hasDate = chart.effectiveFrom != null;
    final hasSeason = chart.season != null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (hasDate || hasSeason)
          Row(
            children: [
              if (hasDate)
                Text(
                  AppLocalizations.of(context).farmerRateEffectiveFrom(prettyDate(chart.effectiveFrom!)),
                  style: DhenuText.caption.copyWith(color: t.inkSoft),
                ),
              if (hasDate && hasSeason)
                Text(' · ', style: DhenuText.caption.copyWith(color: t.inkSoft)),
              if (hasSeason)
                Text(chart.season!, style: DhenuText.caption.copyWith(color: t.inkSoft)),
            ],
          ),
      ],
    );
  }

  /// Rate-change transparency (audit E6): a recently-effective chart gets a
  /// quiet notice so the price change is announced, not discovered.
  List<Widget> _newRateNotice(
      BuildContext context, DhenuTokens t, AppLocalizations l, MpRateChart chart) {
    final from = chart.effectiveFrom;
    if (from == null) return const [];
    final started = DateTime.tryParse(from);
    if (started == null || DateTime.now().difference(started).inDays > 14) return const [];
    return [
      const SizedBox(height: DhenuSpacing.md),
      Container(
        padding: const EdgeInsets.symmetric(
            horizontal: DhenuSpacing.md, vertical: DhenuSpacing.sm),
        decoration: BoxDecoration(
          color: t.brandSubtle,
          borderRadius: BorderRadius.circular(DhenuRadii.input),
        ),
        child: Row(children: [
          Icon(DhenuIcons.trendingUp, size: 14, color: t.brand),
          const SizedBox(width: DhenuSpacing.xs),
          Expanded(
            child: Text(
              l.farmerRateNewNotice(prettyDate(from)),
              style: DhenuText.label.copyWith(color: t.brand),
            ),
          ),
        ]),
      ),
    ];
  }

  Widget _lastPourCard(BuildContext context, DhenuTokens t, AppLocalizations l) {
    return DhenuCard(
      padding: const EdgeInsets.all(DhenuSpacing.lg),
      child: Container(
        decoration: BoxDecoration(
          color: t.brandSubtle,
          borderRadius: BorderRadius.circular(DhenuRadii.card),
        ),
        padding: const EdgeInsets.all(DhenuSpacing.lg),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: t.brand.withValues(alpha: 0.16),
                borderRadius: BorderRadius.circular(DhenuRadii.input),
              ),
              child: Icon(DhenuIcons.drop, size: 22, color: t.brand),
            ),
            const SizedBox(width: DhenuSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    l.farmerRateLastPourLabel,
                    style: DhenuText.label.copyWith(color: t.brand),
                  ),
                  const SizedBox(height: DhenuSpacing.xs),
                  _lastPourText(t),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _lastPourText(DhenuTokens t) {
    final milkType = lastPour!.milkType;
    final base = DhenuText.body.copyWith(color: t.ink);
    // CLR (lactometer) pours have no FAT/SNF — show the CLR reading instead.
    if (lastPour!.fat == null && lastPour!.clr != null) {
      final clrColor = QualityBadge.bandColor(bands, milkType, 'clr', lastPour!.clr, t) ?? t.ink;
      return RichText(
        text: TextSpan(style: base, children: [
          const TextSpan(text: 'CLR '),
          TextSpan(text: oneDp(lastPour!.clr!), style: TextStyle(color: clrColor)),
          TextSpan(text: ' → ${rupees(lastRate!.ratePerLitre, paise: true)}/L'),
        ]),
      );
    }
    final fatColor = QualityBadge.bandColor(bands, milkType, 'fat', lastPour!.fat, t) ?? t.ink;
    final snfColor = QualityBadge.bandColor(bands, milkType, 'snf', lastPour!.snf, t) ?? t.ink;
    return RichText(
      text: TextSpan(style: base, children: [
        const TextSpan(text: 'FAT '),
        TextSpan(text: oneDp(lastPour!.fat ?? 0), style: TextStyle(color: fatColor)),
        const TextSpan(text: ' · SNF '),
        TextSpan(text: oneDp(lastPour!.snf ?? 0), style: TextStyle(color: snfColor)),
        TextSpan(text: ' → ${rupees(lastRate!.ratePerLitre, paise: true)}/L'),
      ]),
    );
  }

  Widget _coachingStrip(BuildContext context, DhenuTokens t, AppLocalizations l) {
    final fat = lastPour?.fat, snf = lastPour?.snf;
    if (fat == null || snf == null) return const SizedBox.shrink();
    final c = computeRateCoaching(
        cells: detail.cells, curFat: fat, curSnf: snf, dailyQty: dailyQty);
    if (c == null || !c.hasAny) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: DhenuSpacing.lg),
      child: Container(
        padding: const EdgeInsets.all(DhenuSpacing.lg),
        decoration: BoxDecoration(
          color: t.gradeA.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(DhenuRadii.card),
          border: Border.all(color: t.gradeA.withValues(alpha: 0.24)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Icon(DhenuIcons.trendingUp, size: 18, color: t.gradeA),
                const SizedBox(width: DhenuSpacing.sm),
                Text(l.farmerRateEarnMore, style: DhenuText.label.copyWith(color: t.gradeA)),
              ],
            ),
            const SizedBox(height: DhenuSpacing.sm),
            if (c.snfDeltaPerLitre != null)
              _coachLine(t, l.farmerRateRaiseSnf(oneDp(c.nextSnf!)),
                  c.snfDeltaPerLitre!, c.snfDailyGain),
            if (c.fatDeltaPerLitre != null)
              _coachLine(t, l.farmerRateRaiseFat(oneDp(c.nextFat!)),
                  c.fatDeltaPerLitre!, c.fatDailyGain),
          ],
        ),
      ),
    );
  }

  Widget _coachLine(DhenuTokens t, String label, double perL, double? perDay) {
    final hasDaily = perDay != null && perDay > 0.01;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(child: Text(label, style: DhenuText.body.copyWith(color: t.ink))),
          const SizedBox(width: DhenuSpacing.sm),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('+ ${rupees(perL, paise: true)}/L',
                  style: DhenuText.label.copyWith(color: t.gradeA)),
              if (hasDaily)
                Text('~${rupees(perDay)}/day',
                    style: DhenuText.caption.copyWith(color: t.inkSoft)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _flatRate(DhenuTokens t, AppLocalizations l, MpRateChart chart) {
    return DhenuCard(
      padding: const EdgeInsets.all(DhenuSpacing.xl),
      elevated: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(l.farmerRateFlatRateLabel, style: DhenuText.caption.copyWith(color: t.inkSoft)),
          const SizedBox(height: DhenuSpacing.sm),
          Text(
            '${rupees(chart.flatRatePerLitre ?? 0, paise: true)} / L',
            style: DhenuText.hero.copyWith(color: t.ink),
          ),
        ],
      ),
    );
  }

  Widget _ruleTile(BuildContext context, DhenuTokens t, AppLocalizations l, MpRateRule rule) {
    final label = _ruleLabel(l, rule);
    return Padding(
      padding: const EdgeInsets.only(bottom: DhenuSpacing.sm),
      child: Row(
        children: [
          Icon(DhenuIcons.plusCircle, color: t.gradeA, size: 20),
          const SizedBox(width: DhenuSpacing.md),
          Expanded(child: Text(label, style: DhenuText.body.copyWith(color: t.ink))),
          Text(
            '+ ${rupees(rule.bonusPerLitre, paise: true)}/L',
            style: DhenuText.label.copyWith(color: t.gradeA),
          ),
        ],
      ),
    );
  }

  String _ruleLabel(AppLocalizations l, MpRateRule rule) {
    if (rule.ruleType == 'grade' && rule.grade != null) {
      return l.farmerRateRuleGradeBonus(rule.grade!.toUpperCase());
    }
    if (rule.ruleType == 'volume') {
      final min = rule.minQty?.toStringAsFixed(0) ?? '0';
      final max = rule.maxQty?.toStringAsFixed(0);
      return max != null
          ? l.farmerRateRuleVolumeRange(min, max)
          : l.farmerRateRuleVolumeMin(min);
    }
    return rule.ruleType;
  }
}
