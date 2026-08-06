import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/farmer_providers.dart';
import '../../providers/mp_context_provider.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/friendly_error.dart';
import '../../widgets/dhenu_states.dart';
import '../shared/qc_report_view.dart';

/// The farmer's own QC trend — qty-weighted FAT/SNF/Water over 7/14/90 days.
/// Reuses the [QcReportView] the VMCC and CC reports are built on, fed by the
/// farmer-scoped server rollup, so the farmer sees the same numbers their centre
/// does. Quality sets their rate, so this is the money screen behind the rate
/// chart.
class FarmerQcReport extends ConsumerStatefulWidget {
  const FarmerQcReport({super.key});

  @override
  ConsumerState<FarmerQcReport> createState() => _FarmerQcReportState();
}

class _FarmerQcReportState extends ConsumerState<FarmerQcReport> {
  int _days = 7;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final poursAsync = ref.watch(farmerQcPoursProvider(_days));
    final farmer = ref.watch(mpViewAsFarmerProvider);
    // Colour the daily cells against the farmer's own milk type; bands are the
    // tenant defaults (a farmer has no node scope of their own).
    final bands = ref.watch(qualityBandsProvider(null)).valueOrNull;
    return Scaffold(
      backgroundColor: t.surface,
      appBar: AppBar(title: Text(l.farmerQcTitle, style: DhenuText.h2.copyWith(color: t.ink))),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(
              DhenuSpacing.screen, DhenuSpacing.md, DhenuSpacing.screen, DhenuSpacing.sm),
          child: _rangeSelector(t, l),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () async => ref.invalidate(farmerQcPoursProvider(_days)),
            // Every branch stays scrollable so pull-to-refresh keeps working.
            child: poursAsync.when(
              loading: () => ListView(children: const [DhenuLoadingList()]),
              error: (e, _) => ListView(children: [
                const SizedBox(height: 72),
                DhenuEmptyState(
                    icon: DhenuIcons.cloudOff,
                    title: l.qcReportLoadError,
                    subtitle: friendlyError(context, e)),
              ]),
              // One sample per pour — QcReportView buckets them into
              // qty-weighted days, so AM and PM combine by litres, not by count.
              data: (pours) => QcReportView(
                samples: [
                  for (final p in pours)
                    (date: p.collectionDate, qty: p.qtyLitres, fat: p.fat, snf: p.snf, water: p.water),
                ],
                days: _days,
                heroLabel: l.farmerQcHeroLabel(_days),
                heroFooter: l.farmerQcFooter,
                emptyTitle: l.qcReportEmptyTitle,
                emptySubtitle: l.farmerQcEmptySubtitle,
                bands: bands,
                milkType: farmer?.defaultMilkType,
              ),
            ),
          ),
        ),
      ]),
    );
  }

  Widget _rangeSelector(DhenuTokens t, AppLocalizations l) => Row(children: [
        for (final d in const [7, 14, 90]) ...[
          Expanded(child: _rangeChip(t, l, d)),
          if (d != 90) const SizedBox(width: DhenuSpacing.sm),
        ],
      ]);

  Widget _rangeChip(DhenuTokens t, AppLocalizations l, int d) {
    final on = _days == d;
    return GestureDetector(
      onTap: () => setState(() => _days = d),
      child: Container(
        height: 38,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: on ? t.brand : t.inputFill,
          borderRadius: BorderRadius.circular(DhenuRadii.input),
          border: Border.all(color: on ? t.brand : t.hairline),
        ),
        child: Text(l.qcReportDaysChip(d),
            style: DhenuText.label.copyWith(color: on ? Colors.white : t.inkSoft)),
      ),
    );
  }
}
