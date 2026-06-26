import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../providers/mp_context_provider.dart';
import '../../providers/transfer_providers.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../widgets/date_stepper.dart';
import '../../widgets/dhenu_states.dart';
import '../../widgets/hero_number_card.dart';
import '../../widgets/quality_badge.dart';
import '../../widgets/stat_card.dart';
import 'qc_report_view.dart';

/// CC daily report — milk received at the CC on a chosen date (defaults to
/// today), selectable via the date stepper. Mirrors the VMCC report but over
/// received consignments: total, AM/PM split, qty-weighted FAT/SNF/Water and the
/// number of source VMCCs.
class CcReportTab extends ConsumerStatefulWidget {
  const CcReportTab({super.key, required this.node});
  final MpNode node;

  @override
  ConsumerState<CcReportTab> createState() => _CcReportTabState();
}

class _CcReportTabState extends ConsumerState<CcReportTab> {
  String _date = todayIso();

  ReceivedDayArgs get _key => (nodeId: widget.node.id, date: _date);

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final rowsAsync = ref.watch(nodeReceivedDayDetailProvider(_key));
    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(nodeReceivedDayDetailProvider(_key));
        await ref.read(nodeReceivedDayDetailProvider(_key).future);
      },
      child: ListView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.fromLTRB(
            DhenuSpacing.screen, DhenuSpacing.lg, DhenuSpacing.screen, DhenuSpacing.x4),
        children: [
          DateStepper(date: _date, onChanged: (d) => setState(() => _date = d)),
          const SizedBox(height: DhenuSpacing.md),
          rowsAsync.when(
            loading: () => const DhenuLoadingList(rows: 3),
            error: (e, _) => DhenuEmptyState(
              icon: DhenuIcons.cloudOff,
              title: 'Could not load the report',
              subtitle: '$e',
            ),
            data: (rows) {
              final bands = ref.watch(qualityBandsProvider(widget.node.id)).valueOrNull ?? QualityBands.empty;
              return rows.isEmpty
                  ? const DhenuEmptyState(
                      icon: DhenuIcons.drop,
                      title: 'No milk received on this date',
                    )
                  : _body(t, rows, bands);
            },
          ),
        ],
      ),
    );
  }

  Widget _body(DhenuTokens t, List<MpConsignment> rows, QualityBands bands) {
    final acc = QcAcc();
    var amQty = 0.0, pmQty = 0.0;
    final sources = <String>{};
    for (final c in rows) {
      final q = c.receiptQty ?? 0;
      acc.add(q, c.receiptFat, c.receiptSnf, c.receiptWater);
      if (c.shift == Shift.am) amQty += q;
      if (c.shift == Shift.pm) pmQty += q;
      sources.add(c.fromNodeId);
    }
    return Column(children: [
      HeroNumberCard(
        label: 'Total received',
        primaryValue: litres(acc.qty, unit: true),
        footer: Text(
          '${sources.length} VMCCs · ${rows.length} receipts',
          style: DhenuText.body.copyWith(color: t.inkSoft),
        ),
      ),
      const SizedBox(height: DhenuSpacing.md),
      _statsGrid(t, acc, amQty, pmQty, sources.length, bands),
    ]);
  }

  Widget _statsGrid(DhenuTokens t, QcAcc acc, double amQty, double pmQty, int sources, QualityBands bands) {
    String pct(double? v) => v == null ? '—' : '${oneDp(v)} %';
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisSpacing: DhenuSpacing.md,
      mainAxisSpacing: DhenuSpacing.md,
      childAspectRatio: 2.0,
      children: [
        DhenuStatCard(label: 'AM', value: litres(amQty, unit: true), valueColor: t.am),
        DhenuStatCard(label: 'PM', value: litres(pmQty, unit: true), valueColor: t.pm),
        DhenuStatCard(
          label: 'AVG FAT', value: pct(acc.avgFat),
          valueColor: QualityBadge.bandColor(bands, widget.node.effectiveMilkType, 'fat', acc.avgFat, t) ?? t.brand,
        ),
        DhenuStatCard(
          label: 'AVG SNF', value: pct(acc.avgSnf),
          valueColor: QualityBadge.bandColor(bands, widget.node.effectiveMilkType, 'snf', acc.avgSnf, t) ?? t.brand,
        ),
        if ((acc.avgWater ?? 0) > 0)
          DhenuStatCard(label: 'AVG WATER', value: pct(acc.avgWater), valueColor: t.brand),
        DhenuStatCard(label: 'SOURCE VMCCS', value: '$sources', valueColor: t.ink),
      ],
    );
  }
}
