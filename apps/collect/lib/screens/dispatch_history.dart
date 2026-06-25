import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/mp_models.dart';
import '../providers/transfer_providers.dart';
import '../theme/dhenu_icons.dart';
import '../theme/dhenu_theme.dart';
import '../theme/dhenu_tokens.dart';
import '../utils/format.dart';
import '../widgets/dhenu_card.dart';
import '../widgets/dhenu_states.dart';
import '../widgets/source_row.dart';

/// Dispatch history for a VMCC or CC — tankers this node sent onward over the
/// last 30 days, grouped into per-day sections (newest first). The most recent
/// day opens expanded; earlier days collapse to a count + total and expand on
/// tap. One flat consignment fetch, grouped client-side (no daily-rollup
/// endpoint exists for dispatches, unlike receive history).
class DispatchHistory extends ConsumerStatefulWidget {
  const DispatchHistory({super.key, required this.node, required this.kind});

  final MpNode node;
  final String kind; // 'vmcc_to_cc' (VMCC→CC) | 'cc_to_pp' (CC→PP)

  static const _days = 30;

  @override
  ConsumerState<DispatchHistory> createState() => _DispatchHistoryState();
}

class _DispatchHistoryState extends ConsumerState<DispatchHistory> {
  final _open = <String>{};
  bool _seeded = false;

  MpNode get node => widget.node;
  // The destination tier for this leg, used to resolve destination names.
  String get _destType => widget.kind == 'cc_to_pp' ? 'pp' : 'cc';

  DispatchedRangeArgs get _args =>
      (nodeId: node.id, kind: widget.kind, days: DispatchHistory._days);

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final async = ref.watch(nodeDispatchedRangeProvider(_args));
    final names = {
      for (final n in ref.watch(nodesByTypeProvider(_destType)).value ?? const <MpNode>[])
        n.id: n.name,
    };
    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(nodeDispatchedRangeProvider(_args)),
      child: async.when(
        loading: () => const DhenuLoadingList(),
        error: (e, _) => DhenuEmptyState(
            icon: DhenuIcons.cloudOff, title: 'Could not load history', subtitle: '$e'),
        data: (all) {
          if (all.isEmpty) {
            return const DhenuEmptyState(
              icon: DhenuIcons.truck,
              title: 'No dispatches yet',
              subtitle: 'Tankers dispatched over the last 30 days show here',
            );
          }
          final days = _groupByDate(all);
          if (!_seeded) {
            _open.add(days.first.key);
            _seeded = true;
          }
          return ListView.separated(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: const EdgeInsets.fromLTRB(
                DhenuSpacing.screen, DhenuSpacing.md, DhenuSpacing.screen, DhenuSpacing.x4),
            itemCount: days.length,
            separatorBuilder: (_, _) => const SizedBox(height: DhenuSpacing.lg),
            itemBuilder: (_, i) => _daySection(t, days[i], names),
          );
        },
      ),
    );
  }

  /// Group dispatches by collection date, preserving the API's newest-first order.
  List<MapEntry<String, List<MpConsignment>>> _groupByDate(List<MpConsignment> cs) {
    final m = <String, List<MpConsignment>>{};
    for (final c in cs) {
      (m[c.collectionDate] ??= []).add(c);
    }
    return m.entries.toList();
  }

  Widget _daySection(
      DhenuTokens t, MapEntry<String, List<MpConsignment>> day, Map<String, String> names) {
    final open = _open.contains(day.key);
    final total = day.value.fold<double>(0, (s, c) => s + (c.dispatchQty ?? 0));
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      InkWell(
        borderRadius: BorderRadius.circular(DhenuRadii.card),
        onTap: () => setState(() => open ? _open.remove(day.key) : _open.add(day.key)),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: DhenuSpacing.xs),
          child: Row(children: [
            Icon(open ? DhenuIcons.chevronDown : DhenuIcons.chevronRight, size: 18, color: t.inkSoft),
            const SizedBox(width: DhenuSpacing.xs),
            Expanded(child: Text(prettyDate(day.key), style: DhenuText.title.copyWith(color: t.ink))),
            Text(litres(total, unit: true), style: DhenuText.number(size: 16, color: t.brand)),
          ]),
        ),
      ),
      const SizedBox(height: DhenuSpacing.sm),
      if (open) _dayDetail(t, day.value, names) else _collapsedSummary(t, day.value),
    ]);
  }

  /// Collapsed: dispatch count + how many are still in transit.
  Widget _collapsedSummary(DhenuTokens t, List<MpConsignment> cs) {
    final inTransit = cs.where((c) => c.inTransit).length;
    return DhenuCard(
      child: Row(children: [
        Icon(DhenuIcons.truck, size: 18, color: t.inkSoft),
        const SizedBox(width: DhenuSpacing.md),
        Expanded(
            child: Text('${cs.length} dispatch${cs.length == 1 ? '' : 'es'}',
                style: DhenuText.body.copyWith(color: t.inkSoft))),
        if (inTransit > 0)
          Text('$inTransit in transit', style: DhenuText.caption.copyWith(color: t.gradeB)),
      ]),
    );
  }

  /// Expanded: one row per dispatch leg — destination, shift · no., qty, status.
  Widget _dayDetail(DhenuTokens t, List<MpConsignment> cs, Map<String, String> names) {
    return DhenuCard(
      padding: EdgeInsets.zero,
      child: Column(children: [
        for (var i = 0; i < cs.length; i++) ...[
          if (i > 0) Divider(height: 1, color: t.hairline),
          SourceRow(
            title: names[cs[i].toNodeId] ?? (_destType == 'pp' ? 'Plant' : 'Chilling centre'),
            subtitle: _subtitle(cs[i]),
            litres: litres(cs[i].dispatchQty ?? 0, unit: true),
            trailingStatus: _status(t, cs[i]),
          ),
        ],
      ]),
    );
  }

  String _subtitle(MpConsignment c) {
    final shift = c.shift == null ? '' : '${c.shift == Shift.am ? 'AM' : 'PM'} · ';
    return '$shift${c.consignmentNo}';
  }

  Widget _status(DhenuTokens t, MpConsignment c) {
    if (c.status == 'reversed') {
      return Text('⊘ reversed', style: DhenuText.caption.copyWith(color: t.gradeC));
    }
    return Text(
      c.inTransit ? '⏳ transit' : '✓ received',
      style: DhenuText.caption.copyWith(color: c.inTransit ? t.gradeB : t.gradeA),
    );
  }
}
