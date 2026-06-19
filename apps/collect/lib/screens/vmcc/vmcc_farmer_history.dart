import 'package:flutter/material.dart';
import '../../theme/dhenu_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../providers/mp_context_provider.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../widgets/dhenu_states.dart';
import '../../widgets/pour_detail_sheet.dart';
import '../../widgets/shift_grouped_pours.dart';
import 'record_collection.dart';

/// One farmer's recorded pours at this node over the last 30 days, grouped by
/// day (newest first) with PM/AM shift sections. Reached from the History
/// screen's "By farmer" view; pushed inside its own Scaffold.
class VmccFarmerHistory extends ConsumerWidget {
  const VmccFarmerHistory({super.key, required this.node, required this.farmer});
  final MpNode node;
  final MpFarmer farmer;

  void _openPour(BuildContext context, MpPour p, MpFarmer? f) => showPourDetailSheet(
        context,
        pour: p,
        node: node,
        farmer: f,
        onModify: () => Navigator.of(context).push(MaterialPageRoute(
          builder: (_) => RecordCollectionScreen(node: node, seedPour: p, seedFarmer: f),
        )),
      );

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    final poursAsync = ref.watch(nodeHistoryPoursProvider(node.id));
    return Scaffold(
      appBar: AppBar(title: Text(farmer.name, style: DhenuText.h2.copyWith(color: t.ink))),
      body: poursAsync.when(
        loading: () => const DhenuLoadingList(rows: 5),
        error: (e, _) => DhenuEmptyState(
            icon: DhenuIcons.cloudOff, title: 'Could not load history', subtitle: '$e'),
        data: (all) => _body(context, t, [for (final p in all) if (p.farmerId == farmer.id) p]),
      ),
    );
  }

  Widget _body(BuildContext context, DhenuTokens t, List<MpPour> mine) {
    if (mine.isEmpty) {
      return const DhenuEmptyState(
        icon: DhenuIcons.history,
        title: 'No collection history',
        subtitle: 'This farmer has no recorded pours in the last 30 days',
      );
    }
    final groups = <String, List<MpPour>>{};
    for (final p in mine) {
      (groups[p.collectionDate] ??= []).add(p);
    }
    final dates = groups.keys.toList()..sort((a, b) => b.compareTo(a));
    final byId = {farmer.id: farmer};
    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(
          DhenuSpacing.screen, DhenuSpacing.lg, DhenuSpacing.screen, DhenuSpacing.x4),
      children: [
        for (final d in dates) ...[
          _dayHeader(t, d, groups[d]!),
          const SizedBox(height: DhenuSpacing.sm),
          ShiftGroupedPours(
            pours: groups[d]!,
            farmersById: byId,
            onTapPour: (p, f) => _openPour(context, p, f),
          ),
          const SizedBox(height: DhenuSpacing.lg),
        ],
      ],
    );
  }

  Widget _dayHeader(DhenuTokens t, String date, List<MpPour> dayPours) {
    final qty = dayPours.fold<double>(0, (a, p) => a + p.qtyLitres);
    final amt = dayPours.fold<double>(0, (a, p) => a + p.lineAmount);
    return Row(children: [
      Text(prettyDate(date), style: DhenuText.title.copyWith(color: t.ink)),
      const Spacer(),
      Text('${litres(qty, unit: true)} · ${rupees(amt)}',
          style: DhenuText.caption.copyWith(color: t.inkSoft)),
    ]);
  }
}
