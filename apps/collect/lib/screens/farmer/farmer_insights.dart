import '../../api/mp_models.dart';

/// Pure, unit-tested farmer-insight maths (no Flutter deps):
///   • P3.2 earnings projection — run-rate the cycle's earnings to its end.
///   • P3.3 rate coaching — what one quality step up is worth, in ₹/L and ₹/day.
/// Both consume data the farmer screens already load (cycle pours, rate cells),
/// so there's no new API surface.

/// Earnings projection for the current (in-progress) cycle window.
class CycleProjection {
  final double earnedSoFar; // ₹ from recorded pours so far this window
  final double qtySoFar; // litres so far
  final int daysElapsed; // inclusive days windowStart..today
  final int daysTotal; // inclusive days windowStart..windowEnd
  final double projectedGross; // run-rate projection of earnings to window end

  const CycleProjection({
    required this.earnedSoFar,
    required this.qtySoFar,
    required this.daysElapsed,
    required this.daysTotal,
    required this.projectedGross,
  });

  /// Only worth surfacing mid-cycle: some history, and days left to project into.
  bool get isProjectable =>
      qtySoFar > 0 && daysElapsed > 0 && daysTotal > daysElapsed;
}

/// Run-rate the farmer's earnings across the cycle window. [windowStart]/
/// [windowEnd] are inclusive `yyyy-MM-dd`; [today] is clamped into the window.
CycleProjection projectCycleEarnings({
  required List<MpPour> pours,
  required String windowStart,
  required String windowEnd,
  required DateTime today,
}) {
  final earned = pours.fold<double>(0, (s, p) => s + p.lineAmount);
  final qty = pours.fold<double>(0, (s, p) => s + p.qtyLitres);
  final start = DateTime.parse(windowStart);
  final end = DateTime.parse(windowEnd);
  final t = _dateOnly(today);
  final clamped = t.isAfter(end) ? end : (t.isBefore(start) ? start : t);
  final daysElapsed = clamped.difference(start).inDays + 1;
  final daysTotal = end.difference(start).inDays + 1;
  final projected = daysElapsed > 0 ? earned / daysElapsed * daysTotal : earned;
  return CycleProjection(
    earnedSoFar: earned,
    qtySoFar: qty,
    daysElapsed: daysElapsed,
    daysTotal: daysTotal,
    projectedGross: projected,
  );
}

/// The farmer's average daily volume over [pours] (total litres ÷ distinct
/// collection days). Drives the ₹/day figures in rate coaching; 0 when no pours.
double averageDailyQty(List<MpPour> pours) {
  if (pours.isEmpty) return 0;
  final days = pours.map((p) => p.collectionDate).toSet().length;
  if (days == 0) return 0;
  final qty = pours.fold<double>(0, (s, p) => s + p.qtyLitres);
  return qty / days;
}

/// What stepping up one FAT/SNF breakpoint is worth, vs the farmer's current
/// position on the matrix. Mirrors the server's nearest-floor pricing so the
/// "current rate" equals what they're actually paid.
class RateCoaching {
  final double currentRate;
  final double? nextSnf, snfDeltaPerLitre, snfDailyGain;
  final double? nextFat, fatDeltaPerLitre, fatDailyGain;

  const RateCoaching({
    required this.currentRate,
    this.nextSnf,
    this.snfDeltaPerLitre,
    this.snfDailyGain,
    this.nextFat,
    this.fatDeltaPerLitre,
    this.fatDailyGain,
  });

  /// True when at least one axis offers a positive ₹/L gain to coach toward.
  bool get hasAny =>
      (snfDeltaPerLitre != null && snfDeltaPerLitre! > 0.001) ||
      (fatDeltaPerLitre != null && fatDeltaPerLitre! > 0.001);
}

/// Coaching deltas for matrix charts. Returns null for empty/flat charts or
/// when the current position can't be priced (e.g. below the lowest cell).
RateCoaching? computeRateCoaching({
  required List<MpRateCell> cells,
  required double curFat,
  required double curSnf,
  required double dailyQty,
}) {
  if (cells.isEmpty) return null;
  final floor = _floorCell(cells, curFat, curSnf);
  if (floor == null) return null;
  final currentRate = floor.ratePerLitre;

  final snfVals = cells.map((c) => c.snf).toSet().toList()..sort();
  final fatVals = cells.map((c) => c.fat).toSet().toList()..sort();

  double? nextSnf, snfDelta, snfGain, nextFat, fatDelta, fatGain;

  final upSnf = snfVals.where((s) => s > floor.snf + 1e-9).toList();
  if (upSnf.isNotEmpty) {
    nextSnf = upSnf.first;
    final rate = _floorRate(cells, floor.fat, nextSnf);
    if (rate != null && rate > currentRate) {
      snfDelta = rate - currentRate;
      snfGain = snfDelta * dailyQty;
    } else {
      nextSnf = null; // no gain at this step — don't coach toward it
    }
  }

  final upFat = fatVals.where((f) => f > floor.fat + 1e-9).toList();
  if (upFat.isNotEmpty) {
    nextFat = upFat.first;
    final rate = _floorRate(cells, nextFat, floor.snf);
    if (rate != null && rate > currentRate) {
      fatDelta = rate - currentRate;
      fatGain = fatDelta * dailyQty;
    } else {
      nextFat = null;
    }
  }

  return RateCoaching(
    currentRate: currentRate,
    nextSnf: nextSnf,
    snfDeltaPerLitre: snfDelta,
    snfDailyGain: snfGain,
    nextFat: nextFat,
    fatDeltaPerLitre: fatDelta,
    fatDailyGain: fatGain,
  );
}

/// Nearest-floor cell (largest fat ≤ curFat and snf ≤ curSnf) — matches the
/// server's `matrixRate` so the priced rate is what the farmer actually earns.
MpRateCell? _floorCell(List<MpRateCell> cells, double fat, double snf) {
  final candidates =
      cells.where((c) => c.fat <= fat + 1e-9 && c.snf <= snf + 1e-9).toList();
  if (candidates.isEmpty) return null;
  candidates.sort((a, b) {
    final byFat = b.fat.compareTo(a.fat);
    return byFat != 0 ? byFat : b.snf.compareTo(a.snf);
  });
  return candidates.first;
}

double? _floorRate(List<MpRateCell> cells, double fat, double snf) =>
    _floorCell(cells, fat, snf)?.ratePerLitre;

/// A week-over-week shift in the farmer's milk quality (P3.1). [delta] is signed
/// (recent − prior); [improved] is delta > 0.
class QualityNudge {
  final String metric; // 'FAT' | 'SNF'
  final bool improved;
  final double delta; // signed change in the metric
  final double recentAvg, priorAvg;

  const QualityNudge({
    required this.metric,
    required this.improved,
    required this.delta,
    required this.recentAvg,
    required this.priorAvg,
  });
}

/// The most significant FAT/SNF shift between the last 7 days and the prior 7,
/// or null if neither moved past [threshold]. Each window needs ≥ [minReadings]
/// readings to avoid reacting to a single outlier. CLR-only (lactometer) nodes
/// carry no fat/snf, so they simply yield no nudge.
QualityNudge? detectQualityNudge({
  required List<MpPour> pours,
  required DateTime today,
  double threshold = 0.2,
  int minReadings = 2,
}) {
  final t = _dateOnly(today);
  final recentStart = t.subtract(const Duration(days: 6)); // last 7 days incl. today
  final priorStart = t.subtract(const Duration(days: 13));
  final priorEnd = t.subtract(const Duration(days: 7));

  List<double> readings(double? Function(MpPour) sel, DateTime from, DateTime to) {
    final out = <double>[];
    for (final p in pours) {
      final d = DateTime.tryParse(p.collectionDate);
      if (d == null) continue;
      final day = _dateOnly(d);
      if (day.isBefore(from) || day.isAfter(to)) continue;
      final v = sel(p);
      if (v != null) out.add(v);
    }
    return out;
  }

  double mean(List<double> xs) => xs.reduce((a, b) => a + b) / xs.length;

  final metrics = <(String, double? Function(MpPour))>[
    ('FAT', (p) => p.fat),
    ('SNF', (p) => p.snf),
  ];
  QualityNudge? best;
  for (final m in metrics) {
    final recent = readings(m.$2, recentStart, t);
    final prior = readings(m.$2, priorStart, priorEnd);
    if (recent.length < minReadings || prior.length < minReadings) continue;
    final rAvg = mean(recent), pAvg = mean(prior);
    final delta = rAvg - pAvg;
    if (delta.abs() < threshold) continue;
    if (best == null || delta.abs() > best.delta.abs()) {
      best = QualityNudge(
        metric: m.$1, improved: delta > 0, delta: delta, recentAvg: rAvg, priorAvg: pAvg);
    }
  }
  return best;
}

/// Quality streak: consecutive *recorded* days, counting back from the most
/// recent pour date, where every pour that day was Grade A. Calendar gaps
/// between recorded days don't break the chain. Single source for the Home
/// nudge ring and the Rewards ring/badges (over farmerStreakPoursProvider).
int computeStreak(List<MpPour> pours) {
  if (pours.isEmpty) return 0;
  final byDate = <String, List<MpPour>>{};
  for (final p in pours) {
    byDate.putIfAbsent(p.collectionDate, () => []).add(p);
  }
  final sortedDates = byDate.keys.toList()..sort((a, b) => b.compareTo(a));
  var streak = 0;
  for (final date in sortedDates) {
    if (!byDate[date]!.every((p) => p.qualityGrade == Grade.a)) break;
    streak++;
  }
  return streak;
}

DateTime _dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);
