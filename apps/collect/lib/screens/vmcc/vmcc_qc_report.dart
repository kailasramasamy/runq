import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../providers/mp_context_provider.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_states.dart';
import '../cc/qc_report_view.dart';
import 'farmer_picker.dart';

enum _Scope { all, farmer }

/// VMCC QC report — qty-weighted FAT/SNF/Water trends over a 7/14/90-day window,
/// pooled across all farmers or scoped to a single one. Reuses the shared
/// [QcReportView] over a server-side per-day rollup so 90 days stays cheap.
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

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final daysAsync = ref.watch(nodePoursDailyProvider(_key));
    return Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(
            DhenuSpacing.screen, DhenuSpacing.md, DhenuSpacing.screen, DhenuSpacing.sm),
        child: Column(children: [
          _scopeBar(t),
          const SizedBox(height: DhenuSpacing.sm),
          _rangeSelector(t),
          if (_scope == _Scope.farmer) ...[
            const SizedBox(height: DhenuSpacing.sm),
            _farmerField(t),
          ],
        ]),
      ),
      Expanded(
        child: RefreshIndicator(
          onRefresh: () async => ref.invalidate(nodePoursDailyProvider(_key)),
          child: _scope == _Scope.farmer && _farmer == null
              ? _prompt()
              : daysAsync.when(
                  // Keep every branch scrollable so the RefreshIndicator works and
                  // a short box never overflows the non-scrolling skeleton/empty.
                  loading: () => ListView(children: const [DhenuLoadingList()]),
                  error: (e, _) => ListView(children: [
                    const SizedBox(height: 72),
                    DhenuEmptyState(
                        icon: DhenuIcons.cloudOff, title: 'Could not load QC data', subtitle: '$e'),
                  ]),
                  data: (days) => _report(days),
                ),
        ),
      ),
    ]);
  }

  Widget _report(List<MpPourDay> days) {
    final perFarmer = _scope == _Scope.farmer;
    return QcReportView(
      samples: [
        for (final d in days)
          (date: d.date, qty: d.totalQty, fat: d.fat, snf: d.snf, water: d.water),
      ],
      days: _days,
      heroLabel: perFarmer
          ? '${_farmer!.name.toUpperCase()} · LAST $_days DAYS'
          : 'COLLECTED · LAST $_days DAYS',
      heroFooter: perFarmer
          ? 'Qty-weighted quality for this farmer'
          : 'Qty-weighted quality across all farmers',
      emptyTitle: 'No readings in this window',
      emptySubtitle: 'Record collections to see the daily QC trend',
    );
  }

  Widget _prompt() => ListView(children: const [
        SizedBox(height: 72),
        DhenuEmptyState(
          icon: DhenuIcons.userSearch,
          title: 'Select a farmer',
          subtitle: 'Pick a farmer to see their quality trend',
        ),
      ]);

  Widget _scopeBar(DhenuTokens t) => Container(
        decoration: BoxDecoration(
            color: t.hairline, borderRadius: BorderRadius.circular(DhenuRadii.pill)),
        padding: const EdgeInsets.all(3),
        child: Row(children: [
          _scopeSeg(t, _Scope.all, 'All farmers'),
          _scopeSeg(t, _Scope.farmer, 'Per farmer'),
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

  Widget _farmerField(DhenuTokens t) => DhenuCard(
        padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.md),
        onTap: () async {
          final picked = await showFarmerPicker(context, ref, widget.node.id);
          if (picked != null) setState(() => _farmer = picked);
        },
        child: Row(children: [
          Icon(DhenuIcons.userSearch, size: 18, color: t.brand),
          const SizedBox(width: DhenuSpacing.sm),
          Expanded(
              child: Text(_farmer?.name ?? 'Select a farmer',
                  style: DhenuText.body.copyWith(
                      color: _farmer == null ? t.inkSoft : t.ink, fontWeight: FontWeight.w600))),
          Icon(DhenuIcons.chevronDown, size: 18, color: t.inkSoft),
        ]),
      );

  Widget _rangeSelector(DhenuTokens t) => Row(children: [
        for (final d in const [7, 14, 90]) ...[
          Expanded(child: _rangeChip(t, d)),
          if (d != 90) const SizedBox(width: DhenuSpacing.sm),
        ],
      ]);

  Widget _rangeChip(DhenuTokens t, int d) {
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
        child: Text('$d days',
            style: DhenuText.label.copyWith(color: on ? Colors.white : t.inkSoft)),
      ),
    );
  }
}
