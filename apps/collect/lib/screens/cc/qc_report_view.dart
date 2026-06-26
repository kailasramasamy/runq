import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../api/mp_models.dart';
import '../../utils/format.dart';
import '../../widgets/dhenu_card.dart';
import '../../widgets/dhenu_states.dart';
import '../../widgets/hero_number_card.dart';
import '../../widgets/quality_badge.dart';

/// Running qty-weighted accumulator → resolves to averages (null when no
/// receipts carried that metric). Shared by the QC report and the VMCC ranking.
class QcAcc {
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

/// One QC reading for the report: a dated quantity with optional FAT/SNF/Water.
/// Decouples [QcReportView] from the source (CC consignments or VMCC pours).
typedef QcSample = ({String date, double qty, double? fat, double? snf, double? water});

/// Per-day weighted QC: qty-weighted FAT/SNF/Water and total for one date.
class _DayQc {
  const _DayQc(this.date, {this.fat, this.snf, this.water, required this.qty});
  final String date;
  final double? fat, snf, water;
  final double qty;
}

/// Weighted FAT/SNF/Water QC report over a window for an already-filtered set of
/// receipts (all VMCCs, or one VMCC): hero total, per-metric trend charts and a
/// daily breakdown table. Scrollable on its own.
class QcReportView extends StatelessWidget {
  const QcReportView({
    super.key,
    required this.samples,
    required this.days,
    required this.heroLabel,
    required this.heroFooter,
    this.emptyTitle = 'No receipts in this window',
    this.emptySubtitle = 'Receive milk from VMCCs to see the daily QC report',
    this.bands,
    this.milkType,
  });

  final List<QcSample> samples;
  final int days;
  final String heroLabel, heroFooter, emptyTitle, emptySubtitle;

  /// Bands + the node's effective milk type colour the daily FAT/SNF cells
  /// (these are qty-weighted, mixed-type aggregates). Null → no colouring.
  final QualityBands? bands;
  final MilkType? milkType;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final daily = _aggregate(samples);
    final overall = QcAcc();
    for (final s in samples) {
      overall.add(s.qty, s.fat, s.snf, s.water);
    }
    final hasData = daily.any((d) => d.qty > 0);
    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(
          DhenuSpacing.screen, DhenuSpacing.sm, DhenuSpacing.screen, DhenuSpacing.x4),
      children: [
        HeroNumberCard(
          label: heroLabel,
          primaryValue: litres(overall.qty, unit: true),
          footer: Text(heroFooter, style: DhenuText.body.copyWith(color: t.inkSoft)),
        ),
        if (!hasData) ...[
          const SizedBox(height: DhenuSpacing.xl),
          DhenuEmptyState(
              icon: DhenuIcons.barChart,
              title: emptyTitle,
              subtitle: emptySubtitle),
        ] else ...[
          const SizedBox(height: DhenuSpacing.lg),
          Text('Quality trends', style: DhenuText.label.copyWith(color: t.inkSoft)),
          const SizedBox(height: DhenuSpacing.sm),
          _chartCard(t, 'FAT', '%', t.brand, daily, (d) => d.fat),
          const SizedBox(height: DhenuSpacing.md),
          _chartCard(t, 'SNF', '%', t.am, daily, (d) => d.snf),
          const SizedBox(height: DhenuSpacing.md),
          _chartCard(t, 'Water', '%', t.pm, daily, (d) => d.water),
          const SizedBox(height: DhenuSpacing.lg),
          Text('Daily quality · qty-weighted',
              style: DhenuText.label.copyWith(color: t.inkSoft)),
          const SizedBox(height: DhenuSpacing.sm),
          _dailyTable(t, daily),
        ],
      ],
    );
  }

  /// One per-day weighted point for every date in the window (oldest → newest).
  List<_DayQc> _aggregate(List<QcSample> samples) {
    final dates = [for (var i = days - 1; i >= 0; i--) isoDaysAgo(i)];
    final acc = {for (final d in dates) d: QcAcc()};
    for (final s in samples) {
      acc[s.date]?.add(s.qty, s.fat, s.snf, s.water);
    }
    return [
      for (final d in dates)
        _DayQc(d, fat: acc[d]!.avgFat, snf: acc[d]!.avgSnf, water: acc[d]!.avgWater, qty: acc[d]!.qty),
    ];
  }

  Widget _dailyTable(DhenuTokens t, List<_DayQc> days) {
    final rows = days.where((d) => d.qty > 0).toList().reversed.toList();
    return DhenuCard(
      padding: EdgeInsets.zero,
      child: Column(children: [
        _tableHeader(t),
        for (final r in rows) ...[
          Divider(height: 1, color: t.hairline),
          _dayRow(t, r),
        ],
      ]),
    );
  }

  Widget _tableHeader(DhenuTokens t) {
    final s = DhenuText.caption.copyWith(color: t.inkSoft, letterSpacing: 0.6);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.sm),
      child: Row(children: [
        Expanded(flex: 4, child: Text('DATE', style: s)),
        Expanded(flex: 3, child: Text('L', style: s, textAlign: TextAlign.right)),
        Expanded(flex: 2, child: Text('FAT', style: s, textAlign: TextAlign.right)),
        Expanded(flex: 2, child: Text('SNF', style: s, textAlign: TextAlign.right)),
        Expanded(flex: 2, child: Text('W', style: s, textAlign: TextAlign.right)),
      ]),
    );
  }

  Widget _dayRow(DhenuTokens t, _DayQc d) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.md),
        child: Row(children: [
          Expanded(flex: 4, child: Text(shortDate(d.date), style: DhenuText.body.copyWith(color: t.ink))),
          Expanded(flex: 3, child: Text(litres(d.qty),
              textAlign: TextAlign.right, style: DhenuText.number(size: 14, color: t.ink))),
          Expanded(flex: 2, child: _qcCell(t, 'fat', d.fat)),
          Expanded(flex: 2, child: _qcCell(t, 'snf', d.snf)),
          Expanded(flex: 2, child: _qcCell(t, null, d.water)),
        ]),
      );

  Widget _qcCell(DhenuTokens t, String? metric, double? v) {
    final banded = metric == null
        ? null
        : QualityBadge.bandColor(bands, milkType, metric, v, t);
    return Text(
      v == null ? '—' : oneDp(v),
      textAlign: TextAlign.right,
      style: DhenuText.number(size: 14, color: v == null ? t.inkSoft : (banded ?? t.ink)),
    );
  }

  /// Per-day vertical bar chart of the metric's daily qty-weighted value.
  Widget _chartCard(DhenuTokens t, String title, String unit, Color color,
      List<_DayQc> days, double? Function(_DayQc) sel) {
    final points = [for (final d in days) if (sel(d) != null) (_barLabel(d.date), sel(d)!)];
    return DhenuCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('$title  ($unit)',
            style: DhenuText.label.copyWith(color: color, letterSpacing: 0.6)),
        const SizedBox(height: DhenuSpacing.md),
        if (points.isEmpty)
          SizedBox(
            height: 100,
            child: Center(child: Text('No readings in this window',
                style: DhenuText.caption.copyWith(color: t.inkSoft))),
          )
        else
          SizedBox(
            height: 165,
            width: double.infinity,
            child: CustomPaint(
              painter: _QcBarPainter(points: points, color: color, label: t.inkSoft),
            ),
          ),
      ]),
    );
  }

  /// Compact bar label — the day-of-month number.
  String _barLabel(String iso) {
    final d = iso.length >= 10 ? iso.substring(8, 10) : iso;
    return int.tryParse(d)?.toString() ?? d;
  }
}

/// Per-day vertical bars with the value on top and the day below. Scales to the
/// window's max value with headroom; labels are dropped when bars get too thin.
class _QcBarPainter extends CustomPainter {
  _QcBarPainter({required this.points, required this.color, required this.label});
  final List<(String, double)> points;
  final Color color, label;

  static const _topPad = 16.0, _bottomPad = 16.0;

  @override
  void paint(Canvas canvas, Size size) {
    if (points.isEmpty) return;
    final maxV = points.map((p) => p.$2).reduce(math.max);
    final denom = maxV <= 0 ? 1.0 : maxV * 1.18;
    final n = points.length;
    final showLabels = n <= 12;
    // Tighten the gap as bars multiply so a 90-day window still renders visible
    // bars instead of sub-pixel slivers.
    final gap = n <= 14 ? 8.0 : (n <= 31 ? 3.0 : 1.0);
    var bw = (size.width - gap * (n - 1)) / n;
    bw = math.min(bw, 40.0);
    final totalW = bw * n + gap * (n - 1);
    final startX = (size.width - totalW) / 2;
    final radius = Radius.circular(math.min(bw * 0.3, 4));
    final baseY = size.height - _bottomPad;
    final usableH = baseY - _topPad;
    final barPaint = Paint()..color = color.withValues(alpha: 0.85);
    for (var i = 0; i < n; i++) {
      final (dayLabel, v) = points[i];
      final h = (v / denom) * usableH;
      final x = startX + i * (bw + gap);
      final rect = Rect.fromLTWH(x, baseY - h, bw, h);
      canvas.drawRRect(
          RRect.fromRectAndCorners(rect, topLeft: radius, topRight: radius), barPaint);
      if (showLabels) {
        _text(canvas, v.toStringAsFixed(1), x + bw / 2, baseY - h - 13, color, 10);
        _text(canvas, dayLabel, x + bw / 2, baseY + 3, label, 9);
      }
    }
  }

  void _text(Canvas canvas, String s, double cx, double y, Color col, double fontSize) {
    final tp = TextPainter(
      text: TextSpan(text: s,
          style: TextStyle(color: col, fontSize: fontSize, fontWeight: FontWeight.w600)),
      textDirection: TextDirection.ltr,
    )..layout();
    tp.paint(canvas, Offset(cx - tp.width / 2, y));
  }

  @override
  bool shouldRepaint(covariant _QcBarPainter old) =>
      old.points != points || old.color != color;
}
