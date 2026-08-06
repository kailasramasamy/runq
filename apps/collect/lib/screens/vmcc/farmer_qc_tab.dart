import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/mp_context_provider.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../widgets/dhenu_states.dart';
import '../shared/qc_report_view.dart';

/// Farmer QC tab — the same windowed FAT/SNF/Water quality report as the VMCC
/// QC screen, locked to this one farmer. Reuses [QcReportView] over the
/// server-side per-day rollup (scoped by farmerId), with a 7/14/90-day range.
class FarmerQcTab extends ConsumerStatefulWidget {
  const FarmerQcTab({super.key, required this.node, required this.farmer});

  final MpNode node;
  final MpFarmer farmer;

  @override
  ConsumerState<FarmerQcTab> createState() => _FarmerQcTabState();
}

class _FarmerQcTabState extends ConsumerState<FarmerQcTab> {
  int _days = 7;

  PoursDailyKey get _key =>
      (nodeId: widget.node.id, days: _days, farmerId: widget.farmer.id);

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final daysAsync = ref.watch(nodePoursDailyProvider(_key));
    final bands = ref.watch(qualityBandsProvider(widget.node.id)).valueOrNull;
    return Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(
            DhenuSpacing.screen, DhenuSpacing.md, DhenuSpacing.screen, DhenuSpacing.sm),
        child: _rangeSelector(t, l),
      ),
      Expanded(
        child: RefreshIndicator(
          onRefresh: () async => ref.invalidate(nodePoursDailyProvider(_key)),
          child: daysAsync.when(
            // Every branch stays scrollable so the RefreshIndicator works and a
            // short box never overflows the non-scrolling skeleton/empty.
            loading: () => ListView(children: const [DhenuLoadingList()]),
            error: (e, _) => ListView(children: [
              const SizedBox(height: 72),
              DhenuEmptyState(
                  icon: DhenuIcons.cloudOff, title: l.qcReportLoadError, subtitle: '$e'),
            ]),
            data: (days) => _report(days, bands, l),
          ),
        ),
      ),
    ]);
  }

  Widget _report(List<MpPourDay> days, QualityBands? bands, AppLocalizations l) => QcReportView(
        samples: [
          for (final d in days)
            (date: d.date, qty: d.totalQty, fat: d.fat, snf: d.snf, water: d.water),
        ],
        days: _days,
        heroLabel: l.qcReportHeroLabelDays(_days),
        heroFooter: l.qcReportFooterFarmer,
        emptyTitle: l.qcReportEmptyTitle,
        emptySubtitle: l.qcReportEmptySubtitle,
        bands: bands,
        milkType: widget.farmer.defaultMilkType,
      );

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
