import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/mp_context_provider.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_states.dart';
import '../shared/qc_report_view.dart';
import 'farmer_picker.dart';

enum _Scope { all, farmer }

/// VMCC QC report — qty-weighted FAT/SNF/Water trends over a 7/14/90-day window,
/// pooled across all farmers or scoped to a single one. Reuses the shared
/// [QcReportView] over a server-side per-day rollup so 90 days stays cheap.
///
/// A VMCC whose farmers aren't tracked — the CC keys its arrivals by hand —
/// gets the pooled trend only: with no farmer to name, an All / Per-farmer
/// choice offers one real option and one dead end.
class VmccQcReport extends ConsumerStatefulWidget {
  const VmccQcReport({super.key, required this.node});
  final MpNode node;

  @override
  ConsumerState<VmccQcReport> createState() => _VmccQcReportState();
}

class _VmccQcReportState extends ConsumerState<VmccQcReport> {
  int _days = 7;
  _Scope _scope = _Scope.all;
  MpFarmer? _farmer;

  PoursDailyKey get _key => (
        nodeId: widget.node.id,
        days: _days,
        farmerId: _scope == _Scope.farmer ? _farmer?.id : null,
      );

  /// The pooled rollup blends the CC's manual receipts; a farmer-scoped one is
  /// pour-only by design (a receipt names no farmer), which is the other half
  /// of why the per-farmer view is withheld from a node that has none.

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final daysAsync = ref.watch(nodePoursDailyProvider(_key));
    final bands = ref.watch(qualityBandsProvider(widget.node.id)).valueOrNull;
    // Hidden while the roster is still loading too, so the control never
    // appears and then vanishes on the nodes it doesn't apply to.
    final farmers = ref.watch(nodeFarmersProvider(widget.node.id)).valueOrNull;
    final perFarmerAvailable = farmers != null && farmers.isNotEmpty;
    final scope = perFarmerAvailable ? _scope : _Scope.all;
    return Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(
            DhenuSpacing.screen, DhenuSpacing.md, DhenuSpacing.screen, DhenuSpacing.sm),
        child: Column(children: [
          if (perFarmerAvailable) ...[
            _scopeBar(t, l),
            const SizedBox(height: DhenuSpacing.sm),
          ],
          _rangeSelector(t, l),
          if (scope == _Scope.farmer) ...[
            const SizedBox(height: DhenuSpacing.sm),
            _farmerField(t, l),
          ],
        ]),
      ),
      Expanded(
        child: RefreshIndicator(
          onRefresh: () async => ref.invalidate(nodePoursDailyProvider(_key)),
          child: scope == _Scope.farmer && _farmer == null
              ? _prompt(l)
              : daysAsync.when(
                  // Keep every branch scrollable so the RefreshIndicator works and
                  // a short box never overflows the non-scrolling skeleton/empty.
                  loading: () => ListView(children: const [DhenuLoadingList()]),
                  error: (e, _) => ListView(children: [
                    const SizedBox(height: 72),
                    DhenuEmptyState(
                        icon: DhenuIcons.cloudOff, title: l.qcReportLoadError, subtitle: '$e'),
                  ]),
                  data: (days) => _report(days, bands, l, scope),
                ),
        ),
      ),
    ]);
  }

  Widget _report(
      List<MpPourDay> days, QualityBands? bands, AppLocalizations l, _Scope scope) {
    final perFarmer = scope == _Scope.farmer;
    return QcReportView(
      samples: [
        for (final d in days)
          (date: d.date, qty: d.totalQty, fat: d.fat, snf: d.snf, water: d.water),
      ],
      days: _days,
      heroLabel: perFarmer
          ? l.qcReportHeroLabelFarmer(_farmer!.name.toUpperCase(), _days)
          : l.qcReportHeroLabelAll(_days),
      heroFooter: perFarmer ? l.qcReportFooterFarmer : l.qcReportFooterAll,
      emptyTitle: l.qcReportEmptyTitle,
      emptySubtitle: l.qcReportEmptySubtitle,
      bands: bands,
      milkType: widget.node.effectiveMilkType,
    );
  }

  Widget _prompt(AppLocalizations l) => ListView(children: [
        const SizedBox(height: 72),
        DhenuEmptyState(
          icon: DhenuIcons.userSearch,
          title: l.qcReportSelectFarmerTitle,
          subtitle: l.qcReportSelectFarmerSubtitle,
        ),
      ]);

  Widget _scopeBar(DhenuTokens t, AppLocalizations l) => Container(
        decoration: BoxDecoration(
            color: t.hairline, borderRadius: BorderRadius.circular(DhenuRadii.pill)),
        padding: const EdgeInsets.all(3),
        child: Row(children: [
          _scopeSeg(t, _Scope.all, l.qcReportScopeAll),
          _scopeSeg(t, _Scope.farmer, l.qcReportScopePerFarmer),
        ]),
      );

  Widget _scopeSeg(DhenuTokens t, _Scope s, String label) {
    final on = _scope == s;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _scope = s),
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

  Widget _farmerField(DhenuTokens t, AppLocalizations l) => DhenuCard(
        padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.md),
        onTap: () async {
          final picked = await showFarmerPicker(context, ref, widget.node.id);
          if (picked != null) setState(() => _farmer = picked);
        },
        child: Row(children: [
          Icon(DhenuIcons.userSearch, size: 18, color: t.brand),
          const SizedBox(width: DhenuSpacing.sm),
          Expanded(
              child: Text(_farmer?.name ?? l.qcReportSelectFarmerTitle,
                  style: DhenuText.body.copyWith(
                      color: _farmer == null ? t.inkSoft : t.ink, fontWeight: FontWeight.w600))),
          Icon(DhenuIcons.chevronDown, size: 18, color: t.inkSoft),
        ]),
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
