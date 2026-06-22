import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/mp_models.dart';
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
/// grouped into per-day sections (newest first). Each row rolls a VMCC's AM+PM
/// legs into one cumulative-qty / weighted-quality entry; tap for the shift
/// breakup. The CC analogue of the VMCC collection history.
class CcReceiveHistory extends ConsumerWidget {
  const CcReceiveHistory({super.key, required this.node});
  final MpNode node;

  static const _days = 30;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = DT(context);
    final async = ref.watch(nodeReceivedRangeProvider((nodeId: node.id, days: _days)));
    final names = {
      for (final n in ref.watch(nodesByTypeProvider('vmcc')).value ?? const <MpNode>[])
        n.id: n.name,
    };
    return RefreshIndicator(
      onRefresh: () async =>
          ref.invalidate(nodeReceivedRangeProvider((nodeId: node.id, days: _days))),
      child: async.when(
        loading: () => const DhenuLoadingList(),
        error: (e, _) => DhenuEmptyState(
            icon: DhenuIcons.cloudOff, title: 'Could not load history', subtitle: '$e'),
        data: (rows) {
          if (rows.isEmpty) {
            return const DhenuEmptyState(
              icon: DhenuIcons.package,
              title: 'No receipts yet',
              subtitle: 'Milk received from VMCCs over the last 30 days shows here',
            );
          }
          final days = _groupByDay(rows);
          return ListView.separated(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: const EdgeInsets.fromLTRB(
                DhenuSpacing.screen, DhenuSpacing.md, DhenuSpacing.screen, DhenuSpacing.x4),
            itemCount: days.length,
            separatorBuilder: (_, _) => const SizedBox(height: DhenuSpacing.lg),
            itemBuilder: (_, i) => _daySection(context, t, days[i], names),
          );
        },
      ),
    );
  }

  /// Received consignments bucketed by collectionDate, days ordered newest-first.
  List<MapEntry<String, List<MpConsignment>>> _groupByDay(List<MpConsignment> rows) {
    final m = <String, List<MpConsignment>>{};
    for (final c in rows) {
      (m[c.collectionDate] ??= []).add(c);
    }
    return m.entries.toList()..sort((a, b) => b.key.compareTo(a.key));
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

  Widget _daySection(BuildContext context, DhenuTokens t,
      MapEntry<String, List<MpConsignment>> day, Map<String, String> names) {
    final vmccs = _groupByVmcc(day.value);
    final total = day.value.fold<double>(0, (a, c) => a + (c.receiptQty ?? 0));
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Expanded(child: Text(prettyDate(day.key), style: DhenuText.title.copyWith(color: t.ink))),
        Text(litres(total, unit: true), style: DhenuText.number(size: 16, color: t.brand)),
      ]),
      const SizedBox(height: DhenuSpacing.sm),
      DhenuCard(
        padding: EdgeInsets.zero,
        child: Column(children: [
          for (var i = 0; i < vmccs.length; i++) ...[
            if (i > 0) Divider(height: 1, color: t.hairline),
            _entry(context, t, day.key, vmccs[i], names),
          ],
        ]),
      ),
    ]);
  }

  Widget _entry(BuildContext context, DhenuTokens t, String date,
      MapEntry<String, List<MpConsignment>> e, Map<String, String> names) {
    final name = names[e.key] ?? 'VMCC';
    final a = _agg(e.value);
    final shifts = e.value.map((c) => c.shift).toSet();
    final glyphs = [
      if (shifts.contains(Shift.am)) '☀️',
      if (shifts.contains(Shift.pm)) '🌙',
      if (shifts.contains(null)) '🗓️',
    ].join(' ');
    return InkWell(
      onTap: () => _openBreakup(context, t, name, date, e.value),
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
              if (glyphs.isNotEmpty) ...[
                Text(glyphs, style: DhenuText.caption),
                const SizedBox(width: DhenuSpacing.sm),
              ],
              if (a.fat != null)
                QualityBadge(fat: a.fat, snf: a.snf, water: a.water,
                    grade: Grade.unknown, format: QualityFormat.valueLabel),
            ]),
          ])),
          const SizedBox(width: DhenuSpacing.sm),
          Text(litres(a.qty, unit: true), style: DhenuText.number(size: 16, color: t.ink)),
          const SizedBox(width: DhenuSpacing.xs),
          Icon(DhenuIcons.chevronRight, size: 16, color: t.inkSoft),
        ]),
      ),
    );
  }

  // ── shift breakup sheet ────────────────────────────────────────────────────
  Future<void> _openBreakup(BuildContext context, DhenuTokens t, String name,
      String date, List<MpConsignment> cs) {
    final legs = [...cs]..sort((a, b) => _shiftOrder(a.shift).compareTo(_shiftOrder(b.shift)));
    return showModalBottomSheet<void>(
      context: context,
      backgroundColor: t.surface,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(DhenuRadii.sheet))),
      builder: (_) => SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
              DhenuSpacing.screen, DhenuSpacing.md, DhenuSpacing.screen, DhenuSpacing.lg),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(child: Container(
                width: 40, height: 4,
                decoration: BoxDecoration(
                    color: t.hairline, borderRadius: BorderRadius.circular(DhenuRadii.pill)),
              )),
              const SizedBox(height: DhenuSpacing.lg),
              Text(name, style: DhenuText.h2.copyWith(color: t.ink)),
              Text(prettyDate(date), style: DhenuText.caption.copyWith(color: t.inkSoft)),
              const SizedBox(height: DhenuSpacing.md),
              for (var i = 0; i < legs.length; i++) ...[
                if (i > 0) Divider(height: 1, color: t.hairline),
                _legTile(t, legs[i]),
              ],
            ]),
        ),
      ),
    );
  }

  int _shiftOrder(Shift? s) => s == Shift.am ? 0 : s == Shift.pm ? 1 : 2;

  Widget _legTile(DhenuTokens t, MpConsignment c) {
    final isAm = c.shift == Shift.am, isPm = c.shift == Shift.pm;
    final label = isAm ? '☀️ AM' : isPm ? '🌙 PM' : '🗓️ Day';
    final color = isAm ? t.am : isPm ? t.pm : t.inkSoft;
    final v = c.variancePct ?? 0;
    final vColor = v.abs() > 2 ? t.gradeC : t.gradeA;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: DhenuSpacing.md),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.sm, vertical: 2),
            decoration: BoxDecoration(
                color: color.withValues(alpha: 0.14),
                borderRadius: BorderRadius.circular(DhenuRadii.pill)),
            child: Text(label, style: DhenuText.label.copyWith(color: color)),
          ),
          const Spacer(),
          Text(litres(c.receiptQty ?? 0, unit: true), style: DhenuText.number(size: 18, color: t.ink)),
        ]),
        const SizedBox(height: DhenuSpacing.sm),
        Row(children: [
          if (c.receiptFat != null)
            QualityBadge(fat: c.receiptFat, snf: c.receiptSnf, water: c.receiptWater,
                grade: Grade.unknown),
          const Spacer(),
          Text('${v >= 0 ? '+' : ''}${v.toStringAsFixed(1)}% var',
              style: DhenuText.caption.copyWith(color: vColor)),
        ]),
      ]),
    );
  }
}
