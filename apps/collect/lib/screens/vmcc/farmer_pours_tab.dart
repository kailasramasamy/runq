import 'package:flutter/material.dart';
import '../../theme/dhenu_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/mp_context_provider.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_states.dart';
import '../../widgets/pour_detail_sheet.dart';
import '../../widgets/shift_grouped_pours.dart';
import 'farmer_statement_share.dart';
import 'record_collection.dart';

class FarmerPoursTab extends ConsumerWidget {
  const FarmerPoursTab({super.key, required this.node, required this.farmer});

  final MpNode node;
  final MpFarmer farmer;

  void _openPour(BuildContext context, MpPour p, MpFarmer? f) =>
      showPourDetailSheet(
        context,
        pour: p,
        node: node,
        farmer: f,
        onModify: () => Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) =>
                RecordCollectionScreen(node: node, seedPour: p, seedFarmer: f),
          ),
        ),
      );

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final poursAsync = ref.watch(nodeHistoryPoursProvider(node.id));
    return poursAsync.when(
      loading: () => const DhenuLoadingList(rows: 6),
      error: (e, _) => DhenuEmptyState(
        icon: DhenuIcons.cloudOff,
        title: l.farmerPoursLoadError,
        subtitle: '$e',
      ),
      data: (all) {
        final mine = [
          for (final p in all)
            if (p.farmerId == farmer.id) p,
        ];
        return _body(context, mine);
      },
    );
  }

  Widget _body(BuildContext context, List<MpPour> mine) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    if (mine.isEmpty) {
      return ListView(
        padding: const EdgeInsets.all(DhenuSpacing.screen),
        children: [
          ShareStatementButton(farmer: farmer),
          const SizedBox(height: DhenuSpacing.xl),
          DhenuEmptyState(
            icon: DhenuIcons.history,
            title: l.farmerPoursEmptyTitle,
            subtitle: l.farmerPoursEmptySubtitle,
          ),
        ],
      );
    }
    final groups = <String, List<MpPour>>{};
    for (final p in mine) {
      (groups[p.collectionDate] ??= []).add(p);
    }
    final dates = groups.keys.toList()..sort((a, b) => b.compareTo(a));
    final totalL = mine.fold<double>(0, (s, p) => s + p.qtyLitres);
    final totalAmt = mine.fold<double>(0, (s, p) => s + p.lineAmount);
    final byId = {farmer.id: farmer};
    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(
        DhenuSpacing.screen,
        DhenuSpacing.lg,
        DhenuSpacing.screen,
        DhenuSpacing.x4,
      ),
      children: [
        _summaryCard(t, l, totalL, totalAmt, mine.length),
        const SizedBox(height: DhenuSpacing.md),
        ShareStatementButton(farmer: farmer),
        const SizedBox(height: DhenuSpacing.lg),
        for (final d in dates) ...[
          _dayHeader(t, d, groups[d]!),
          const SizedBox(height: DhenuSpacing.sm),
          ShiftGroupedPours(
            pours: groups[d]!,
            farmersById: byId,
            onTapPour: (p, f) => _openPour(context, p, f),
            singleFarmer: true,
          ),
          const SizedBox(height: DhenuSpacing.lg),
        ],
      ],
    );
  }

  Widget _summaryCard(
    DhenuTokens t,
    AppLocalizations l,
    double totalL,
    double totalAmt,
    int count,
  ) {
    return DhenuCard(
      child: Row(
        children: [
          _stat(t, litres(totalL, unit: true), l.farmerPoursCount(count)),
          Container(width: 1, height: 36, color: t.hairline),
          _stat(t, rupees(totalAmt), l.farmerPours30DayTotal),
        ],
      ),
    );
  }

  Widget _stat(DhenuTokens t, String value, String label) {
    return Expanded(
      child: Column(
        children: [
          Text(
            value,
            style: DhenuText.number(size: 18, color: t.ink),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: DhenuSpacing.xs),
          Text(
            label,
            style: DhenuText.caption.copyWith(color: t.inkSoft),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }

  Widget _dayHeader(DhenuTokens t, String date, List<MpPour> dayPours) {
    final qty = dayPours.fold<double>(0, (a, p) => a + p.qtyLitres);
    final amt = dayPours.fold<double>(0, (a, p) => a + p.lineAmount);
    return Row(
      children: [
        Text(prettyDate(date), style: DhenuText.title.copyWith(color: t.ink)),
        const Spacer(),
        Text(
          '${litres(qty, unit: true)} · ${rupees(amt)}',
          style: DhenuText.caption.copyWith(color: t.inkSoft),
        ),
      ],
    );
  }
}
