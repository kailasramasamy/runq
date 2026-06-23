import 'package:flutter/material.dart';
import '../../api/mp_models.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../utils/format.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_states.dart';
import 'qc_report_view.dart';

enum _SortKey { litres, fat, snf, water }

typedef _Row = ({MpNode vmcc, QcAcc acc});

/// Per-VMCC QC leaderboard — every child VMCC ranked side by side on
/// qty-weighted FAT/SNF/Water and total received over the window. Tap a column
/// header to re-rank by that metric (Water defaults low→high, the rest high→low).
class QcVmccRanking extends StatefulWidget {
  const QcVmccRanking({super.key, required this.rows, required this.vmccs, required this.days});
  final List<MpConsignment> rows;
  final List<MpNode> vmccs;
  final int days;

  @override
  State<QcVmccRanking> createState() => _QcVmccRankingState();
}

class _QcVmccRankingState extends State<QcVmccRanking> {
  _SortKey _key = _SortKey.litres;
  bool _desc = true;

  double? _metric(_Row r) => switch (_key) {
        _SortKey.litres => r.acc.qty,
        _SortKey.fat => r.acc.avgFat,
        _SortKey.snf => r.acc.avgSnf,
        _SortKey.water => r.acc.avgWater,
      };

  void _sortBy(_SortKey k) => setState(() {
        if (_key == k) {
          _desc = !_desc;
        } else {
          _key = k;
          _desc = k != _SortKey.water; // Water: lower is better → ascending default
        }
      });

  int _compare(_Row a, _Row b) {
    // VMCCs with no receipts always sink to the bottom.
    final aEmpty = a.acc.qty <= 0, bEmpty = b.acc.qty <= 0;
    if (aEmpty != bEmpty) return aEmpty ? 1 : -1;
    final av = _metric(a), bv = _metric(b);
    if (av == null && bv == null) return a.vmcc.name.compareTo(b.vmcc.name);
    if (av == null) return 1;
    if (bv == null) return -1;
    final cmp = av.compareTo(bv);
    return _desc ? -cmp : cmp;
  }

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final accById = {for (final v in widget.vmccs) v.id: QcAcc()};
    for (final c in widget.rows) {
      accById[c.fromNodeId]?.add(c.receiptQty ?? 0, c.receiptFat, c.receiptSnf, c.receiptWater);
    }
    final rows = [for (final v in widget.vmccs) (vmcc: v, acc: accById[v.id]!)]..sort(_compare);
    final totalQty = rows.fold<double>(0, (a, r) => a + r.acc.qty);
    final active = rows.where((r) => r.acc.qty > 0).length;
    final withData = rows.where((r) => r.acc.qty > 0).toList();

    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(
          DhenuSpacing.screen, DhenuSpacing.sm, DhenuSpacing.screen, DhenuSpacing.x4),
      children: [
        _summary(t, active, widget.vmccs.length, totalQty),
        const SizedBox(height: DhenuSpacing.md),
        if (widget.vmccs.isEmpty)
          const DhenuEmptyState(
            icon: DhenuIcons.store,
            title: 'No VMCCs linked',
            subtitle: 'Assign VMCCs to this CC in the web admin',
          )
        else ...[
          DhenuCard(
            padding: EdgeInsets.zero,
            child: Column(children: [
              _header(t),
              for (var i = 0; i < rows.length; i++) ...[
                Divider(height: 1, color: t.hairline),
                _row(t, i + 1, rows[i]),
              ],
            ]),
          ),
          _metricSection(t, 'By FAT', 'high → low', t.brand,
              _sorted(withData, (a) => a.avgFat, desc: true), (a) => a.avgFat),
          _metricSection(t, 'By SNF', 'high → low', t.am,
              _sorted(withData, (a) => a.avgSnf, desc: true), (a) => a.avgSnf),
          _metricSection(t, 'By Water', 'low → high', t.pm,
              _sorted(withData, (a) => a.avgWater, desc: false), (a) => a.avgWater),
        ],
      ],
    );
  }

  /// VMCCs that carry [metric], ranked best-first (desc for FAT/SNF, asc Water).
  List<_Row> _sorted(List<_Row> src, double? Function(QcAcc) metric, {required bool desc}) {
    final list = src.where((r) => metric(r.acc) != null).toList()
      ..sort((a, b) {
        final cmp = metric(a.acc)!.compareTo(metric(b.acc)!);
        return desc ? -cmp : cmp;
      });
    return list;
  }

  Widget _metricSection(DhenuTokens t, String title, String hint, Color accent,
      List<_Row> ranked, double? Function(QcAcc) metric) {
    if (ranked.isEmpty) return const SizedBox.shrink();
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const SizedBox(height: DhenuSpacing.lg),
      Row(children: [
        Text(title, style: DhenuText.label.copyWith(color: accent, letterSpacing: 0.6)),
        const SizedBox(width: DhenuSpacing.xs),
        Text('· $hint', style: DhenuText.caption.copyWith(color: t.inkSoft)),
      ]),
      const SizedBox(height: DhenuSpacing.sm),
      DhenuCard(
        padding: EdgeInsets.zero,
        child: Column(children: [
          for (var i = 0; i < ranked.length; i++) ...[
            if (i > 0) Divider(height: 1, color: t.hairline),
            _metricRow(t, i + 1, ranked[i], accent, metric),
          ],
        ]),
      ),
    ]);
  }

  Widget _metricRow(
      DhenuTokens t, int rank, _Row r, Color accent, double? Function(QcAcc) metric) {
    final v = metric(r.acc);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.sm),
      child: Row(children: [
        SizedBox(
            width: 22,
            child: Text('$rank',
                style: DhenuText.number(size: 13, color: rank == 1 ? accent : t.inkSoft))),
        Expanded(
            child: Text(r.vmcc.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: DhenuText.body.copyWith(color: t.ink, fontWeight: FontWeight.w600))),
        Text(v == null ? '—' : oneDp(v), style: DhenuText.number(size: 15, color: accent)),
        const SizedBox(width: DhenuSpacing.md),
        SizedBox(
            width: 64,
            child: Text(litres(r.acc.qty, unit: true),
                textAlign: TextAlign.right,
                style: DhenuText.caption.copyWith(color: t.inkSoft))),
      ]),
    );
  }

  Widget _summary(DhenuTokens t, int active, int total, double qty) => DhenuCard(
        padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.md),
        child: Row(children: [
          Icon(DhenuIcons.trophy, size: 18, color: t.brand),
          const SizedBox(width: DhenuSpacing.sm),
          Expanded(
              child: Text('$active of $total VMCCs delivered · last ${widget.days} days',
                  style: DhenuText.body.copyWith(color: t.ink, fontWeight: FontWeight.w600))),
          Text(litres(qty, unit: true), style: DhenuText.number(size: 16, color: t.brand)),
        ]),
      );

  Widget _header(DhenuTokens t) => Padding(
        padding: const EdgeInsets.fromLTRB(
            DhenuSpacing.lg, DhenuSpacing.sm, DhenuSpacing.lg, DhenuSpacing.sm),
        child: Row(children: [
          const SizedBox(width: 22),
          Expanded(flex: 5, child: Text('VMCC', style: _hStyle(t))),
          _hCell(t, 'L', _SortKey.litres, 3),
          _hCell(t, 'FAT', _SortKey.fat, 2),
          _hCell(t, 'SNF', _SortKey.snf, 2),
          _hCell(t, 'W', _SortKey.water, 2),
        ]),
      );

  TextStyle _hStyle(DhenuTokens t) => DhenuText.caption.copyWith(color: t.inkSoft, letterSpacing: 0.5);

  Widget _hCell(DhenuTokens t, String label, _SortKey k, int flex) {
    final on = _key == k;
    return Expanded(
      flex: flex,
      child: GestureDetector(
        onTap: () => _sortBy(k),
        behavior: HitTestBehavior.opaque,
        child: Row(mainAxisAlignment: MainAxisAlignment.end, children: [
          Text(label,
              style: _hStyle(t).copyWith(
                  color: on ? t.brand : t.inkSoft,
                  fontWeight: on ? FontWeight.w700 : FontWeight.w500)),
          if (on)
            Icon(_desc ? DhenuIcons.chevronDown : DhenuIcons.chevronUp, size: 12, color: t.brand),
        ]),
      ),
    );
  }

  Widget _row(DhenuTokens t, int rank, _Row r) {
    final empty = r.acc.qty <= 0;
    final rankColor = (rank == 1 && !empty) ? t.brand : t.inkSoft;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.md),
      child: Row(children: [
        SizedBox(
            width: 22,
            child: Text(empty ? '·' : '$rank', style: DhenuText.number(size: 13, color: rankColor))),
        Expanded(
            flex: 5,
            child: Text(r.vmcc.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: DhenuText.body
                    .copyWith(color: empty ? t.inkSoft : t.ink, fontWeight: FontWeight.w600))),
        Expanded(
            flex: 3,
            child: Text(empty ? '—' : litres(r.acc.qty),
                textAlign: TextAlign.right,
                style: DhenuText.number(size: 14, color: empty ? t.inkSoft : t.ink))),
        Expanded(flex: 2, child: _mCell(t, r.acc.avgFat)),
        Expanded(flex: 2, child: _mCell(t, r.acc.avgSnf)),
        Expanded(flex: 2, child: _mCell(t, r.acc.avgWater)),
      ]),
    );
  }

  Widget _mCell(DhenuTokens t, double? v) => Text(
        v == null ? '—' : oneDp(v),
        textAlign: TextAlign.right,
        style: DhenuText.number(size: 14, color: v == null ? t.inkSoft : t.ink),
      );
}
