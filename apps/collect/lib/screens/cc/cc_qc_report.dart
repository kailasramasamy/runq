import 'dart:math' as math;
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
import '../../widgets/hero_number_card.dart';

/// Per-day weighted QC for one chilling centre: qty-weighted FAT/SNF/Water and
/// total received for a single collection date. `null` metric = no data that day.
class _DayQc {
  const _DayQc(this.date, {this.fat, this.snf, this.water, required this.qty});
  final String date;
  final double? fat, snf, water;
  final double qty;
}

/// Running qty-weighted accumulator → resolves to averages (null when no
/// receipts carried that metric).
class _Acc {
  double qty = 0, fatW = 0, fatQ = 0, snfW = 0, snfQ = 0, watW = 0, watQ = 0;
  void add(double q, double? fat, double? snf, double? water) {
    qty += q;
    if (fat != null) { fatW += q * fat; fatQ += q; }
    if (snf != null) { snfW += q * snf; snfQ += q; }
    if (water != null) { watW += q * water; watQ += q; }
  }

  double? get avgFat => fatQ > 0 ? fatW / fatQ : null;
  double? get avgSnf => snfQ > 0 ? snfW / snfQ : null;
  double? get avgWater => watQ > 0 ? watW / watQ : null;
}

/// Aggregated QC report for a CC — qty-weighted FAT/SNF/Water trends over the
/// chosen window (7/14/30 days), one professional line chart per metric.
class CcQcReport extends ConsumerStatefulWidget {
  const CcQcReport({super.key, required this.node});
  final MpNode node;

  @override
  ConsumerState<CcQcReport> createState() => _CcQcReportState();
}

class _CcQcReportState extends ConsumerState<CcQcReport> {
  int _days = 7;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final async = ref.watch(nodeReceivedRangeProvider((nodeId: widget.node.id, days: _days)));
    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(
          nodeReceivedRangeProvider((nodeId: widget.node.id, days: _days))),
      child: async.when(
        loading: () => const DhenuLoadingList(),
        error: (e, _) => DhenuEmptyState(
            icon: DhenuIcons.cloudOff, title: 'Could not load QC data', subtitle: '$e'),
        data: (rows) => _body(t, rows),
      ),
    );
  }

  Widget _body(DhenuTokens t, List<MpConsignment> rows) {
    final days = _aggregate(rows);
    final overall = _Acc();
    for (final c in rows) {
      overall.add(c.receiptQty ?? 0, c.receiptFat, c.receiptSnf, c.receiptWater);
    }
    final hasData = days.any((d) => d.qty > 0);
    final from = days.isEmpty ? '' : prettyDate(days.first.date);
    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(
          DhenuSpacing.screen, DhenuSpacing.md, DhenuSpacing.screen, DhenuSpacing.x4),
      children: [
        _rangeSelector(t),
        const SizedBox(height: DhenuSpacing.md),
        HeroNumberCard(
          label: 'RECEIVED · LAST $_days DAYS',
          primaryValue: litres(overall.qty, unit: true),
          footer: Text('Qty-weighted quality across all VMCC receipts',
              style: DhenuText.body.copyWith(color: t.inkSoft)),
        ),
        if (!hasData) ...[
          const SizedBox(height: DhenuSpacing.xl),
          const DhenuEmptyState(
            icon: DhenuIcons.barChart,
            title: 'No receipts in this window',
            subtitle: 'Receive milk from VMCCs to see quality trends',
          ),
        ] else ...[
          const SizedBox(height: DhenuSpacing.md),
          _chartCard(t, 'FAT', '%', t.brand, days, overall.avgFat, (d) => d.fat, from),
          const SizedBox(height: DhenuSpacing.md),
          _chartCard(t, 'SNF', '%', t.am, days, overall.avgSnf, (d) => d.snf, from),
          const SizedBox(height: DhenuSpacing.md),
          _chartCard(t, 'Water', '%', t.pm, days, overall.avgWater, (d) => d.water, from),
        ],
      ],
    );
  }

  /// One per-day weighted point for every date in the window (oldest → newest).
  List<_DayQc> _aggregate(List<MpConsignment> rows) {
    final dates = [for (var i = _days - 1; i >= 0; i--) isoDaysAgo(i)];
    final acc = {for (final d in dates) d: _Acc()};
    for (final c in rows) {
      acc[c.collectionDate]?.add(c.receiptQty ?? 0, c.receiptFat, c.receiptSnf, c.receiptWater);
    }
    return [
      for (final d in dates)
        _DayQc(d, fat: acc[d]!.avgFat, snf: acc[d]!.avgSnf, water: acc[d]!.avgWater, qty: acc[d]!.qty),
    ];
  }

  Widget _rangeSelector(DhenuTokens t) {
    return Row(children: [
      for (final d in const [7, 14, 30]) ...[
        Expanded(child: _rangeChip(t, d)),
        if (d != 30) const SizedBox(width: DhenuSpacing.sm),
      ],
    ]);
  }

  Widget _rangeChip(DhenuTokens t, int d) {
    final on = _days == d;
    return GestureDetector(
      onTap: () => setState(() => _days = d),
      child: Container(
        height: 38,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: on ? t.brand : t.inputFill,
          borderRadius: BorderRadius.circular(DhenuRadii.input),
          border: Border.all(color: on ? t.brand : t.hairline),
        ),
        child: Text('$d days',
            style: DhenuText.label.copyWith(color: on ? Colors.white : t.inkSoft)),
      ),
    );
  }

  Widget _chartCard(DhenuTokens t, String title, String unit, Color color, List<_DayQc> days,
      double? avg, double? Function(_DayQc) sel, String from) {
    final values = days.map(sel).toList();
    final present = values.whereType<double>().toList();
    return DhenuCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Expanded(child: Text(title.toUpperCase(),
              style: DhenuText.label.copyWith(color: t.inkSoft, letterSpacing: 0.8))),
          if (avg != null) ...[
            Text(oneDp(avg), style: DhenuText.number(size: 24, color: color)),
            const SizedBox(width: 2),
            Padding(
              padding: const EdgeInsets.only(bottom: 3),
              child: Text(unit, style: DhenuText.caption.copyWith(color: t.inkSoft)),
            ),
          ],
        ]),
        Text('$_days-day average', style: DhenuText.caption.copyWith(color: t.inkSoft)),
        const SizedBox(height: DhenuSpacing.md),
        if (present.length < 2)
          SizedBox(
            height: 120,
            child: Center(child: Text('Not enough data to chart',
                style: DhenuText.caption.copyWith(color: t.inkSoft))),
          )
        else ...[
          SizedBox(
            height: 150,
            child: CustomPaint(
              painter: _QcLinePainter(
                values: values, color: color, grid: t.hairline, label: t.inkSoft, unit: unit),
            ),
          ),
          const SizedBox(height: DhenuSpacing.xs),
          Row(children: [
            Text(from, style: DhenuText.caption.copyWith(color: t.inkSoft)),
            const Spacer(),
            Text('Today', style: DhenuText.caption.copyWith(color: t.inkSoft)),
          ]),
        ],
      ]),
    );
  }
}

/// Single-metric trend line over the window: padded auto y-range, 3 value
/// gridlines, area fill, per-day dots and a highlighted latest reading.
class _QcLinePainter extends CustomPainter {
  _QcLinePainter({
    required this.values,
    required this.color,
    required this.grid,
    required this.label,
    required this.unit,
  });
  final List<double?> values;
  final Color color, grid, label;
  final String unit;

  static const _gutter = 34.0, _top = 14.0, _bottom = 6.0;

  @override
  void paint(Canvas canvas, Size size) {
    final present = values.whereType<double>().toList();
    if (present.length < 2) return;
    var lo = present.reduce(math.min), hi = present.reduce(math.max);
    final pad = (hi - lo).abs() < 1e-6 ? math.max(hi.abs() * 0.05, 0.5) : (hi - lo) * 0.18;
    lo -= pad; hi += pad;
    final left = _gutter, right = size.width, bottom = size.height - _bottom;
    final dx = (right - left) / (values.length - 1);
    double yFor(double v) => bottom - (v - lo) / (hi - lo) * (bottom - _top);

    _grid(canvas, left, right, lo, hi, yFor);
    _line(canvas, left, dx, bottom, yFor);
  }

  void _grid(Canvas canvas, double left, double right, double lo, double hi, double Function(double) yFor) {
    final p = Paint()..color = grid..strokeWidth = 1;
    for (final f in const [0.0, 0.5, 1.0]) {
      final v = lo + (hi - lo) * f, y = yFor(v);
      canvas.drawLine(Offset(left, y), Offset(right, y), p);
      _text(canvas, v.toStringAsFixed(1), Offset(0, y - 6), label);
    }
  }

  void _line(Canvas canvas, double left, double dx, double bottom, double Function(double) yFor) {
    final pts = <Offset>[];
    for (var i = 0; i < values.length; i++) {
      final v = values[i];
      if (v != null) pts.add(Offset(left + i * dx, yFor(v)));
    }
    final line = Path()..moveTo(pts.first.dx, pts.first.dy);
    for (final pt in pts.skip(1)) {
      line.lineTo(pt.dx, pt.dy);
    }
    final area = Path.from(line)
      ..lineTo(pts.last.dx, bottom)
      ..lineTo(pts.first.dx, bottom)
      ..close();
    canvas.drawPath(area, Paint()
      ..shader = LinearGradient(
        begin: Alignment.topCenter, end: Alignment.bottomCenter,
        colors: [color.withValues(alpha: 0.22), color.withValues(alpha: 0.0)],
      ).createShader(Rect.fromLTRB(left, _top, left + 1, bottom)));
    canvas.drawPath(line, Paint()
      ..color = color..style = PaintingStyle.stroke..strokeWidth = 2.4
      ..strokeJoin = StrokeJoin.round..strokeCap = StrokeCap.round);
    for (final pt in pts) {
      canvas.drawCircle(pt, 2.6, Paint()..color = color);
    }
    canvas.drawCircle(pts.last, 4.2, Paint()..color = color);
    _text(canvas, '${values.lastWhere((v) => v != null)!.toStringAsFixed(1)}$unit',
        Offset(pts.last.dx - 22, pts.last.dy - 18), color);
  }

  void _text(Canvas canvas, String s, Offset at, Color col) {
    final tp = TextPainter(
      text: TextSpan(text: s,
          style: TextStyle(color: col, fontSize: 10, fontWeight: FontWeight.w600)),
      textDirection: TextDirection.ltr,
    )..layout();
    tp.paint(canvas, at);
  }

  @override
  bool shouldRepaint(covariant _QcLinePainter old) =>
      old.values != values || old.color != color;
}
