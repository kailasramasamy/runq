import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../l10n/app_localizations.dart';
import '../../l10n/l10n_helpers.dart';
import '../../providers/mp_context_provider.dart';
import '../../providers/transfer_providers.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_states.dart';
import '../../widgets/quality_badge.dart';
import '../../utils/friendly_error.dart';
import 'receive_leg.dart';
import 'rejection_report.dart';

/// Qty-weighted roll-up of one source node's receipts on a day (its AM+PM legs).
typedef _Agg = ({double qty, double? fat, double? snf, double? water});

/// Receive history — inbound receipts at this node over the last 30 days, shown
/// as per-day sections (newest first). Serves both legs via [ReceiveLeg]: VMCC
/// cans at a chilling centre, CC tankers at a plant. The day list is a light
/// server rollup (one weighted-quality row per day); only the expanded day's
/// per-source detail is fetched, so neither the API nor the app loads 30 days of
/// rows at once. The most recent day opens expanded; earlier days collapse to a
/// qty + avg-quality summary and load their detail on tap.
///
/// Today always has a section, even before a single can is received: the day's
/// milk exists from the moment a source records it, and a history that only
/// starts at receipt leaves the operator staring at yesterday while today's
/// collection is already on the floor upstream. The today card therefore carries
/// both what has arrived and what has not — see [_upstreamRows].
class ReceiveHistory extends ConsumerStatefulWidget {
  const ReceiveHistory({super.key, required this.node, required this.leg});
  final MpNode node;
  final ReceiveLeg leg;

  static const _days = 30;

  @override
  ConsumerState<ReceiveHistory> createState() => _ReceiveHistoryState();
}

class _ReceiveHistoryState extends ConsumerState<ReceiveHistory> {
  final _open = <String>{};
  final _openSource = <String>{}; // expanded per-source entries, "date|sourceId"
  bool _seeded = false;
  QualityBands _bands = QualityBands.empty;
  MilkType _milkType = MilkType.cowA1;
  Map<String, MilkType> _sourceMilkType = const {};
  List<UpstreamToday> _upstream = const [];

  MpNode get node => widget.node;
  ReceiveLeg get leg => widget.leg;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
    _bands = ref.watch(qualityBandsProvider(node.id)).valueOrNull ?? QualityBands.empty;
    _milkType = node.effectiveMilkType;
    final async = ref.watch(nodeReceivedDailyProvider(
        (nodeId: node.id, kind: leg.kind, days: ReceiveHistory._days)));
    _upstream = ref
            .watch(upstreamTodayProvider((nodeId: node.id, sourceType: leg.sourceType)))
            .valueOrNull ??
        const <UpstreamToday>[];
    final sourceNodes = ref.watch(nodesByTypeProvider(leg.sourceType)).value ?? const <MpNode>[];
    final names = {for (final n in sourceNodes) n.id: n.name};
    _sourceMilkType = {for (final n in sourceNodes) n.id: n.effectiveMilkType};
    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(nodeReceivedDailyProvider(
            (nodeId: node.id, kind: leg.kind, days: ReceiveHistory._days)));
        ref.invalidate(upstreamTodayProvider((nodeId: node.id, sourceType: leg.sourceType)));
        for (final d in _open) {
          ref.invalidate(
              nodeReceivedDayDetailProvider((nodeId: node.id, kind: leg.kind, date: d)));
        }
      },
      child: async.when(
        loading: () => const DhenuLoadingList(),
        error: (e, _) => DhenuEmptyState(
            icon: DhenuIcons.cloudOff, title: l.historyLoadError, subtitle: friendlyError(context, e)),
        data: (days) {
          // Nothing received in 30 days and nothing collected upstream today —
          // the node genuinely has no history to show.
          if (days.isEmpty && _upstreamCollected == 0) {
            return DhenuEmptyState(
              icon: DhenuIcons.package,
              title: l.ccReceiveNoReceiptsYet,
              subtitle: leg.historyEmptySubtitle,
            );
          }
          final rows = _withToday(days);
          if (!_seeded) {
            _open.add(rows.first.date);
            _seeded = true;
          }
          return ListView.separated(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: const EdgeInsets.fromLTRB(
                DhenuSpacing.screen, DhenuSpacing.md, DhenuSpacing.screen, DhenuSpacing.x4),
            itemCount: rows.length,
            separatorBuilder: (_, _) => const SizedBox(height: DhenuSpacing.lg),
            itemBuilder: (_, i) => _daySection(t, l, rows[i], names),
          );
        },
      ),
    );
  }

  /// Today's litres across the source nodes, received here or not.
  double get _upstreamCollected => _upstream.fold(0.0, (s, u) => s + u.collected);

  /// The server's day list, guaranteed to open with today. A day whose milk is
  /// still upstream has no receipt rows at all, so the rollup query never
  /// returns it — that card is synthesised here at zero received.
  List<MpReceivedDay> _withToday(List<MpReceivedDay> days) {
    final today = todayIso();
    if (days.isNotEmpty && days.first.date == today) return days;
    return [MpReceivedDay(date: today, totalQty: 0, sourceCount: 0), ...days];
  }

  /// Litres collected upstream today that have not reached this node yet.
  double _pendingToday(MpReceivedDay day) => day.date != todayIso()
      ? 0
      : (_upstreamCollected - day.totalQty).clamp(0.0, double.infinity);

  /// A day header (date + cumulative qty) over either the collapsed summary or,
  /// when open, the lazily-loaded per-VMCC detail.
  Widget _daySection(DhenuTokens t, AppLocalizations l, MpReceivedDay day, Map<String, String> names) {
    final open = _open.contains(day.date);
    return DhenuCard(
      padding: EdgeInsets.zero,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        // Primary row: the scan axis — date and the day's total, both bold.
        InkWell(
          borderRadius: const BorderRadius.vertical(top: Radius.circular(DhenuRadii.card)),
          onTap: () => setState(() => open ? _open.remove(day.date) : _open.add(day.date)),
          child: Padding(
            padding: const EdgeInsets.symmetric(
                horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.md),
            child: Row(children: [
              Expanded(
                  child: Text(prettyDate(day.date),
                      style: DhenuText.title.copyWith(color: t.ink, fontWeight: FontWeight.w700))),
              Text(litres(day.totalQty, unit: true),
                  style: DhenuText.number(size: 18, w: FontWeight.w800, color: t.brand)),
              const SizedBox(width: DhenuSpacing.sm),
              AnimatedRotation(
                turns: open ? 0.25 : 0,
                duration: const Duration(milliseconds: 180),
                child: Icon(DhenuIcons.chevronRight, size: 18, color: t.inkSoft),
              ),
            ]),
          ),
        ),
        Divider(height: 1, color: t.hairline),
        if (open) _dayDetail(t, l, day.date, names) else _collapsedSummary(t, l, day),
      ]),
    );
  }

  /// Collapsed secondary row: source-node count + qty-weighted avg quality, kept
  /// muted so it reads below the date/total. Colour-graded QC lives in the
  /// expanded per-leg detail.
  Widget _collapsedSummary(DhenuTokens t, AppLocalizations l, MpReceivedDay day) {
    final pending = _pendingToday(day);
    return Padding(
      padding: const EdgeInsets.symmetric(
          horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.md),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (day.totalQty > 0)
          Row(children: [
            Icon(DhenuIcons.package, size: 16, color: t.inkSoft),
            const SizedBox(width: DhenuSpacing.sm),
            Text(leg.sourceCount(day.sourceCount),
                style: DhenuText.caption.copyWith(color: t.inkSoft)),
            if (day.fat != null) ...[
              const Spacer(),
              QualityBadge(fat: day.fat, snf: day.snf, water: day.water,
                  grade: Grade.unknown, format: QualityFormat.valueLabel),
            ],
          ]),
        if (pending > 0.05) ...[
          if (day.totalQty > 0) const SizedBox(height: DhenuSpacing.sm),
          Row(children: [
            Icon(DhenuIcons.truck, size: 16, color: t.inkSoft),
            const SizedBox(width: DhenuSpacing.sm),
            Expanded(
              child: Text(l.historyUpstreamPending(litres(pending, unit: true)),
                  style: DhenuText.caption.copyWith(color: t.inkSoft)),
            ),
          ]),
        ],
        if (day.totalQty == 0 && pending <= 0.05)
          Text(l.historyNothingToday,
              style: DhenuText.caption.copyWith(color: t.inkSoft)),
      ]),
    );
  }

  /// Expanded: fetch this day's consignment rows on demand, then group by source.
  Widget _dayDetail(DhenuTokens t, AppLocalizations l, String date, Map<String, String> names) {
    final async = ref.watch(
        nodeReceivedDayDetailProvider((nodeId: node.id, kind: leg.kind, date: date)));
    return async.when(
      loading: () => const Padding(
        padding: EdgeInsets.all(DhenuSpacing.lg),
        child: Center(
          child: SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2)),
        ),
      ),
      error: (e, _) => Padding(
        padding: const EdgeInsets.all(DhenuSpacing.lg),
        child: Text(l.ccHistoryDayLoadError, style: DhenuText.body.copyWith(color: t.inkSoft)),
      ),
      data: (cs) {
        final sources = _groupBySource(cs);
        final upstream = date == todayIso() ? _upstreamRows(t, l, cs) : const <Widget>[];
        if (sources.isEmpty && upstream.isEmpty) {
          return Padding(
            padding: const EdgeInsets.all(DhenuSpacing.lg),
            child: Text(l.historyNothingToday,
                style: DhenuText.caption.copyWith(color: t.inkSoft)),
          );
        }
        return Column(children: [
          for (var i = 0; i < sources.length; i++) ...[
            if (i > 0) Divider(height: 1, color: t.hairline),
            _entry(context, t, l, date, sources[i], names),
          ],
          ...upstream,
        ]);
      },
    );
  }

  /// Sources still holding today's milk: what they have collected minus what has
  /// reached us. Split into what is still on their floor and what is already on
  /// the road, so the operator knows which ones to chase and which to wait for.
  List<Widget> _upstreamRows(
      DhenuTokens t, AppLocalizations l, List<MpConsignment> received) {
    final receivedBySource = <String, double>{};
    for (final c in received) {
      receivedBySource[c.fromNodeId] =
          (receivedBySource[c.fromNodeId] ?? 0) + (c.receiptQty ?? 0);
    }
    final rows = <({String name, double pending, double atSource})>[];
    for (final u in _upstream) {
      final pending = u.collected - (receivedBySource[u.source.id] ?? 0);
      if (pending <= 0.05) continue;
      rows.add((name: u.source.name, pending: pending, atSource: u.available.clamp(0.0, pending)));
    }
    if (rows.isEmpty) return const [];
    rows.sort((a, b) => b.pending.compareTo(a.pending));
    return [
      Divider(height: 1, color: t.hairline),
      Padding(
        padding: const EdgeInsets.fromLTRB(
            DhenuSpacing.lg, DhenuSpacing.md, DhenuSpacing.lg, DhenuSpacing.xs),
        child: Row(children: [
          Icon(DhenuIcons.clock, size: 14, color: t.inkSoft),
          const SizedBox(width: DhenuSpacing.sm),
          Text(l.historyNotReceivedYet.toUpperCase(),
              style: DhenuText.label.copyWith(color: t.inkSoft)),
        ]),
      ),
      for (final r in rows)
        Padding(
          padding: const EdgeInsets.fromLTRB(
              DhenuSpacing.lg, DhenuSpacing.xs, DhenuSpacing.lg, DhenuSpacing.xs),
          child: Row(children: [
            Icon(leg.sourceIcon, size: 16, color: t.inkSoft),
            const SizedBox(width: DhenuSpacing.md),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(r.name,
                  style: DhenuText.body.copyWith(color: t.inkSoft),
                  overflow: TextOverflow.ellipsis),
              Text(_upstreamSplit(l, r.pending, r.atSource),
                  style: DhenuText.caption.copyWith(color: t.inkSoft)),
            ])),
            const SizedBox(width: DhenuSpacing.sm),
            Text(litres(r.pending, unit: true),
                style: DhenuText.number(size: 15, color: t.inkSoft)),
          ]),
        ),
      const SizedBox(height: DhenuSpacing.md),
    ];
  }

  /// "at source 120 L · In transit 80 L" — whichever halves are non-zero.
  String _upstreamSplit(AppLocalizations l, double pending, double atSource) {
    final transit = pending - atSource;
    return [
      if (atSource > 0.05) '${l.historyAtSource} ${litres(atSource, unit: true)}',
      if (transit > 0.05) '${l.ccInTransitLabel} ${litres(transit, unit: true)}',
    ].join('  ·  ');
  }

  /// Within a day, group a day's receipts by source node (AM+PM legs together),
  /// ordered by descending cumulative qty.
  List<MapEntry<String, List<MpConsignment>>> _groupBySource(List<MpConsignment> day) {
    final m = <String, List<MpConsignment>>{};
    for (final c in day) {
      (m[c.fromNodeId] ??= []).add(c);
    }
    return m.entries.toList()
      ..sort((a, b) => _agg(b.value).qty.compareTo(_agg(a.value).qty));
  }

  /// Cumulative qty + qty-weighted FAT/SNF/Water across a VMCC's legs.
  _Agg _agg(List<MpConsignment> cs) {
    var qty = 0.0, fw = 0.0, fq = 0.0, sw = 0.0, sq = 0.0, ww = 0.0, wq = 0.0;
    for (final c in cs) {
      final q = c.receiptQty ?? 0;
      qty += q;
      if (c.receiptFat != null) { fw += q * c.receiptFat!; fq += q; }
      if (c.receiptSnf != null) { sw += q * c.receiptSnf!; sq += q; }
      if (c.receiptWater != null) { ww += q * c.receiptWater!; wq += q; }
    }
    return (qty: qty, fat: fq > 0 ? fw / fq : null, snf: sq > 0 ? sw / sq : null,
        water: wq > 0 ? ww / wq : null);
  }

  /// A source node's day receipts as a collapsed row that expands inline (no
  /// bottom sheet) into its per-shift legs.
  Widget _entry(BuildContext context, DhenuTokens t, AppLocalizations l, String date,
      MapEntry<String, List<MpConsignment>> e, Map<String, String> names) {
    final key = '$date|${e.key}';
    final expanded = _openSource.contains(key);
    final name = names[e.key] ?? leg.rankingHeader;
    final a = _agg(e.value);
    final shifts = e.value.map((c) => c.shift).toSet();
    // Cow and buffalo grade against different bands, so a source whose day mixes
    // them has no single standard to colour the qty-weighted average against.
    final types = milkTypesIn(e.value.map((c) => c.milkType));
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      InkWell(
        onTap: () => setState(
            () => expanded ? _openSource.remove(key) : _openSource.add(key)),
        child: Padding(
          padding: const EdgeInsets.symmetric(
              horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.md),
          child: Row(children: [
            Icon(DhenuIcons.checkCircle, size: 18, color: t.gradeA),
            const SizedBox(width: DhenuSpacing.md),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(name, style: DhenuText.body.copyWith(color: t.ink, fontWeight: FontWeight.w600)),
              const SizedBox(height: 4),
              Row(children: [
                for (final s in [Shift.am, Shift.pm, null].where(shifts.contains)) ...[
                  Icon(_shiftIcon(s), size: 13, color: t.inkSoft),
                  const SizedBox(width: 4),
                ],
                if (types.length > 1)
                  Text(milkTypesL10n(l, types),
                      style: DhenuText.caption.copyWith(color: t.inkSoft))
                else if (a.fat != null)
                  QualityBadge(fat: a.fat, snf: a.snf, water: a.water,
                      grade: Grade.unknown, format: QualityFormat.valueLabel,
                      bands: _bands, milkType: types.firstOrNull ?? _milkType),
              ]),
            ])),
            const SizedBox(width: DhenuSpacing.sm),
            Text(litres(a.qty, unit: true), style: DhenuText.number(size: 16, color: t.ink)),
            const SizedBox(width: DhenuSpacing.xs),
            AnimatedRotation(
              turns: expanded ? 0.5 : 0,
              duration: const Duration(milliseconds: 180),
              child: Icon(DhenuIcons.chevronDown, size: 16, color: t.inkSoft),
            ),
          ]),
        ),
      ),
      if (expanded) _entryDetail(t, l, date, e.key, e.value),
    ]);
  }

  /// Inline per-shift breakup (replaces the old bottom sheet): each AM/PM/Day leg
  /// with received qty, quality, variance and — on the vmcc→cc leg only — the
  /// effective ₹/L for that shift.
  Widget _entryDetail(DhenuTokens t, AppLocalizations l, String date, String sourceId, List<MpConsignment> cs) {
    final legs = [...cs]..sort((a, b) => _shiftOrder(a.shift).compareTo(_shiftOrder(b.shift)));
    final summary = leg.showRates
        ? ref.watch(nodeDaySummaryProvider((nodeId: sourceId, date: date))).valueOrNull
        : null;
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.fromLTRB(
          DhenuSpacing.x4, 0, DhenuSpacing.lg, DhenuSpacing.md),
      padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.md),
      decoration: BoxDecoration(
        color: t.brand.withValues(alpha: 0.04),
        borderRadius: BorderRadius.circular(DhenuRadii.card),
      ),
      child: Column(children: [
        for (var i = 0; i < legs.length; i++) ...[
          if (i > 0) Divider(height: 1, color: t.hairline),
          _legTile(t, l, legs[i], _rateFor(summary, legs[i], sourceId, date),
              showMilkType: hasMixedMilkTypes(cs.map((c) => c.milkType))),
        ],
      ]),
    );
  }

  /// Effective ₹/L for a leg: the pour-priced shift rate when present, else the
  /// leg's receipt QC resolved against the node's rate chart — manual receipts
  /// carry no per-litre rate, so the summary reports 0. Null on legs that have
  /// no farmer pricing behind them (cc→pp tankers).
  double? _rateFor(MpCollectionSummary? s, MpConsignment c, String sourceId, String date) {
    if (!leg.showRates) return null;
    final r = _legRate(s, c.shift);
    if (r != null) return r;
    if (c.receiptFat == null || c.receiptSnf == null) return null;
    return ref.watch(receiptRateProvider((
      milkType: _sourceMilkType[sourceId] ?? _milkType, fat: c.receiptFat!, snf: c.receiptSnf!,
      nodeId: sourceId, onDate: date,
    ))).valueOrNull;
  }

  /// Effective ₹/L for a leg's shift, from the day's single-VMCC summary
  /// (whole-day legs fall back to gross ÷ litres).
  double? _legRate(MpCollectionSummary? s, Shift? shift) {
    if (s == null) return null;
    if (shift == Shift.am) return s.amRate > 0 ? s.amRate : null;
    if (shift == Shift.pm) return s.pmRate > 0 ? s.pmRate : null;
    final r = s.totalQty > 0 ? s.grossAmount / s.totalQty : 0.0;
    return r > 0 ? r : null;
  }

  int _shiftOrder(Shift? s) => s == Shift.am ? 0 : s == Shift.pm ? 1 : 2;

  IconData _shiftIcon(Shift? s) =>
      s == Shift.am ? DhenuIcons.sun : s == Shift.pm ? DhenuIcons.moon : DhenuIcons.calendar;

  Widget _legTile(DhenuTokens t, AppLocalizations l, MpConsignment c, double? rate,
      {bool showMilkType = false}) {
    final isAm = c.shift == Shift.am, isPm = c.shift == Shift.pm;
    // Same vocabulary the dispatch side uses — a null shift is a pooled
    // whole-day tanker, and both ends should call it the same thing.
    final label = consignmentSlotL10n(l, c.shift);
    final color = isAm ? t.am : isPm ? t.pm : t.inkSoft;
    final v = c.variancePct ?? 0;
    final vColor = v.abs() > 2 ? t.gradeC : t.gradeA;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: DhenuSpacing.md),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // Litres are the number this row exists for, so they are laid out first
        // and never shrink. The labels share what's left: the milk-type pill
        // ellipsises (its label runs long — "Cow A1 (regular)"), which on a
        // narrow phone is what used to push the litres off the right edge.
        Row(children: [
          Expanded(
            child: Row(children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.sm, vertical: 3),
                decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(DhenuRadii.pill)),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  Icon(_shiftIcon(c.shift), size: 13, color: color),
                  const SizedBox(width: 4),
                  Text(label, style: DhenuText.label.copyWith(color: color)),
                ]),
              ),
              if (showMilkType && c.milkType != null) ...[
                const SizedBox(width: DhenuSpacing.sm),
                Flexible(child: MilkTypePill(milkType: c.milkType!)),
              ],
              if (rate != null) ...[
                const SizedBox(width: DhenuSpacing.sm),
                Text('₹/L ${rate.toStringAsFixed(2)}',
                    style: DhenuText.number(size: 13, color: t.brand)),
              ],
            ]),
          ),
          const SizedBox(width: DhenuSpacing.sm),
          Text(litres(c.receiptQty ?? 0, unit: true), style: DhenuText.number(size: 18, color: t.ink)),
        ]),
        RejectedChip(consignment: c),
        RefusedLaterChip(consignment: c),
        const SizedBox(height: DhenuSpacing.sm),
        Row(children: [
          if (c.receiptFat != null)
            QualityBadge(fat: c.receiptFat, snf: c.receiptSnf, water: c.receiptWater,
                grade: Grade.unknown, bands: _bands, milkType: _milkType),
          const Spacer(),
          Text(l.ccVarianceSuffix('${v >= 0 ? '+' : ''}${v.toStringAsFixed(1)}'),
              style: DhenuText.caption.copyWith(color: vColor)),
        ]),
      ]),
    );
  }
}
