import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../api/mp_repo.dart';
import '../../l10n/app_localizations.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_states.dart';
import '../farmer/rate_chart_tables.dart';

/// Every active rate chart (detail), matrices/CLR first then flat rates — the
/// order a CC operator reads the pricing board in.
final activeRateChartsProvider = FutureProvider<List<MpRateChartDetail>>((ref) async {
  final charts = await mpRepo.rateCharts(limit: 100);
  final active = charts.where((c) => c.isActive).toList();
  final details = await Future.wait(active.map((c) => mpRepo.rateChart(c.id)));
  final list = details.whereType<MpRateChartDetail>().toList();
  list.sort((a, b) => _order(a.chart.pricingMode).compareTo(_order(b.chart.pricingMode)));
  return list;
});

int _order(String mode) => mode == 'flat' ? 1 : 0;

/// CC-mode read-only view of the VMCC pricing board: every active rate chart,
/// each rendered by pricing mode (FAT×SNF matrix, CLR table, or flat rate).
/// No last-pour highlight — the CC has no single farmer context.
class CcRateCharts extends ConsumerWidget {
  const CcRateCharts({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final async = ref.watch(activeRateChartsProvider);
    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(activeRateChartsProvider);
        await ref.read(activeRateChartsProvider.future);
      },
      child: async.when(
        loading: () => const DhenuLoadingList(),
        error: (e, _) => DhenuErrorState(onRetry: () => ref.invalidate(activeRateChartsProvider)),
        data: (charts) => charts.isEmpty
            ? DhenuEmptyState(
                icon: DhenuIcons.grid,
                title: l.ccRateChartsEmptyTitle,
                subtitle: l.ccRateChartsEmptySubtitle,
              )
            : ListView(
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                padding: const EdgeInsets.fromLTRB(
                    DhenuSpacing.screen, DhenuSpacing.lg, DhenuSpacing.screen, DhenuSpacing.x4),
                children: [
                  for (final d in charts)
                    Padding(
                      padding: const EdgeInsets.only(bottom: DhenuSpacing.lg),
                      child: _ChartCard(detail: d),
                    ),
                ],
              ),
      ),
    );
  }
}

class _ChartCard extends StatelessWidget {
  const _ChartCard({required this.detail});
  final MpRateChartDetail detail;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final chart = detail.chart;
    return DhenuCard(
      padding: const EdgeInsets.all(DhenuSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          _header(t, l, chart),
          const SizedBox(height: DhenuSpacing.md),
          _body(t, l),
        ],
      ),
    );
  }

  Widget _header(DhenuTokens t, AppLocalizations l, MpRateChart chart) {
    final meta = <String>[
      if (chart.effectiveFrom != null) l.farmerRateEffectiveFrom(prettyDate(chart.effectiveFrom!)),
      if (chart.season != null) chart.season!,
    ].join(' · ');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(children: [
          Expanded(child: Text(chart.name, style: DhenuText.title.copyWith(color: t.ink))),
          const SizedBox(width: DhenuSpacing.sm),
          _milkPill(t, chart.milkType),
        ]),
        if (meta.isNotEmpty) ...[
          const SizedBox(height: DhenuSpacing.xs),
          Text(meta, style: DhenuText.caption.copyWith(color: t.inkSoft)),
        ],
      ],
    );
  }

  Widget _milkPill(DhenuTokens t, MilkType type) => Container(
        padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.sm, vertical: 3),
        decoration: BoxDecoration(
          color: t.brandSubtle,
          borderRadius: BorderRadius.circular(DhenuRadii.pill),
        ),
        child: Text(milkTypeLabel(type), style: DhenuText.label.copyWith(color: t.brand)),
      );

  Widget _body(DhenuTokens t, AppLocalizations l) {
    final chart = detail.chart;
    if (chart.pricingMode == 'flat') return _flatRate(t, l, chart);
    if (chart.pricingMode == 'clr') {
      return ClrRateTable(cells: detail.cells, lastClr: null);
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(l.farmerRateMatrixTitle, style: DhenuText.caption.copyWith(color: t.inkSoft)),
        const SizedBox(height: DhenuSpacing.sm),
        RateMatrix(cells: detail.cells, lastFat: null, lastSnf: null),
      ],
    );
  }

  Widget _flatRate(DhenuTokens t, AppLocalizations l, MpRateChart chart) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(DhenuSpacing.lg),
        decoration: BoxDecoration(
          color: t.brandSubtle,
          borderRadius: BorderRadius.circular(DhenuRadii.card),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(l.farmerRateFlatRateLabel, style: DhenuText.caption.copyWith(color: t.inkSoft)),
            const SizedBox(height: DhenuSpacing.xs),
            Text('${rupees(chart.flatRatePerLitre ?? 0, paise: true)} / L',
                style: DhenuText.h2.copyWith(color: t.ink)),
          ],
        ),
      );
}
