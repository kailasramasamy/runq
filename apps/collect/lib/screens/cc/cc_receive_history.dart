import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
import '../../providers/mp_context_provider.dart';
import '../../providers/transfer_providers.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_states.dart';
import '../../widgets/quality_badge.dart';

/// Qty-weighted roll-up of one VMCC's receipts on a day (its AM + PM legs).
typedef _Agg = ({double qty, double? fat, double? snf, double? water});

/// CC receive history — receipts at this chilling centre over the last 30 days,
/// shown as per-day sections (newest first). The day list is a light server
/// rollup (one weighted-quality row per day); only the expanded day's per-VMCC
/// detail is fetched, so neither the API nor the app loads 30 days of rows at
/// once. The most recent day opens expanded; earlier days collapse to a qty +
/// avg-quality summary and load their detail on tap.
class CcReceiveHistory extends ConsumerStatefulWidget {
  const CcReceiveHistory({super.key, required this.node});
  final MpNode node;

  static const _days = 30;

  @override
  ConsumerState<CcReceiveHistory> createState() => _CcReceiveHistoryState();
}

class _CcReceiveHistoryState extends ConsumerState<CcReceiveHistory> {
  final _open = <String>{};
  final _openVmcc = <String>{}; // expanded per-VMCC entries, keyed "date|vmccId"
  bool _seeded = false;
  QualityBands _bands = QualityBands.empty;
  MilkType _milkType = MilkType.cowA1;

  MpNode get node => widget.node;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    _bands = ref.watch(qualityBandsProvider(node.id)).valueOrNull ?? QualityBands.empty;
    _milkType = node.effectiveMilkType;
    final async =
        ref.watch(nodeReceivedDailyProvider((nodeId: node.id, days: CcReceiveHistory._days)));
    final names = {
      for (final n in ref.watch(nodesByTypeProvider('vmcc')).value ?? const <MpNode>[])
        n.id: n.name,
    };
    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(
            nodeReceivedDailyProvider((nodeId: node.id, days: CcReceiveHistory._days)));
        for (final d in _open) {
          ref.invalidate(nodeReceivedDayDetailProvider((nodeId: node.id, date: d)));
        }
      },
      child: async.when(
        loading: () => const DhenuLoadingList(),
        error: (e, _) => DhenuEmptyState(
            icon: DhenuIcons.cloudOff, title: 'Could not load history', subtitle: '$e'),
        data: (days) {
          if (days.isEmpty) {
            return const DhenuEmptyState(
              icon: DhenuIcons.package,
              title: 'No receipts yet',
              subtitle: 'Milk received from VMCCs over the last 30 days shows here',
            );
          }
          if (!_seeded) {
            _open.add(days.first.date);
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

  /// A day header (date + cumulative qty) over either the collapsed summary or,
  /// when open, the lazily-loaded per-VMCC detail.
  Widget _daySection(DhenuTokens t, MpReceivedDay day, Map<String, String> names) {
    final open = _open.contains(day.date);
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      InkWell(
        borderRadius: BorderRadius.circular(DhenuRadii.card),
        onTap: () => setState(() => open ? _open.remove(day.date) : _open.add(day.date)),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: DhenuSpacing.xs),
          child: Row(children: [
            Icon(open ? DhenuIcons.chevronDown : DhenuIcons.chevronRight,
                size: 18, color: t.inkSoft),
            const SizedBox(width: DhenuSpacing.xs),
            Expanded(
                child: Text(prettyDate(day.date), style: DhenuText.title.copyWith(color: t.ink))),
            Text(litres(day.totalQty, unit: true),
                style: DhenuText.number(size: 16, color: t.brand)),
          ]),
        ),
      ),
      const SizedBox(height: DhenuSpacing.sm),
      if (open) _dayDetail(t, day.date, names) else _collapsedSummary(t, day),
    ]);
  }

  /// Collapsed: VMCC count + qty-weighted avg quality, straight from the rollup.
  Widget _collapsedSummary(DhenuTokens t, MpReceivedDay day) {
    return DhenuCard(
      child: Row(children: [
        Icon(DhenuIcons.package, size: 18, color: t.inkSoft),
        const SizedBox(width: DhenuSpacing.md),
        Expanded(
            child: Text('${day.vmccCount} VMCC${day.vmccCount == 1 ? '' : 's'}',
                style: DhenuText.body.copyWith(color: t.inkSoft))),
        if (day.fat != null)
          QualityBadge(fat: day.fat, snf: day.snf, water: day.water,
              grade: Grade.unknown, format: QualityFormat.valueLabel,
              bands: _bands, milkType: _milkType),
      ]),
    );
  }

  /// Expanded: fetch this day's consignment rows on demand, then group by VMCC.
  Widget _dayDetail(DhenuTokens t, String date, Map<String, String> names) {
    final async = ref.watch(nodeReceivedDayDetailProvider((nodeId: node.id, date: date)));
    return async.when(
      loading: () => DhenuCard(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(DhenuSpacing.sm),
            child: SizedBox(
                width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2, color: t.brand)),
          ),
        ),
      ),
      error: (e, _) => DhenuCard(
        child: Text('Could not load this day', style: DhenuText.body.copyWith(color: t.inkSoft)),
      ),
      data: (cs) {
        final vmccs = _groupByVmcc(cs);
        return DhenuCard(
          padding: EdgeInsets.zero,
          child: Column(children: [
            for (var i = 0; i < vmccs.length; i++) ...[
              if (i > 0) Divider(height: 1, color: t.hairline),
              _entry(context, t, date, vmccs[i], names),
            ],
          ]),
        );
      },
    );
  }

  /// Within a day, group a day's receipts by source VMCC (AM+PM legs together),
  /// ordered by descending cumulative qty.
  List<MapEntry<String, List<MpConsignment>>> _groupByVmcc(List<MpConsignment> day) {
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

  /// A VMCC's day receipts as a collapsed row that expands inline (no bottom
  /// sheet) into its per-shift legs.
  Widget _entry(BuildContext context, DhenuTokens t, String date,
      MapEntry<String, List<MpConsignment>> e, Map<String, String> names) {
    final key = '$date|${e.key}';
    final expanded = _openVmcc.contains(key);
    final name = names[e.key] ?? 'VMCC';
    final a = _agg(e.value);
    final shifts = e.value.map((c) => c.shift).toSet();
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      InkWell(
        onTap: () => setState(
            () => expanded ? _openVmcc.remove(key) : _openVmcc.add(key)),
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
                if (a.fat != null)
                  QualityBadge(fat: a.fat, snf: a.snf, water: a.water,
                      grade: Grade.unknown, format: QualityFormat.valueLabel,
                      bands: _bands, milkType: _milkType),
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
      if (expanded) _entryDetail(t, date, e.key, e.value),
    ]);
  }

  /// Inline per-shift breakup (replaces the old bottom sheet): each AM/PM/Day leg
  /// with received qty, quality, variance and the effective ₹/L for that shift.
  Widget _entryDetail(DhenuTokens t, String date, String vmccId, List<MpConsignment> cs) {
    final legs = [...cs]..sort((a, b) => _shiftOrder(a.shift).compareTo(_shiftOrder(b.shift)));
    final summary = ref.watch(nodeDaySummaryProvider((nodeId: vmccId, date: date))).valueOrNull;
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
          _legTile(t, legs[i], _legRate(summary, legs[i].shift)),
        ],
      ]),
    );
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

  Widget _legTile(DhenuTokens t, MpConsignment c, double? rate) {
    final isAm = c.shift == Shift.am, isPm = c.shift == Shift.pm;
    final label = isAm ? 'AM' : isPm ? 'PM' : 'Day';
    final color = isAm ? t.am : isPm ? t.pm : t.inkSoft;
    final v = c.variancePct ?? 0;
    final vColor = v.abs() > 2 ? t.gradeC : t.gradeA;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: DhenuSpacing.md),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
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
          if (rate != null) ...[
            const SizedBox(width: DhenuSpacing.sm),
            Text('₹/L ${rate.toStringAsFixed(2)}',
                style: DhenuText.number(size: 13, color: t.brand)),
          ],
          const Spacer(),
          Text(litres(c.receiptQty ?? 0, unit: true), style: DhenuText.number(size: 18, color: t.ink)),
        ]),
        const SizedBox(height: DhenuSpacing.sm),
        Row(children: [
          if (c.receiptFat != null)
            QualityBadge(fat: c.receiptFat, snf: c.receiptSnf, water: c.receiptWater,
                grade: Grade.unknown, bands: _bands, milkType: _milkType),
          const Spacer(),
          Text('${v >= 0 ? '+' : ''}${v.toStringAsFixed(1)}% var',
              style: DhenuText.caption.copyWith(color: vColor)),
        ]),
      ]),
    );
  }
}
