import 'package:flutter/material.dart';
import '../../theme/dhenu_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../l10n/app_localizations.dart';
import '../../l10n/l10n_helpers.dart';
import '../../providers/mp_context_provider.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_states.dart';
import '../../widgets/pour_detail_sheet.dart';
import '../../widgets/shift_grouped_pours.dart';
import '../../widgets/source_row.dart';
import 'record_collection.dart';
import 'vmcc_farmer_history.dart';

enum _HistoryView { byDay, byFarmer }

/// Collection history — the node's recorded pours over the last 30 days.
/// Two navigation modes: a day accordion (collapsed day summaries that expand
/// into PM/AM shift groups) and a by-farmer list that drills into one farmer's
/// history. A shift filter (All / AM / PM) narrows both. Body widget.
class VmccCollectionHistory extends ConsumerStatefulWidget {
  const VmccCollectionHistory({super.key, required this.node});
  final MpNode node;

  @override
  ConsumerState<VmccCollectionHistory> createState() => _VmccCollectionHistoryState();
}

class _VmccCollectionHistoryState extends ConsumerState<VmccCollectionHistory> {
  _HistoryView _view = _HistoryView.byDay;
  Shift? _shift; // null = all shifts
  String _query = '';
  final Set<String> _expanded = {};
  bool _seededExpand = false;

  MpNode get node => widget.node;

  Future<void> _refresh() async {
    ref.invalidate(nodeHistoryPoursProvider(node.id));
    await ref.read(nodeHistoryPoursProvider(node.id).future);
  }

  List<MpPour> _filtered(List<MpPour> pours) =>
      _shift == null ? pours : [for (final p in pours) if (p.shift == _shift) p];

  void _openPour(MpPour p, MpFarmer? farmer) => showPourDetailSheet(
        context,
        pour: p,
        node: node,
        farmer: farmer,
        onModify: () => Navigator.of(context).push(MaterialPageRoute(
          builder: (_) => RecordCollectionScreen(node: node, seedPour: p, seedFarmer: farmer),
        )),
      );

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    final poursAsync = ref.watch(nodeHistoryPoursProvider(node.id));
    final farmers = ref.watch(nodeFarmersProvider(node.id)).asData?.value ?? const <MpFarmer>[];
    final byId = {for (final f in farmers) f.id: f};
    return RefreshIndicator(
      onRefresh: _refresh,
      child: poursAsync.when(
        loading: () => const DhenuLoadingList(rows: 5),
        error: (e, _) => ListView(children: [
          const SizedBox(height: DhenuSpacing.x4),
          DhenuEmptyState(
              icon: DhenuIcons.cloudOff, title: l.historyLoadError, subtitle: '$e'),
        ]),
        data: (pours) => _body(t, l, _filtered(pours), byId),
      ),
    );
  }

  Widget _body(DhenuTokens t, AppLocalizations l, List<MpPour> pours, Map<String, MpFarmer> byId) {
    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(
          DhenuSpacing.screen, DhenuSpacing.lg, DhenuSpacing.screen, DhenuSpacing.x4),
      children: [
        _controls(t, l),
        const SizedBox(height: DhenuSpacing.lg),
        if (pours.isEmpty)
          DhenuEmptyState(
            icon: DhenuIcons.history,
            title: l.historyNoHistory,
            subtitle: l.historyNoHistorySubtitle,
          )
        else if (_view == _HistoryView.byDay)
          ..._byDay(t, l, pours, byId)
        else
          ..._byFarmer(t, l, pours, byId),
      ],
    );
  }

  // ── Controls ──────────────────────────────────────────────────────────────

  Widget _controls(DhenuTokens t, AppLocalizations l) => Column(children: [
        _segment<_HistoryView>(t, _view, (v) => setState(() => _view = v), [
          (_HistoryView.byDay, l.historyByDay),
          (_HistoryView.byFarmer, l.historyByFarmer),
        ]),
        const SizedBox(height: DhenuSpacing.sm),
        _segment<Shift?>(t, _shift, (v) => setState(() => _shift = v), [
          (null, l.historyAll),
          (Shift.pm, '🌙 ${l.shiftPm}'),
          (Shift.am, '☀️ ${l.shiftAm}'),
        ]),
        if (_view == _HistoryView.byFarmer) ...[
          const SizedBox(height: DhenuSpacing.sm),
          _searchField(t, l),
        ],
      ]);

  Widget _segment<E>(DhenuTokens t, E current, void Function(E) onSelect,
      List<(E, String)> options) {
    return Container(
      padding: const EdgeInsets.all(DhenuSpacing.xs),
      decoration: BoxDecoration(
        color: t.inputFill,
        borderRadius: BorderRadius.circular(DhenuRadii.input),
      ),
      child: Row(children: [
        for (final (val, label) in options)
          Expanded(child: _segmentItem(t, label, current == val, () => onSelect(val))),
      ]),
    );
  }

  Widget _segmentItem(DhenuTokens t, String label, bool selected, VoidCallback onTap) =>
      GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          padding: const EdgeInsets.symmetric(vertical: DhenuSpacing.sm),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: selected ? t.card : Colors.transparent,
            borderRadius: BorderRadius.circular(DhenuRadii.input - 2),
          ),
          child: Text(label,
              style: DhenuText.label.copyWith(color: selected ? t.brand : t.inkSoft)),
        ),
      );

  Widget _searchField(DhenuTokens t, AppLocalizations l) => TextField(
        onChanged: (v) => setState(() => _query = v.trim().toLowerCase()),
        textCapitalization: TextCapitalization.words,
        style: DhenuText.body.copyWith(color: t.ink),
        decoration: InputDecoration(
          hintText: l.historySearchFarmer,
          prefixIcon: Icon(DhenuIcons.search, color: t.inkSoft),
          filled: true,
          fillColor: t.inputFill,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(DhenuRadii.input),
            borderSide: BorderSide(color: t.hairline),
          ),
        ),
      );

  // ── By day ────────────────────────────────────────────────────────────────

  List<Widget> _byDay(DhenuTokens t, AppLocalizations l, List<MpPour> pours, Map<String, MpFarmer> byId) {
    final groups = <String, List<MpPour>>{};
    for (final p in pours) {
      (groups[p.collectionDate] ??= []).add(p);
    }
    final dates = groups.keys.toList()..sort((a, b) => b.compareTo(a));
    if (!_seededExpand && dates.isNotEmpty) {
      _expanded.add(dates.first); // newest day open by default
      _seededExpand = true;
    }
    return [
      for (final d in dates) ...[
        _daySection(t, l, d, groups[d]!, byId),
        const SizedBox(height: DhenuSpacing.md),
      ],
    ];
  }

  Widget _daySection(DhenuTokens t, AppLocalizations l, String date, List<MpPour> dayPours,
      Map<String, MpFarmer> byId) {
    final isOpen = _expanded.contains(date);
    final qty = dayPours.fold<double>(0, (a, p) => a + p.qtyLitres);
    final gross = dayPours.fold<double>(0, (a, p) => a + p.lineAmount);
    final farmerCount = dayPours.map((p) => p.farmerId).toSet().length;
    final pmL = dayPours.where((p) => p.shift == Shift.pm).fold<double>(0, (a, p) => a + p.qtyLitres);
    final amL = dayPours.where((p) => p.shift == Shift.am).fold<double>(0, (a, p) => a + p.qtyLitres);
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      DhenuCard(
        padding: EdgeInsets.zero,
        onTap: () => setState(() => isOpen ? _expanded.remove(date) : _expanded.add(date)),
        child: Padding(
          padding: const EdgeInsets.all(DhenuSpacing.lg),
          child: Row(children: [
            Icon(isOpen ? DhenuIcons.chevronUp : DhenuIcons.chevronDown, color: t.inkSoft),
            const SizedBox(width: DhenuSpacing.sm),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(prettyDate(date), style: DhenuText.title.copyWith(color: t.ink)),
                Text(l.historyDaySubtitle(farmerCount, litres(pmL), litres(amL)),
                    style: DhenuText.caption.copyWith(color: t.inkSoft)),
              ]),
            ),
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text(litres(qty, unit: true), style: DhenuText.number(size: 16, color: t.ink)),
              Text(rupees(gross), style: DhenuText.caption.copyWith(color: t.brand)),
            ]),
          ]),
        ),
      ),
      if (isOpen) ...[
        const SizedBox(height: DhenuSpacing.sm),
        ShiftGroupedPours(pours: dayPours, farmersById: byId, onTapPour: _openPour),
      ],
    ]);
  }

  // ── By farmer ─────────────────────────────────────────────────────────────

  List<Widget> _byFarmer(DhenuTokens t, AppLocalizations l, List<MpPour> pours, Map<String, MpFarmer> byId) {
    final byFarmer = <String, List<MpPour>>{};
    for (final p in pours) {
      (byFarmer[p.farmerId] ??= []).add(p);
    }
    var ids = byFarmer.keys.toList()
      ..sort((a, b) => (byId[a]?.name ?? '').compareTo(byId[b]?.name ?? ''));
    if (_query.isNotEmpty) {
      ids = [
        for (final id in ids)
          if (_matchesQuery(byId[id])) id,
      ];
    }
    if (ids.isEmpty) {
      return [
        DhenuEmptyState(
            icon: DhenuIcons.searchOff,
            title: l.historyNoFarmersMatch,
            subtitle: l.historyNoFarmersMatchSubtitle),
      ];
    }
    return [
      DhenuCard(
        padding: EdgeInsets.zero,
        child: Column(children: [
          for (var i = 0; i < ids.length; i++) ...[
            if (i > 0) Divider(height: 1, color: t.hairline),
            _farmerRow(l, byId[ids[i]], byFarmer[ids[i]]!),
          ],
        ]),
      ),
    ];
  }

  bool _matchesQuery(MpFarmer? f) {
    if (f == null) return false;
    return f.name.toLowerCase().contains(_query) || f.code.toLowerCase().contains(_query);
  }

  Widget _farmerRow(AppLocalizations l, MpFarmer? farmer, List<MpPour> pours) {
    final qty = pours.fold<double>(0, (a, p) => a + p.qtyLitres);
    final amt = pours.fold<double>(0, (a, p) => a + p.lineAmount);
    final display = farmer != null ? farmerName(context, farmer) : l.historyFarmerFallback;
    return SourceRow(
      title: display,
      farmer: farmer,
      litres: litres(qty, unit: true),
      amount: rupees(amt),
      onTap: farmer == null
          ? null
          : () => Navigator.of(context).push(MaterialPageRoute(
                builder: (_) => VmccFarmerHistory(node: node, farmer: farmer),
              )),
    );
  }
}
