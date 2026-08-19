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
import '../../widgets/dhenu_segmented.dart';
import '../../widgets/dhenu_states.dart';
import '../../widgets/pour_detail_sheet.dart';
import '../../widgets/source_row.dart';
import '../../widgets/shift_grouped_pours.dart';
import '../../widgets/supplied_shift_rows.dart';
import 'record_collection.dart';

enum _HistoryView { byDay, byFarmer }

/// Collection history — what the node collected over the last 30 days.
/// Two navigation modes: a day accordion (collapsed day summaries that expand
/// into PM/AM shift groups) and a by-farmer list that drills into one farmer's
/// history. A shift filter (All / AM / PM) narrows both. Body widget.
///
/// Milk reaches this screen two ways. A VMCC that logs farmer pours reads its
/// own entries. A VMCC whose farmers aren't tracked — the CC keys its arrivals
/// by hand — has no pours at all, and used to find this screen permanently
/// empty despite supplying every day; its days come from those CC receipts
/// instead. A node doing both shows both, per day, clearly attributed.
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
    ref.invalidate(nodeSuppliedHistoryProvider(node.id));
    await Future.wait([
      ref.read(nodeHistoryPoursProvider(node.id).future),
      ref.read(nodeSuppliedHistoryProvider(node.id).future),
    ]);
  }

  List<MpPour> _filtered(List<MpPour> pours) =>
      _shift == null ? pours : [for (final p in pours) if (p.shift == _shift) p];

  List<MpSuppliedLine> _filteredSupply(List<MpSuppliedLine> lines) =>
      _shift == null ? lines : [for (final s in lines) if (s.shift == _shift) s];

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
    final supplyAsync = ref.watch(nodeSuppliedHistoryProvider(node.id));
    final farmers = ref.watch(nodeFarmersProvider(node.id)).asData?.value ?? const <MpFarmer>[];
    final byId = {for (final f in farmers) f.id: f};
    _bands = ref.watch(qualityBandsProvider(node.id)).valueOrNull;
    // Either source alone is a complete history for the node it belongs to, so
    // the screen waits for both but fails only if both fail — a CC-recorded
    // node must not be blanked by a pour query it never uses, or vice versa.
    if (poursAsync.isLoading || supplyAsync.isLoading) {
      return const DhenuLoadingList(rows: 5);
    }
    if (poursAsync.hasError && supplyAsync.hasError) {
      return RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(children: [
          const SizedBox(height: DhenuSpacing.x4),
          DhenuEmptyState(
              icon: DhenuIcons.cloudOff,
              title: l.historyLoadError,
              subtitle: '${poursAsync.error}'),
        ]),
      );
    }
    return RefreshIndicator(
      onRefresh: _refresh,
      child: _body(
        t, l,
        _filtered(poursAsync.valueOrNull ?? const []),
        _filteredSupply(supplyAsync.valueOrNull ?? const []),
        byId,
      ),
    );
  }

  Widget _body(DhenuTokens t, AppLocalizations l, List<MpPour> pours,
      List<MpSuppliedLine> supply, Map<String, MpFarmer> byId) {
    // Nothing to group by farmer when the node's milk is only ever recorded in
    // bulk at the CC, so that view — and its toggle — stay out of the way.
    final byFarmerAvailable = pours.isNotEmpty;
    final view = byFarmerAvailable ? _view : _HistoryView.byDay;
    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(
          DhenuSpacing.screen, DhenuSpacing.lg, DhenuSpacing.screen, DhenuSpacing.x4),
      children: [
        _controls(t, l, view, byFarmerAvailable),
        const SizedBox(height: DhenuSpacing.lg),
        if (pours.isEmpty && supply.isEmpty)
          DhenuEmptyState(
            icon: DhenuIcons.history,
            title: l.historyNoHistory,
            subtitle: l.historyNoHistorySubtitle,
          )
        else if (view == _HistoryView.byDay)
          ..._byDay(t, l, pours, supply, byId)
        else
          ..._byFarmer(t, l, pours, byId),
      ],
    );
  }

  // ── Controls ──────────────────────────────────────────────────────────────

  Widget _controls(
          DhenuTokens t, AppLocalizations l, _HistoryView view, bool byFarmerAvailable) =>
      Column(children: [
        if (byFarmerAvailable) ...[
          DhenuSegmented<_HistoryView>(
            current: view,
            onSelect: (v) => setState(() => _view = v),
            options: [
              (_HistoryView.byDay, l.historyByDay, null),
              (_HistoryView.byFarmer, l.historyByFarmer, null),
            ],
          ),
          const SizedBox(height: DhenuSpacing.sm),
        ],
        DhenuSegmented<Shift?>(
          current: _shift,
          onSelect: (v) => setState(() => _shift = v),
          options: [
            (null, l.historyAll, null),
            (Shift.pm, l.shiftPm, DhenuIcons.moon),
            (Shift.am, l.shiftAm, DhenuIcons.sun),
          ],
        ),
        if (view == _HistoryView.byFarmer) ...[
          const SizedBox(height: DhenuSpacing.sm),
          _searchField(t, l),
        ],
      ]);

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

  List<Widget> _byDay(DhenuTokens t, AppLocalizations l, List<MpPour> pours,
      List<MpSuppliedLine> supply, Map<String, MpFarmer> byId) {
    final groups = <String, List<MpPour>>{};
    for (final p in pours) {
      (groups[p.collectionDate] ??= []).add(p);
    }
    final supplyGroups = <String, List<MpSuppliedLine>>{};
    for (final s in supply) {
      (supplyGroups[s.date] ??= []).add(s);
    }
    final dates = {...groups.keys, ...supplyGroups.keys}.toList()
      ..sort((a, b) => b.compareTo(a));
    if (!_seededExpand && dates.isNotEmpty) {
      _expanded.add(dates.first); // newest day open by default
      _seededExpand = true;
    }
    return [
      for (final d in dates) ...[
        _daySection(t, l, d, groups[d] ?? const [], supplyGroups[d] ?? const [], byId),
        const SizedBox(height: DhenuSpacing.md),
      ],
    ];
  }

  /// One day, from whichever source recorded it — pours, CC receipts, or both.
  /// The header totals everything the day carried; the body keeps the two
  /// apart, because an operator reconciling a figure needs to know which of
  /// them they can still edit.
  Widget _daySection(DhenuTokens t, AppLocalizations l, String date, List<MpPour> dayPours,
      List<MpSuppliedLine> daySupply, Map<String, MpFarmer> byId) {
    final isOpen = _expanded.contains(date);
    final qty = dayPours.fold<double>(0, (a, p) => a + p.qtyLitres) + suppliedLitres(daySupply);
    final gross =
        dayPours.fold<double>(0, (a, p) => a + p.lineAmount) + suppliedAmount(daySupply);
    final farmerCount = dayPours.map((p) => p.farmerId).toSet().length;
    final pmL = dayPours.where((p) => p.shift == Shift.pm).fold<double>(0, (a, p) => a + p.qtyLitres)
        + suppliedShiftLitres(daySupply, Shift.pm);
    final amL = dayPours.where((p) => p.shift == Shift.am).fold<double>(0, (a, p) => a + p.qtyLitres)
        + suppliedShiftLitres(daySupply, Shift.am);
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
                Text(
                    dayPours.isEmpty
                        ? l.historyDaySupplySubtitle(litres(pmL), litres(amL))
                        : l.historyDaySubtitle(farmerCount, litres(pmL), litres(amL)),
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
        if (dayPours.isNotEmpty)
          ShiftGroupedPours(
              pours: dayPours, farmersById: byId, bands: _bands, onTapPour: _openPour),
        if (daySupply.isNotEmpty) ...[
          if (dayPours.isNotEmpty) const SizedBox(height: DhenuSpacing.sm),
          SuppliedShiftRows(node: node, lines: daySupply, bands: _bands),
        ],
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
      if (isOpen) ..._farmerDays(t, l, farmer, pours),
    ]);
  }

  /// One card per day, each row a shift — the farmer is already named by the
  /// section header above, so the rows spend their space on shift, rate and
  /// quality instead of repeating it.
  List<Widget> _farmerDays(DhenuTokens t, AppLocalizations l, MpFarmer farmer, List<MpPour> pours) {
    final groups = <String, List<MpPour>>{};
    for (final p in pours) {
      (groups[p.collectionDate] ??= []).add(p);
    }
    final dates = groups.keys.toList()..sort((a, b) => b.compareTo(a));
    final mixedTypes = hasMixedMilkTypes(pours.map((p) => p.milkType));
    return [
      const SizedBox(height: DhenuSpacing.sm),
      for (final d in dates) ...[
        _farmerDayCard(t, l, farmer, d, groups[d]!, mixedTypes),
        const SizedBox(height: DhenuSpacing.sm),
      ],
    ];
  }

  Widget _farmerDayCard(DhenuTokens t, AppLocalizations l, MpFarmer farmer, String date,
      List<MpPour> dayPours, bool mixedTypes) {
    final qty = dayPours.fold<double>(0, (a, p) => a + p.qtyLitres);
    final amt = dayPours.fold<double>(0, (a, p) => a + p.lineAmount);
    // PM leads the day, matching every other pour list in the app.
    final rows = [
      for (final p in dayPours) if (p.shift == Shift.pm) p,
      for (final p in dayPours) if (p.shift != Shift.pm) p,
    ];
    return DhenuCard(
      padding: EdgeInsets.zero,
      child: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(
              DhenuSpacing.screen, DhenuSpacing.md, DhenuSpacing.screen, DhenuSpacing.md),
          child: Row(children: [
            Text(prettyDate(date), style: DhenuText.label.copyWith(color: t.ink)),
            const Spacer(),
            Text('${litres(qty, unit: true)} · ${rupees(amt)}',
                style: DhenuText.caption.copyWith(color: t.inkSoft)),
          ]),
        ),
        for (final p in rows) ...[
          Divider(height: 1, color: t.hairline),
          _shiftRow(t, l, farmer, p, mixedTypes),
        ],
      ]),
    );
  }

  Widget _shiftRow(DhenuTokens t, AppLocalizations l, MpFarmer farmer, MpPour p, bool mixedTypes) {
    final label = p.shift == Shift.am ? l.shiftAm : l.shiftPm;
    return SourceRow(
      titleIcon: p.shift == Shift.am ? DhenuIcons.sun : DhenuIcons.moon,
      title: mixedTypes ? '$label  ·  ${milkTypeL10n(l, p.milkType)}' : label,
      subtitle: '${rupees(p.ratePerLitre, paise: true)}/L',
      hideLeading: true,
      litres: litres(p.qtyLitres, unit: true),
      quality: p.fat == null ? null : pourQualityLine(context, p, _bands),
      amount: rupees(p.lineAmount),
      onTap: () => _openPour(p, farmer),
    );
  }
}
