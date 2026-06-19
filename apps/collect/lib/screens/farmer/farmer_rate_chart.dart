import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../providers/farmer_providers.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../widgets/audio_play.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_states.dart';

/// Rate chart screen — FAT×SNF matrix or flat rate, with the farmer's last
/// pour cell highlighted (spec §6.1).
class FarmerRateChart extends ConsumerWidget {
  const FarmerRateChart({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    final detailAsync = ref.watch(activeRateChartDetailProvider);
    final monthPours = ref.watch(farmerMonthPoursProvider).asData?.value ?? [];
    final lastRate = ref.watch(farmerLastRateResolutionProvider).asData?.value;

    final lastPour = monthPours.isNotEmpty
        ? monthPours.reduce((a, b) =>
            a.collectionDate.compareTo(b.collectionDate) >= 0 ? a : b)
        : null;

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
            detail?.chart.name ?? 'Rate Chart',
            style: DhenuText.h2.copyWith(color: t.ink),
          ),
          orElse: () => Text('Rate Chart', style: DhenuText.h2.copyWith(color: t.ink)),
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: DhenuSpacing.md),
            child: AudioPlay(
              speak: lastRate == null
                  ? 'Your milk rate chart'
                  : 'Your rate is ${lastRate.ratePerLitre.toStringAsFixed(1)} rupees per litre',
              size: 22,
            ),
          ),
        ],
      ),
      body: detailAsync.when(
        loading: () => const DhenuLoadingList(),
        error: (e, _) => DhenuErrorState(
          onRetry: () => ref.invalidate(activeRateChartDetailProvider),
        ),
        data: (detail) {
          if (detail == null) {
            return const DhenuEmptyState(
              icon: DhenuIcons.grid,
              title: 'No rate chart active',
              subtitle: 'Contact your milk collection centre',
            );
          }
          return _RateChartBody(
            detail: detail,
            lastPour: lastPour,
            lastRate: lastRate,
          );
        },
      ),
    );
  }
}

class _RateChartBody extends StatelessWidget {
  const _RateChartBody({
    required this.detail,
    required this.lastPour,
    required this.lastRate,
  });

  final MpRateChartDetail detail;
  final MpPour? lastPour;
  final MpRateResolution? lastRate;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final chart = detail.chart;
    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(
        DhenuSpacing.screen,
        DhenuSpacing.lg,
        DhenuSpacing.screen,
        DhenuSpacing.x4,
      ),
      children: [
        _header(context, t, chart),
        const SizedBox(height: DhenuSpacing.lg),
        if (lastPour != null && lastRate != null) ...[
          _lastPourCard(context, t),
          const SizedBox(height: DhenuSpacing.lg),
        ],
        if (chart.pricingMode == 'flat')
          _flatRate(t, chart)
        else ...[
          Text('Rate Matrix (₹/L)', style: DhenuText.title.copyWith(color: t.ink)),
          const SizedBox(height: DhenuSpacing.sm),
          RateMatrix(
            cells: detail.cells,
            lastFat: lastPour?.fat,
            lastSnf: lastPour?.snf,
          ),
        ],
        if (detail.rules.isNotEmpty) ...[
          const SizedBox(height: DhenuSpacing.xxl),
          Text('Bonuses & Slabs', style: DhenuText.title.copyWith(color: t.ink)),
          const SizedBox(height: DhenuSpacing.sm),
          ...detail.rules.map((r) => _ruleTile(context, t, r)),
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
                  'From ${prettyDate(chart.effectiveFrom!)}',
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

  Widget _lastPourCard(BuildContext context, DhenuTokens t) {
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
                    'Your last pour',
                    style: DhenuText.label.copyWith(color: t.brand),
                  ),
                  const SizedBox(height: DhenuSpacing.xs),
                  Text(
                    'FAT ${oneDp(lastPour!.fat ?? 0)} · '
                    'SNF ${oneDp(lastPour!.snf ?? 0)} → '
                    '${rupees(lastRate!.ratePerLitre, paise: true)}/L',
                    style: DhenuText.body.copyWith(color: t.ink),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _flatRate(DhenuTokens t, MpRateChart chart) {
    return DhenuCard(
      padding: const EdgeInsets.all(DhenuSpacing.xl),
      elevated: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('FLAT RATE', style: DhenuText.caption.copyWith(color: t.inkSoft)),
          const SizedBox(height: DhenuSpacing.sm),
          Text(
            '${rupees(chart.flatRatePerLitre ?? 0, paise: true)} / L',
            style: DhenuText.hero.copyWith(color: t.ink),
          ),
        ],
      ),
    );
  }

  Widget _ruleTile(BuildContext context, DhenuTokens t, MpRateRule rule) {
    final label = _ruleLabel(rule);
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

  String _ruleLabel(MpRateRule rule) {
    if (rule.ruleType == 'grade' && rule.grade != null) {
      return 'Grade-${rule.grade!.toUpperCase()} bonus';
    }
    if (rule.ruleType == 'volume') {
      final min = rule.minQty?.toStringAsFixed(0) ?? '0';
      final max = rule.maxQty?.toStringAsFixed(0);
      return max != null ? 'Volume $min–$max L' : 'Volume > $min L';
    }
    return rule.ruleType;
  }
}

/// FAT × SNF rate matrix — highlights the cell closest to [lastFat]/[lastSnf].
/// Extracted to keep FarmerRateChart under 500 lines.
class RateMatrix extends StatelessWidget {
  const RateMatrix({
    super.key,
    required this.cells,
    required this.lastFat,
    required this.lastSnf,
  });

  final List<MpRateCell> cells;
  final double? lastFat;
  final double? lastSnf;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    if (cells.isEmpty) {
      return Text('No matrix data', style: DhenuText.body.copyWith(color: t.inkSoft));
    }
    final fatVals = cells.map((c) => c.fat).toSet().toList()..sort();
    final snfVals = cells.map((c) => c.snf).toSet().toList()..sort();
    final highlighted = _findNearest();

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          // SNF header row
          Row(children: [
            _headerCell(t, 'FAT↓ SNF→'),
            ...snfVals.map((s) => _headerCell(t, oneDp(s))),
          ]),
          // FAT rows
          ...fatVals.map((f) {
            return Row(children: [
              _headerCell(t, oneDp(f)),
              ...snfVals.map((s) {
                final cell = cells.firstWhere(
                  (c) => c.fat == f && c.snf == s,
                  orElse: () => MpRateCell(id: '', fat: f, snf: s, ratePerLitre: 0),
                );
                final isHighlighted = highlighted != null &&
                    highlighted.fat == f &&
                    highlighted.snf == s;
                return _dataCell(t, cell.ratePerLitre, isHighlighted);
              }),
            ]);
          }),
        ],
      ),
    );
  }

  Widget _headerCell(DhenuTokens t, String text) => Container(
        width: 72,
        height: 40,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: t.hairline,
          border: Border.all(color: t.hairline),
        ),
        child: Text(
          text,
          style: DhenuText.caption.copyWith(color: t.inkSoft),
          overflow: TextOverflow.ellipsis,
        ),
      );

  Widget _dataCell(DhenuTokens t, double rate, bool highlighted) => Container(
        width: 72,
        height: 48,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: highlighted ? t.brandSubtle : t.card,
          border: highlighted
              ? Border.all(color: t.brand, width: 2)
              : Border.all(color: t.hairline),
        ),
        child: Text(
          rupees(rate),
          style: DhenuText.number(
            size: 13,
            color: highlighted ? t.brand : t.ink,
          ),
        ),
      );

  MpRateCell? _findNearest() {
    if (lastFat == null || lastSnf == null || cells.isEmpty) return null;
    return cells.reduce((a, b) {
      final da = (a.fat - lastFat!).abs() + (a.snf - lastSnf!).abs();
      final db = (b.fat - lastFat!).abs() + (b.snf - lastSnf!).abs();
      return da <= db ? a : b;
    });
  }
}
