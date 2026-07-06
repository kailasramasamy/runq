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
import 'record_collection.dart';

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
  final Set<String> _expandedFarmers = {};
  bool _seededExpand = false;
  QualityBands? _bands; // resolved in build, used by the day-grouped pour list

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
    _bands = ref.watch(qualityBandsProvider(node.id)).valueOrNull;
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
          (_HistoryView.byDay, l.historyByDay, null),
          (_HistoryView.byFarmer, l.historyByFarmer, null),
        ]),
        const SizedBox(height: DhenuSpacing.sm),
        _segment<Shift?>(t, _shift, (v) => setState(() => _shift = v), [
          (null, l.historyAll, null),
          (Shift.pm, l.shiftPm, DhenuIcons.moon),
          (Shift.am, l.shiftAm, DhenuIcons.sun),
        ]),
        if (_view == _HistoryView.byFarmer) ...[
          const SizedBox(height: DhenuSpacing.sm),
          _searchField(t, l),
        ],
      ]);

  Widget _segment<E>(DhenuTokens t, E current, void Function(E) onSelect,
      List<(E, String, IconData?)> options) {
    final n = options.length;
    final idx = options.indexWhere((o) => o.$1 == current);
    return Container(
      padding: const EdgeInsets.all(DhenuSpacing.xs),
      decoration: BoxDecoration(
        color: t.inputFill,
        borderRadius: BorderRadius.circular(DhenuRadii.input),
      ),
      // A single brand pill slides to the selected item — only ever one
      // highlight, so switching options reads as a move, not a double-flash.
      child: Stack(children: [
        if (idx >= 0)
          Positioned.fill(
            child: AnimatedAlign(
              duration: const Duration(milliseconds: 220),
              curve: Curves.easeOutCubic,
              alignment: Alignment(n == 1 ? 0 : -1 + 2 * idx / (n - 1), 0),
              child: FractionallySizedBox(
                widthFactor: 1 / n,
                heightFactor: 1,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    color: t.brandSubtle,
                    borderRadius: BorderRadius.circular(DhenuRadii.input - 2),
                    border: Border.all(color: t.brand),
                  ),
                ),
              ),
            ),
          ),
        Row(children: [
          for (final (val, label, icon) in options)
            Expanded(child: _segmentItem(t, label, icon, current == val, () => onSelect(val))),
        ]),
      ]),
    );
  }

  Widget _segmentItem(DhenuTokens t, String label, IconData? icon, bool selected, VoidCallback onTap) {
    final fg = selected ? t.brand : t.inkSoft;
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: DhenuSpacing.sm),
        child: Row(mainAxisSize: MainAxisSize.min, mainAxisAlignment: MainAxisAlignment.center, children: [
          if (icon != null) ...[
            Icon(icon, size: 14, color: fg),
            const SizedBox(width: 4),
          ],
          AnimatedDefaultTextStyle(
            duration: const Duration(milliseconds: 200),
            curve: Curves.easeOut,
            style: DhenuText.label.copyWith(color: fg),
            child: Text(label),
          ),
        ]),
      ),
    );
  }

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
        selected: isOpen,
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
        ShiftGroupedPours(pours: dayPours, farmersById: byId, bands: _bands, onTapPour: _openPour),
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
      for (final id in ids) ...[
        _farmerSection(t, l, byId[id], byFarmer[id]!),
        const SizedBox(height: DhenuSpacing.md),
      ],
    ];
  }

  bool _matchesQuery(MpFarmer? f) {
    if (f == null) return false;
    return f.name.toLowerCase().contains(_query) || f.code.toLowerCase().contains(_query);
  }

  /// A farmer's totals as a tappable card that expands inline into that
  /// farmer's day-grouped pours — mirrors the by-day accordion.
  Widget _farmerSection(DhenuTokens t, AppLocalizations l, MpFarmer? farmer, List<MpPour> pours) {
    final id = farmer?.id ?? '';
    final canOpen = farmer != null;
    final isOpen = canOpen && _expandedFarmers.contains(id);
    final qty = pours.fold<double>(0, (a, p) => a + p.qtyLitres);
    final amt = pours.fold<double>(0, (a, p) => a + p.lineAmount);
    final display = canOpen ? farmerName(context, farmer) : l.historyFarmerFallback;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      DhenuCard(
        padding: EdgeInsets.zero,
        selected: isOpen,
        onTap: !canOpen
            ? null
            : () => setState(() => isOpen ? _expandedFarmers.remove(id) : _expandedFarmers.add(id)),
        child: Padding(
          padding: const EdgeInsets.all(DhenuSpacing.lg),
          child: Row(children: [
            if (canOpen) ...[
              Icon(isOpen ? DhenuIcons.chevronUp : DhenuIcons.chevronDown, color: t.inkSoft),
              const SizedBox(width: DhenuSpacing.sm),
            ],
            Expanded(child: Text(display, style: DhenuText.title.copyWith(color: t.ink))),
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text(litres(qty, unit: true), style: DhenuText.number(size: 16, color: t.ink)),
              Text(rupees(amt), style: DhenuText.caption.copyWith(color: t.brand)),
            ]),
          ]),
        ),
      ),
      if (isOpen) ..._farmerDays(t, farmer, pours),
    ]);
  }

  List<Widget> _farmerDays(DhenuTokens t, MpFarmer farmer, List<MpPour> pours) {
    final groups = <String, List<MpPour>>{};
    for (final p in pours) {
      (groups[p.collectionDate] ??= []).add(p);
    }
    final dates = groups.keys.toList()..sort((a, b) => b.compareTo(a));
    final byId = {farmer.id: farmer};
    return [
      const SizedBox(height: DhenuSpacing.sm),
      for (final d in dates) ...[
        _farmerDayHeader(t, d, groups[d]!),
        const SizedBox(height: DhenuSpacing.xs),
        ShiftGroupedPours(pours: groups[d]!, farmersById: byId, bands: _bands, onTapPour: _openPour),
        const SizedBox(height: DhenuSpacing.sm),
      ],
    ];
  }

  Widget _farmerDayHeader(DhenuTokens t, String date, List<MpPour> dayPours) {
    final qty = dayPours.fold<double>(0, (a, p) => a + p.qtyLitres);
    final amt = dayPours.fold<double>(0, (a, p) => a + p.lineAmount);
    return Padding(
      padding: const EdgeInsets.only(left: DhenuSpacing.xs),
      child: Row(children: [
        Text(prettyDate(date), style: DhenuText.label.copyWith(color: t.ink)),
        const Spacer(),
        Text('${litres(qty, unit: true)} · ${rupees(amt)}',
            style: DhenuText.caption.copyWith(color: t.inkSoft)),
      ]),
    );
  }
}
