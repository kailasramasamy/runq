import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../../theme/dhenu_icons.dart';
import '../../theme/dhenu_theme.dart';
import '../../theme/dhenu_tokens.dart';
import '../../api/mp_models.dart';
import '../../l10n/app_localizations.dart';
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
    this.emptyTitle,
    this.emptySubtitle,
    this.bands,
    this.milkType,
  });

  final List<QcSample> samples;
  final int days;
  final String heroLabel, heroFooter;

  /// Empty-state copy. Null falls back to the CC (VMCC receipts) wording —
  /// other callers (VMCC farmer QC, VMCC daily QC) always override both.
  final String? emptyTitle, emptySubtitle;

  /// Bands + the node's effective milk type colour the daily FAT/SNF cells
  /// (these are qty-weighted, mixed-type aggregates). Null → no colouring.
  final QualityBands? bands;
  final MilkType? milkType;

  @override
  Widget build(BuildContext context) {
    final t = DT(context);
    final l = AppLocalizations.of(context);
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
              title: emptyTitle ?? l.ccQcReportEmptyTitle,
              subtitle: emptySubtitle ?? l.ccQcReportEmptySubtitle),
        ] else ...[
          const SizedBox(height: DhenuSpacing.lg),
          Text(l.ccQcReportTrendsLabel, style: DhenuText.label.copyWith(color: t.inkSoft)),
          const SizedBox(height: DhenuSpacing.sm),
          _trendStrip(context, t, l, daily),
          const SizedBox(height: DhenuSpacing.lg),
          Text(l.ccQcReportDailyQualityLabel,
              style: DhenuText.label.copyWith(color: t.inkSoft)),
          const SizedBox(height: DhenuSpacing.sm),
          _dailyTable(t, l, daily),
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

  Widget _dailyTable(DhenuTokens t, AppLocalizations l, List<_DayQc> days) {
    final rows = days.where((d) => d.qty > 0).toList().reversed.toList();
    return DhenuCard(
      padding: EdgeInsets.zero,
      child: Column(children: [
        _tableHeader(t, l),
        for (final r in rows) ...[
          Divider(height: 1, color: t.hairline),
          _dayRow(t, r),
        ],
      ]),
    );
  }

  Widget _tableHeader(DhenuTokens t, AppLocalizations l) {
    final s = DhenuText.caption.copyWith(color: t.inkSoft, letterSpacing: 0.6);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: DhenuSpacing.lg, vertical: DhenuSpacing.sm),
      child: Row(children: [
        Expanded(flex: 4, child: Text(l.ccQcReportDateHeader, style: s)),
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
          Expanded(flex: 2, child: _qcCell(t, 'water', d.water)),
        ]),
      );

  Widget _qcCell(DhenuTokens t, String metric, double? v) {
    // Water has no configurable band — it is scored on its own descending
    // scale, so it colours even where FAT/SNF can't (no bands / mixed type).
    final banded = metric == 'water'
        ? QualityBadge.waterColor(v, t)
        : QualityBadge.bandColor(bands, milkType, metric, v, t);
    return Text(
      v == null ? '—' : oneDp(v),
      textAlign: TextAlign.right,
      style: DhenuText.number(size: 14, color: v == null ? t.inkSoft : (banded ?? t.ink)),
    );
  }

  /// FAT / SNF / Water trend cards laid side-by-side in a horizontal scroller —
  /// each ~82% of the width so the next card peeks, signalling more to swipe.
  Widget _trendStrip(BuildContext context, DhenuTokens t, AppLocalizations l, List<_DayQc> daily) {
    final cardW = (MediaQuery.sizeOf(context).width - DhenuSpacing.screen * 2) * 0.82;
    Widget card(String title, String? metric, Color color, double? Function(_DayQc) sel) =>
        SizedBox(width: cardW, child: _chartCard(t, l, title, '%', metric, color, daily, sel));
    return SizedBox(
      height: 232,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: EdgeInsets.zero,
        clipBehavior: Clip.none,
        children: [
          card('FAT', 'fat', t.brand, (d) => d.fat),
          const SizedBox(width: DhenuSpacing.md),
          card('SNF', 'snf', t.am, (d) => d.snf),
          const SizedBox(width: DhenuSpacing.md),
          card('Water', 'water', t.pm, (d) => d.water),
        ],
      ),
    );
  }

  /// Per-day vertical bar chart of the metric's daily qty-weighted value.
  Widget _chartCard(DhenuTokens t, AppLocalizations l, String title, String unit,
      String? metric, Color color, List<_DayQc> days, double? Function(_DayQc) sel) {
    // Days with no reading stay in the series as nulls: the line breaks over
    // them rather than joining across, so a centre that skipped a day doesn't
    // read as a smooth trend through it.
    final points = [for (final d in days) (_pointLabel(d.date), sel(d))];
    // Water's zones are fixed and run downwards (less is better); FAT/SNF read
    // their configured band and run upwards.
    final descending = metric == 'water';
    final band = descending
        ? const QualityBand(goodMin: kWaterGoodMax, watchMin: kWaterWatchMax)
        : ((metric == null || bands == null || milkType == null)
            ? null
            : bands!.bandFor(milkType!, metric));
    return DhenuCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('$title  ($unit)',
            style: DhenuText.label.copyWith(color: color, letterSpacing: 0.6)),
        const SizedBox(height: DhenuSpacing.md),
        if (points.every((p) => p.$2 == null))
          SizedBox(
            height: 100,
            child: Center(child: Text(l.ccQcReportNoReadings,
                style: DhenuText.caption.copyWith(color: t.inkSoft))),
          )
        else
          SizedBox(
            height: 165,
            width: double.infinity,
            child: CustomPaint(
              painter: _QcLinePainter(
                points: points,
                color: color,
                label: t.inkSoft,
                band: band,
                descending: descending,
                good: t.gradeA,
                watch: t.gradeB,
                low: t.gradeC,
              ),
            ),
          ),
      ]),
    );
  }

  /// Compact x-axis label — the day-of-month number.
  String _pointLabel(String iso) {
    final d = iso.length >= 10 ? iso.substring(8, 10) : iso;
    return int.tryParse(d)?.toString() ?? d;
  }
}

/// Per-day QC trend as a line over shaded quality bands.
///
/// A line, not bars, because these are narrow-range percentages: FAT lives
/// around 3–4.5 and SNF around 7–8.5, so a zero-baselined bar spends most of
/// its height on range no reading ever visits, and a move that changes what the
/// milk is worth barely changes the bar. The y-axis here spans only the data,
/// which is what makes a day-to-day shift visible at all.
///
/// Missing days are nulls in [points], and the line breaks over them — joining
/// across a day nobody collected would draw a trend through evidence that
/// doesn't exist. A reading with no neighbour on either side gets a dot, so an
/// isolated day still shows up rather than vanishing for want of a segment.
class _QcLinePainter extends CustomPainter {
  _QcLinePainter({
    required this.points,
    required this.color,
    required this.label,
    required this.band,
    required this.descending,
    required this.good,
    required this.watch,
    required this.low,
  });

  /// (x-axis label, value) per day in the window; null value = no reading.
  final List<(String, double?)> points;
  final Color color, label;

  /// The metric's thresholds, drawn as zones behind the line. Null for an
  /// unconfigured type.
  final QualityBand? band;

  /// True when lower is better (water): the good zone sits below [QualityBand
  /// .goodMin] and low above [QualityBand.watchMin], the reverse of FAT/SNF.
  final bool descending;
  final Color good, watch, low;

  static const _topPad = 18.0, _bottomPad = 16.0, _leftPad = 30.0;

  @override
  void paint(Canvas canvas, Size size) {
    final values = [for (final p in points) if (p.$2 != null) p.$2!];
    if (values.isEmpty) return;
    final baseY = size.height - _bottomPad;
    final plot = Rect.fromLTRB(_leftPad, _topPad, size.width, baseY);
    if (plot.height <= 0 || plot.width <= 0) return;

    // Scale to the readings, not to zero. A flat series still needs a band of
    // room or the line would sit on the frame edge.
    final lo = values.reduce(math.min), hi = values.reduce(math.max);
    final span = hi - lo;
    final pad = span > 0 ? span * 0.12 : 0.3;
    final yLo = lo - pad, yHi = hi + pad;
    double yOf(double v) => plot.bottom - ((v - yLo) / (yHi - yLo)) * plot.height;

    _paintBands(canvas, plot, yOf, yLo, yHi);
    _paintAxis(canvas, plot, yLo, yHi);
    _paintLine(canvas, plot, yOf);
  }

  /// Good / watch / low as horizontal zones, clipped to what the axis shows. A
  /// threshold outside the window simply leaves the view in one zone — which is
  /// the true reading: every day in range sat on the same side of it.
  void _paintBands(Canvas canvas, Rect plot, double Function(double) yOf, double yLo, double yHi) {
    final b = band;
    if (b == null) return;
    void zone(double from, double to, Color c) {
      final top = math.max(plot.top, yOf(math.min(to, yHi)));
      final bottom = math.min(plot.bottom, yOf(math.max(from, yLo)));
      if (bottom - top <= 0.5) return;
      canvas.drawRect(Rect.fromLTRB(plot.left, top, plot.right, bottom),
          Paint()..color = c.withValues(alpha: 0.13));
    }

    if (descending) {
      zone(yLo, b.goodMin, good);
      zone(b.goodMin, b.watchMin, watch);
      zone(b.watchMin, yHi, low);
    } else {
      zone(b.goodMin, yHi, good);
      zone(b.watchMin, b.goodMin, watch);
      zone(yLo, b.watchMin, low);
    }
    // The boundaries themselves, so "just above" and "just below" are legible.
    for (final (v, c) in [(b.goodMin, good), (b.watchMin, watch)]) {
      if (v <= yLo || v >= yHi) continue;
      final y = yOf(v);
      canvas.drawLine(Offset(plot.left, y), Offset(plot.right, y),
          Paint()..color = c.withValues(alpha: 0.45)..strokeWidth = 1);
    }
  }

  /// Min/max of the visible range on the left. Without them a scale that no
  /// longer starts at zero would be unreadable — which is the trade the line
  /// makes for showing the movement at all.
  void _paintAxis(Canvas canvas, Rect plot, double yLo, double yHi) {
    _text(canvas, yHi.toStringAsFixed(1), _leftPad - 4, plot.top - 5, label, 9,
        align: TextAlign.right);
    _text(canvas, yLo.toStringAsFixed(1), _leftPad - 4, plot.bottom - 5, label, 9,
        align: TextAlign.right);
  }

  void _paintLine(Canvas canvas, Rect plot, double Function(double) yOf) {
    final n = points.length;
    final step = n > 1 ? plot.width / (n - 1) : 0.0;
    double xOf(int i) => n > 1 ? plot.left + i * step : plot.center.dx;
    final showLabels = n <= 12;
    final showDots = n <= 14;
    final stroke = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    final dot = Paint()..color = color;

    Path? run;
    for (var i = 0; i < n; i++) {
      final v = points[i].$2;
      if (v == null) {
        if (run != null) canvas.drawPath(run, stroke);
        run = null;
        continue;
      }
      final o = Offset(xOf(i), yOf(v));
      if (run == null) {
        run = Path()..moveTo(o.dx, o.dy);
      } else {
        run.lineTo(o.dx, o.dy);
      }
      // A day whose neighbours are both missing draws no segment, so it needs a
      // mark of its own or the reading disappears.
      final orphan = (i == 0 || points[i - 1].$2 == null) &&
          (i == n - 1 || points[i + 1].$2 == null);
      if (showDots || orphan) canvas.drawCircle(o, orphan ? 3 : 2.5, dot);
      if (showLabels) {
        _text(canvas, v.toStringAsFixed(1), o.dx, o.dy - 15, color, 10);
        _text(canvas, points[i].$1, o.dx, plot.bottom + 3, label, 9);
      }
    }
    if (run != null) canvas.drawPath(run, stroke);
  }

  void _text(Canvas canvas, String s, double cx, double y, Color col, double fontSize,
      {TextAlign align = TextAlign.center}) {
    final tp = TextPainter(
      text: TextSpan(text: s,
          style: TextStyle(color: col, fontSize: fontSize, fontWeight: FontWeight.w600)),
      textDirection: TextDirection.ltr,
    )..layout();
    final dx = align == TextAlign.right ? cx - tp.width : cx - tp.width / 2;
    tp.paint(canvas, Offset(dx, y));
  }

  @override
  bool shouldRepaint(covariant _QcLinePainter old) =>
      old.points != points || old.color != color || old.band != band ||
      old.descending != descending;
}
