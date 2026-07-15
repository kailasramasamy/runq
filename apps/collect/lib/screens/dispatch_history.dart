import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/mp_models.dart';
import '../l10n/app_localizations.dart';
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
    final l = AppLocalizations.of(context);
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
            icon: DhenuIcons.cloudOff, title: l.dispatchHistoryLoadError, subtitle: '$e'),
        data: (all) {
          if (all.isEmpty) {
            return DhenuEmptyState(
              icon: DhenuIcons.truck,
              title: l.dispatchHistoryEmptyTitle,
              subtitle: l.dispatchHistoryEmptySubtitle,
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
            itemBuilder: (_, i) => _daySection(t, l, days[i], names),
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

  /// One day = one card: a tappable date/total header, a divider, then the
  /// day's dispatch rows (open) or a one-line count summary (collapsed).
  Widget _daySection(DhenuTokens t, AppLocalizations l, MapEntry<String, List<MpConsignment>> day,
      Map<String, String> names) {
    final open = _open.contains(day.key);
    final total = day.value.fold<double>(0, (s, c) => s + (c.dispatchQty ?? 0));
    return DhenuCard(
      padding: EdgeInsets.zero,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(DhenuRadii.card),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Material(
            type: MaterialType.transparency,
            child: InkWell(
              onTap: () => setState(() => open ? _open.remove(day.key) : _open.add(day.key)),
              child: Padding(
                padding: const EdgeInsets.all(DhenuSpacing.lg),
                child: Row(children: [
                  Icon(open ? DhenuIcons.chevronDown : DhenuIcons.chevronRight,
                      size: 18, color: t.inkSoft),
                  const SizedBox(width: DhenuSpacing.sm),
                  Expanded(child: Text(prettyDate(day.key), style: DhenuText.title.copyWith(color: t.ink))),
                  Text(litres(total, unit: true), style: DhenuText.number(size: 16, color: t.brand)),
                ]),
              ),
            ),
          ),
          Divider(height: 1, color: t.hairline),
          if (open) ..._detailRows(t, l, day.value, names) else _collapsedRow(t, l, day.value),
        ]),
      ),
    );
  }

  /// Collapsed body: dispatch count + how many are still in transit.
  Widget _collapsedRow(DhenuTokens t, AppLocalizations l, List<MpConsignment> cs) {
    final inTransit = cs.where((c) => c.inTransit).length;
    return Padding(
      padding: const EdgeInsets.all(DhenuSpacing.lg),
      child: Row(children: [
        Icon(DhenuIcons.truck, size: 18, color: t.inkSoft),
        const SizedBox(width: DhenuSpacing.md),
        Expanded(
            child: Text(l.dispatchHistoryCount(cs.length),
                style: DhenuText.body.copyWith(color: t.inkSoft))),
        if (inTransit > 0)
          Text(l.dispatchHistoryInTransit(inTransit), style: DhenuText.caption.copyWith(color: t.gradeB)),
      ]),
    );
  }

  /// Expanded body: one row per dispatch leg — destination, shift · no., qty, status.
  List<Widget> _detailRows(
      DhenuTokens t, AppLocalizations l, List<MpConsignment> cs, Map<String, String> names) => [
        for (var i = 0; i < cs.length; i++) ...[
          if (i > 0) Divider(height: 1, color: t.hairline),
          SourceRow(
            title: names[cs[i].toNodeId] ??
                (_destType == 'pp' ? l.dispatchHistoryPlantFallback : l.dispatchHistoryCcFallback),
            subtitle: _subtitle(cs[i]),
            litres: litres(cs[i].dispatchQty ?? 0, unit: true),
            trailingStatus: _status(t, l, cs[i]),
          ),
        ],
      ];

  String _subtitle(MpConsignment c) {
    final shift = c.shift == null ? '' : '${c.shift == Shift.am ? 'AM' : 'PM'} · ';
    return '$shift${c.consignmentNo}';
  }

  Widget _status(DhenuTokens t, AppLocalizations l, MpConsignment c) {
    if (c.status == 'reversed') {
      return Text(l.dispatchHistoryReversed, style: DhenuText.caption.copyWith(color: t.gradeC));
    }
    return Text(
      c.inTransit ? l.dispatchStatusTransit : l.dispatchStatusReceived,
      style: DhenuText.caption.copyWith(color: c.inTransit ? t.gradeB : t.gradeA),
    );
  }
}
