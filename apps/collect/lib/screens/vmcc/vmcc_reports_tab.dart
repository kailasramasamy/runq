import 'package:flutter/material.dart';
import '../../theme/dhenu_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/mp_context_provider.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../widgets/date_stepper.dart';
import '../../widgets/dhenu_states.dart';
import '../../widgets/quality_badge.dart';
import '../../widgets/hero_number_card.dart';
import '../../widgets/stat_card.dart';
import 'vmcc_qc_report.dart';

/// VMCC Reports — a [Summary | QC] toggle over two reports: a per-date collection
/// summary and the windowed QC trend chart.
class VmccReportsTab extends StatefulWidget {
  const VmccReportsTab({super.key, required this.node});
  final MpNode node;

  @override
  State<VmccReportsTab> createState() => _VmccReportsTabState();
}

enum _Mode { summary, qc }

class _VmccReportsTabState extends State<VmccReportsTab> {
  _Mode _mode = _Mode.summary;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    return Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(
            DhenuSpacing.screen, DhenuSpacing.md, DhenuSpacing.screen, 0),
        child: _modeBar(t, l),
      ),
      Expanded(
        child: _mode == _Mode.summary
            ? _SummaryView(node: widget.node)
            : VmccQcReport(node: widget.node),
      ),
    ]);
  }

  Widget _modeBar(DhenuTokens t, AppLocalizations l) => Container(
        decoration: BoxDecoration(
            color: t.hairline, borderRadius: BorderRadius.circular(DhenuRadii.pill)),
        padding: const EdgeInsets.all(3),
        child: Row(children: [
          _seg(t, _Mode.summary, l.reportsTabSummary),
          _seg(t, _Mode.qc, l.reportsTabQc),
        ]),
      );

  Widget _seg(DhenuTokens t, _Mode m, String label) {
    final on = _mode == m;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _mode = m),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          height: 38,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: on ? t.surface : Colors.transparent,
            borderRadius: BorderRadius.circular(DhenuRadii.pill),
          ),
          child: Text(label,
              style: DhenuText.label.copyWith(
                  color: on ? t.brand : t.inkSoft,
                  fontWeight: on ? FontWeight.w700 : FontWeight.w600)),
        ),
      ),
    );
  }
}

/// Collection summary for a chosen date (defaults to today), via the date stepper.
class _SummaryView extends ConsumerStatefulWidget {
  const _SummaryView({required this.node});
  final MpNode node;

  @override
  ConsumerState<_SummaryView> createState() => _SummaryViewState();
}

class _SummaryViewState extends ConsumerState<_SummaryView> {
  String _date = todayIso();

  NodeDateKey get _key => (nodeId: widget.node.id, date: _date);

  Future<void> _refresh() async {
    ref.invalidate(nodeSummaryForDateProvider(_key));
    await ref.read(nodeSummaryForDateProvider(_key).future);
  }

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final summaryAsync = ref.watch(nodeSummaryForDateProvider(_key));
    final bands = ref.watch(qualityBandsProvider(widget.node.id)).valueOrNull;
    return RefreshIndicator(
      onRefresh: _refresh,
      child: ListView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.fromLTRB(
            DhenuSpacing.screen, DhenuSpacing.md, DhenuSpacing.screen, DhenuSpacing.x4),
        children: [
          DateStepper(
            date: _date,
            todayLabel: l.commonToday,
            onChanged: (d) => setState(() => _date = d),
          ),
          const SizedBox(height: DhenuSpacing.md),
          summaryAsync.when(
            loading: () => const DhenuLoadingList(rows: 3),
            error: (e, _) => DhenuEmptyState(
              icon: DhenuIcons.cloudOff,
              title: l.reportsCouldNotLoadSummary,
              subtitle: '$e',
            ),
            data: (s) => s == null || s.totalQty <= 0
                ? DhenuEmptyState(icon: DhenuIcons.drop, title: l.reportsNoCollectionToday)
                : _summaryBody(context, t, s, bands),
          ),
        ],
      ),
    );
  }

  Widget _summaryBody(BuildContext context, DhenuTokens t, MpCollectionSummary s, QualityBands? bands) {
    final l = AppLocalizations.of(context);
    return Column(children: [
      HeroNumberCard(
        label: l.reportsTotalCollected,
        primaryValue: litres(s.totalQty, unit: true),
        footer: Text(
          l.reportsFarmersPoursStat(s.farmerCount, s.pourCount),
          style: DhenuText.body.copyWith(color: t.inkSoft),
        ),
      ),
      const SizedBox(height: DhenuSpacing.md),
      _statsGrid(context, t, s, bands),
    ]);
  }

  Widget _statsGrid(BuildContext context, DhenuTokens t, MpCollectionSummary s, QualityBands? bands) {
    final l = AppLocalizations.of(context);
    final milkType = widget.node.effectiveMilkType;
    final fatColor = QualityBadge.bandColor(bands, milkType, 'fat', s.avgFat, t) ?? t.brand;
    final snfColor = QualityBadge.bandColor(bands, milkType, 'snf', s.avgSnf, t) ?? t.brand;
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisSpacing: DhenuSpacing.md,
      mainAxisSpacing: DhenuSpacing.md,
      childAspectRatio: 2.0,
      children: [
        DhenuStatCard(label: l.reportsStatAmLabel, value: litres(s.amQty, unit: true), valueColor: t.am),
        DhenuStatCard(label: l.reportsStatPmLabel, value: litres(s.pmQty, unit: true), valueColor: t.pm),
        DhenuStatCard(label: l.reportsStatAvgFat, value: '${oneDp(s.avgFat)} %', valueColor: fatColor),
        DhenuStatCard(label: l.reportsStatAvgSnf, value: '${oneDp(s.avgSnf)} %', valueColor: snfColor),
        if (s.avgWater > 0)
          DhenuStatCard(label: l.reportsStatAvgWater, value: '${oneDp(s.avgWater)} %', valueColor: t.brand),
        DhenuStatCard(label: l.reportsStatFarmers, value: '${s.farmerCount}', valueColor: t.ink),
        DhenuStatCard(label: l.reportsStatGross, value: rupees(s.grossAmount), valueColor: t.gradeA),
      ],
    );
  }
}
